/**
 * @file SyncService.gs
 * @description Syncs the Families and Cubs tabs based on the local Master tab.
 *              The Master tab itself is assumed to be populated via IMPORTRANGE.
 *
 * Accuracy Principles:
 *  - Cub ID is the single source of truth.
 *  - No silent failures: If an external sheet fetch fails, the entire sync is aborted.
 *  - Bulk Operations: Reads and writes are batched in memory to execute in O(1) API calls.
 *  - Safe Resume: Large datasets are chunked and resumed via time-based triggers.
 */

/* eslint-disable no-unused-vars */

const RESUME_STATE_KEY = 'SYNC_RESUME_STATE';

/** @typedef {{ lastProcessedRow: number, processedCount: number, savedAt: string }} ResumeState */

function _saveResumeState(lastProcessedRow, processedCount) {
  PropertiesService.getScriptProperties().setProperty(
    RESUME_STATE_KEY,
    JSON.stringify({ lastProcessedRow, processedCount, savedAt: new Date().toISOString() })
  );
}

function _loadResumeState() {
  const raw = PropertiesService.getScriptProperties().getProperty(RESUME_STATE_KEY);
  return raw ? JSON.parse(raw) : { lastProcessedRow: 1, processedCount: 0, savedAt: null };
}

function _clearResumeState() {
  PropertiesService.getScriptProperties().deleteProperty(RESUME_STATE_KEY);
}

/**
 * Trigger handler for the daily 6:00 AM sync.
 * IMPORTANT: enrichment data is fetched BEFORE acquiring the lock to avoid
 * holding the script lock during slow external spreadsheet reads (10-30s each).
 * The lock is held only for the local write phase.
 */
function runDailySync() {
  const start = Date.now();
  const logs = [];
  let status = 'SUCCESS';

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tz = Session.getScriptTimeZone();

    // Step 1 (outside lock): fetch enrichment from external sheets
    const enrichment = _fetchEnrichmentData(tz);

    // Step 2 (inside lock): update overdue statuses and run the write phase
    _withScriptLock(() => {
      _updateOverdueActionsStatus(ss, logs);
      _runIncrementalSync(logs, true, enrichment);
    });
  } catch (err) {
    status = 'ERROR';
    logs.push(`error:${err.message}`);
    console.error(err);
  } finally {
    writeLog(status, logs, Date.now() - start);
  }
}

/**
 * Background trigger for resuming a sync that paused.
 * Fetches enrichment BEFORE acquiring the lock (same pattern as runDailySync).
 */
function _resumeSyncTrigger() {
  const start = Date.now();
  const logs = ['resume_triggered'];
  let status = 'SUCCESS';

  try {
    const tz = Session.getScriptTimeZone();

    // Step 1 (outside lock): fetch enrichment
    const enrichment = _fetchEnrichmentData(tz);

    // Step 2 (inside lock): write phase
    _withScriptLock(() => {
      const isComplete = _runIncrementalSync(logs, true, enrichment);
      if (isComplete) {
        ScriptApp.getProjectTriggers()
          .filter(t => t.getHandlerFunction() === '_resumeSyncTrigger')
          .forEach(t => ScriptApp.deleteTrigger(t));
      }
    });
  } catch (err) {
    status = 'ERROR';
    logs.push(`error:${err.message}`);
    console.error(err);
  } finally {
    writeLog(status, logs, Date.now() - start);
  }
}

/**
 * Manual sync entry point triggered from the Sheets menu.
 * Fetches enrichment BEFORE acquiring the lock (same pattern as runDailySync).
 */
function syncContacts() {
  if (CONFIG.DRY_RUN) {
    writeLog('INFO', 'DRY_RUN enabled. Sync aborted.');
    SpreadsheetApp.getActiveSpreadsheet().toast('Dry run enabled. See Logs tab.', CONFIG.MENU_NAME);
    return;
  }

  const ui = SpreadsheetApp.getUi();
  const start = Date.now();
  const logs = [];
  let status = 'SUCCESS';

  try {
    const tz = Session.getScriptTimeZone();

    // Step 1 (outside lock): fetch enrichment from external sheets
    const enrichment = _fetchEnrichmentData(tz);

    // Step 2 (inside lock): write phase
    _withScriptLock(() => {
      _clearResumeState();
      const isComplete = _runIncrementalSync(logs, false, enrichment);
      if (isComplete) {
        ui.alert('Contact Sync completed successfully.');
      } else {
        ui.alert('Sync is processing a large dataset. A background job has been scheduled to complete it safely.');
      }
    });
  } catch (err) {
    status = 'ERROR';
    logs.push(`error:${err.message}`);
    console.error(err);
    if (ui) ui.alert(`Sync failed: ${err.message}`);
  } finally {
    writeLog(status, logs, Date.now() - start);
  }
}

/**
 * Core incremental sync write phase.
 * Enrichment data is pre-fetched by the caller (outside the lock) and
 * passed in as the third argument. This keeps the lock-held window
 * as short as possible — only local sheet reads/writes happen inside the lock.
 * @param {string[]} logs
 * @param {boolean} isBackground
 * @param {Object} enrichment - Pre-fetched enrichment maps from _fetchEnrichmentData()
 * @returns {boolean} True if completed in this run, false if scheduled for next run.
 */
function _runIncrementalSync(logs, isBackground, enrichment) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── Mirror external Master data into local Master tab ─────────────────────
  // masterDataRows was fetched from B2 (outside the lock) and is passed in here.
  // We always do a full overwrite so the local tab stays in sync with the source.
  if (enrichment.masterDataRows && enrichment.masterDataRows.length > 0) {
    const mirrorSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.MASTER.NAME, CONFIG.SHEETS.MASTER.HEADERS);
    const lastDataRow = mirrorSheet.getLastRow();
    if (lastDataRow > 1) {
      mirrorSheet.getRange(2, 1, lastDataRow - 1, mirrorSheet.getLastColumn()).clearContent();
    }
    const numMasterCols = Math.max(
      enrichment.masterDataRows[0].length,
      CONFIG.SHEETS.MASTER.HEADERS.length
    );
    mirrorSheet.getRange(2, 1, enrichment.masterDataRows.length, numMasterCols)
               .setValues(enrichment.masterDataRows);
    logs.push(`master_mirrored:${enrichment.masterDataRows.length}_rows`);
  }

  const masterSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.MASTER.NAME, CONFIG.SHEETS.MASTER.HEADERS);
  const mCols = _validateSchema(masterSheet, CONFIG.SHEETS.MASTER.HEADERS);
  const totalRows = _getTrueLastRow(masterSheet);

  if (totalRows <= 1) {
    logs.push('no_data_rows');
    _clearResumeState();
    return true;
  }

  const state = _loadResumeState();
  let startRow = Math.max(state.lastProcessedRow + 1, 2);

  if (startRow > totalRows) {
    _clearResumeState();
    logs.push('already_complete');
    return true;
  }

  const maxRowsPerRun = CONFIG.MAX_ROWS_PER_RUN || 2000;
  const endRow = Math.min(startRow + maxRowsPerRun - 1, totalRows);
  const numRows = endRow - startRow + 1;
  
  const masterData = masterSheet.getRange(startRow, 1, numRows, masterSheet.getLastColumn()).getValues();
  const validMasterRows = masterData.filter(row => String(row[mCols[CONFIG.COLS.CUB_ID]]).trim() !== '');

  logs.push(`processing_rows:${startRow}-${endRow}`);

  if (validMasterRows.length > 0) {
    const tz = Session.getScriptTimeZone();
    // enrichment was pre-fetched outside the lock by the caller
    const isFirstRun = (startRow === 2);
    const isFinalRun = (endRow >= totalRows);

    _syncFamiliesBulk(ss, validMasterRows, mCols, isFirstRun, isFinalRun);
    _syncCubsBulk(ss, validMasterRows, mCols, enrichment, tz, isFirstRun, isFinalRun);
  } else {
    logs.push(`skipped_batch:no_valid_ids`);
  }

  _saveResumeState(endRow, state.processedCount + validMasterRows.length);
  _bustAllDashboardCaches();

  if (endRow >= totalRows) {
    _clearResumeState();
    logs.push(`batch_complete:all_rows_processed`);
    _bustSearchCacheOnly(); // Master data changed — refresh search index cache
    
    // Sync Reps to local Config tab Col D
    try {
      _syncRepsFromMasterCore(ss);
      logs.push(`reps_synced`);
    } catch(e) {
      logs.push(`reps_sync_failed:${e.message}`);
    }
    
    return true;
  } else {
    logs.push(`remaining:${totalRows - endRow}`);
    ScriptApp.getProjectTriggers()
      .filter(t => t.getHandlerFunction() === '_resumeSyncTrigger')
      .forEach(t => ScriptApp.deleteTrigger(t));
      
    ScriptApp.newTrigger('_resumeSyncTrigger')
      .timeBased()
      .after(60 * 1000)
      .create();
      
    return false;
  }
}

  // ═══════════════════════════════════════════════════════════════
// SYNC HELPERS 
  // ═══════════════════════════════════════════════════════════════

function _formatCellDate_(val, tz) {
  if (val === null || val === undefined || val === '') return '';
  if (Object.prototype.toString.call(val) === '[object Date]') {
    if (isNaN(val.getTime())) return '';
    return Utilities.formatDate(val, tz, 'dd-MMM-yyyy');
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, 'dd-MMM-yyyy');
  return String(val).trim();
}

function _safeStr_(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  if (s === 'undefined' || s === 'null' || s === 'NaN') return '';
  return s;
}

function _buildColIdx_(headerRow) {
  const idx = {};
  headerRow.forEach((h, i) => {
    const clean = String(h).trim();
    if (clean) idx[clean] = i;
  });
  return idx;
}

function _missingCols_(colIdx, required) {
  return required.filter(col => colIdx[col] === undefined);
}

  // ═══════════════════════════════════════════════════════════════
// DATA FETCHING (NO SILENT FAILURES)
  // ═══════════════════════════════════════════════════════════════

function _fetchEnrichmentData(tz) {
  const registryMap = new Map();
  const scoreMap = new Map();

  // Config tab lives in the active (CERO Tracker) spreadsheet
  const activeSS = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = _getSheetOrThrow(CONFIG.PARENT_CONFIG_TAB, activeSS);

  // ── 1. Master Source (B2) ──────────────────────────────────────────────────
  // Open the external spreadsheet, read its Master tab, and return the raw rows.
  // These are written to the local Master tab inside the lock in _runIncrementalSync.
  const masterSourceUrl = _safeStr_(configSheet.getRange(CONFIG.PARENT_CONFIG_MASTER_SOURCE_CELL).getValue());
  if (!masterSourceUrl) throw new Error('Cell B2 of Config tab is empty — paste your Master Source spreadsheet URL there.');

  let masterSourceSS;
  try {
    masterSourceSS = SpreadsheetApp.openByUrl(masterSourceUrl);
  } catch (e) {
    throw new Error(`Failed to open Master Source spreadsheet: ${e.message}`);
  }

  const extMasterSheet = _getSheetOrThrow(CONFIG.SHEETS.MASTER.NAME, masterSourceSS);
  const extMasterData  = extMasterSheet.getDataRange().getValues();
  // Row 0 = headers; rows 1+ = data
  const masterDataRows = extMasterData.length > 1 ? extMasterData.slice(1) : [];

  // ── 2. Registry + Score Calendar (B3) ─────────────────────────────────────
  // Both tabs live in the same external spreadsheet.
  const registryUrl = _safeStr_(configSheet.getRange(CONFIG.PARENT_CONFIG_REGISTRY_CELL).getValue());
  if (!registryUrl) throw new Error('Cell B3 of Config tab is empty — paste your Cubs Registry & Score Calendar spreadsheet URL there.');

  let registrySS;
  try {
    registrySS = SpreadsheetApp.openByUrl(registryUrl);
  } catch (e) {
    throw new Error(`Failed to open Registry spreadsheet: ${e.message}`);
  }

  // Cubs Registry tab (leagues, streaks, medallion, etc.)
  const regSheet = _getSheetOrThrow(CONFIG.SOURCE_CUBS_REGISTRY_TAB, registrySS);
  const regData = regSheet.getDataRange().getValues();
  if (regData.length >= 2) {
    const regColIdx = _buildColIdx_(regData[0]);
    const missing = _missingCols_(regColIdx, [CONFIG.REGISTRY_COLS.CUB_ID]);
    if (missing.length > 0) throw new Error(`Cubs Registry missing column(s): [${missing.join(', ')}]`);
    
    for (let i = 1; i < regData.length; i++) {
      const id = _safeStr_(regData[i][regColIdx[CONFIG.REGISTRY_COLS.CUB_ID]]);
      if (!id) continue;
      const entry = {};
      Object.values(CONFIG.REGISTRY_COLS).forEach(colName => {
        const ci = regColIdx[colName];
        entry[colName] = ci !== undefined ? _safeStr_(regData[i][ci]) : '';
      });
      registryMap.set(id, entry);
    }
  }

  // Score Calendar tab (cub IDs + points grid) — same B3 spreadsheet
  const scSheet = _getSheetOrThrow(CONFIG.SOURCE_SCORE_CALENDAR_TAB, registrySS);
  const scData = scSheet.getDataRange().getValues();
  if (scData.length >= 2) {
    const headerRow = scData[0];
    const scColIdx = _buildColIdx_(headerRow);
    let idColIdx = scColIdx[CONFIG.REGISTRY_COLS.CUB_ID];
    
    if (idColIdx === undefined) {
      if (headerRow[0] && isNaN(new Date(headerRow[0]).getTime())) {
        idColIdx = 0;
      } else {
        throw new Error(`Score Calendar: cannot resolve Cub ID column.`);
      }
    }

    for (let i = 1; i < scData.length; i++) {
      const row = scData[i];
      const id = _safeStr_(row[idColIdx]);
      if (!id) continue;

      let weeklyPoints = 0;
      const maxCols = row.length;
      const weekStartIdx = Math.max(idColIdx + 1, maxCols - 7);
      for (let j = weekStartIdx; j < maxCols; j++) {
        const n = parseFloat(row[j]);
        if (!isNaN(n) && n > 0) weeklyPoints += n;
      }

      let lastReadingDate = '';
      for (let j = maxCols - 1; j > idColIdx; j--) {
        const n = parseFloat(row[j]);
        if (!isNaN(n) && n >= 1) {
          lastReadingDate = _formatCellDate_(headerRow[j], tz);
          break;
        }
      }

      scoreMap.set(id, {
        'Cumulative Weekly Points': weeklyPoints,
        'Last Reading Activity': lastReadingDate,
      });
    }
  }

  // 3. Reading Circle (Local)
  try {
    const rcSheet = _getSheetOrThrow(CONFIG.SHEETS.READING_CIRCLE.NAME, SpreadsheetApp.getActiveSpreadsheet());
    const rcData = rcSheet.getDataRange().getValues();
    if (rcData.length >= 2) {
      const rcColIdx = _buildColIdx_(rcData[0]);
      const reqCols = [CONFIG.RC_COLS.CUB_ID, CONFIG.RC_COLS.RC_CATEGORY, CONFIG.RC_COLS.NO_PRESENT, CONFIG.RC_COLS.LAST_ATTENDANCE_DATE];
      const missing = _missingCols_(rcColIdx, reqCols);
      if (missing.length > 0) throw new Error(`Local Reading Circle missing column(s): [${missing.join(', ')}]`);
      
      const idIdx = rcColIdx[CONFIG.RC_COLS.CUB_ID];
      const catIdx = rcColIdx[CONFIG.RC_COLS.RC_CATEGORY];
      const presentIdx = rcColIdx[CONFIG.RC_COLS.NO_PRESENT];
      const attendIdx = rcColIdx[CONFIG.RC_COLS.LAST_ATTENDANCE_DATE];

      for (let i = 1; i < rcData.length; i++) {
        const row = rcData[i];
        const id = _safeStr_(row[idIdx]);
        if (!id) continue;

        if (registryMap.has(id)) {
          const existing = registryMap.get(id);
          existing['Reading Circle Category'] = _safeStr_(row[catIdx]);
          existing['No. Present'] = _safeStr_(row[presentIdx]);
          existing['Last Attendance Date'] = _formatCellDate_(row[attendIdx], tz);
        }
      }
    }
  } catch (e) {
    console.warn('Could not enrich from local Reading Circle:', e.message);
  }

  // 4. Orientation Tracker (Local)
  const orientationMap = new Map();
  try {
    const orientSheet = _getSheetOrThrow(CONFIG.SHEETS.ORIENTATION.NAME, SpreadsheetApp.getActiveSpreadsheet());
    const orientData = orientSheet.getDataRange().getValues();
    if (orientData.length >= 2) {
      const oColIdx = _buildColIdx_(orientData[0]);
      const oReqCols = [CONFIG.ORIENTATION_LOCAL_COLS.CUB_ID];
      const oMissing = _missingCols_(oColIdx, oReqCols);
      if (oMissing.length > 0) throw new Error(`Local Orientation tab missing column(s): [${oMissing.join(', ')}]`);

      const oIdIdx     = oColIdx[CONFIG.ORIENTATION_LOCAL_COLS.CUB_ID];
      const oStageIdx  = oColIdx[CONFIG.ORIENTATION_LOCAL_COLS.STAGE];
      const oStatusIdx = oColIdx[CONFIG.ORIENTATION_LOCAL_COLS.STAGE_STATUS];
      const oNextIdx   = oColIdx[CONFIG.ORIENTATION_LOCAL_COLS.NEXT_STAGE];
      const oCompIdx   = oColIdx[CONFIG.ORIENTATION_LOCAL_COLS.COMPLETION_DATE];

      for (let i = 1; i < orientData.length; i++) {
        const row = orientData[i];
        const id = _safeStr_(row[oIdIdx]);
        if (!id) continue;
        orientationMap.set(id, {
          stage:          oStageIdx  !== undefined ? _safeStr_(row[oStageIdx])  : '',
          stageStatus:    oStatusIdx !== undefined ? _safeStr_(row[oStatusIdx]) : '',
          nextStage:      oNextIdx   !== undefined ? _safeStr_(row[oNextIdx])   : '',
          completionDate: oCompIdx   !== undefined ? _formatCellDate_(row[oCompIdx], tz) : '',
        });
      }
    }
  } catch (e) {
    console.warn('Could not enrich from local Orientation Tracker:', e.message);
  }

  return { masterDataRows, registryMap, scoreMap, orientationMap };
}

  // ═══════════════════════════════════════════════════════════════
// BULK WRITES (O(1) API CALLS)
  // ═══════════════════════════════════════════════════════════════

function _syncFamiliesBulk(ss, validMasterRows, mCols, isFirstRun, isFinalRun) {
  const familiesSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.FAMILIES.NAME, CONFIG.SHEETS.FAMILIES.HEADERS);
  const fCols = _validateSchema(familiesSheet, CONFIG.SHEETS.FAMILIES.HEADERS);
  const numCols = CONFIG.SHEETS.FAMILIES.HEADERS.length;
  
  const fData = familiesSheet.getDataRange().getValues();
  const fRows = fData.length > 1 ? fData.slice(1) : [];

  const cache = CacheService.getScriptCache();
  let seenFams = [];
  if (!isFirstRun) {
    try { seenFams = JSON.parse(cache.get('SEEN_FAMS') || '[]'); } catch(e){}
  }
  const seenFamsSet = new Set(seenFams);

  const familyMap = new Map();
  fRows.forEach(row => {
    const key = _safeStr_(row[fCols[CONFIG.FAMILY_COLS.PARENT_PHONE]]) || _safeStr_(row[fCols[CONFIG.FAMILY_COLS.PARENT_EMAIL]]).toLowerCase();
    if (key) {
      familyMap.set(key, {
        firstName: row[fCols[CONFIG.FAMILY_COLS.PARENT_FIRST_NAME]],
        lastName: row[fCols[CONFIG.FAMILY_COLS.PARENT_LAST_NAME]],
        email: row[fCols[CONFIG.FAMILY_COLS.PARENT_EMAIL]],
        phone: row[fCols[CONFIG.FAMILY_COLS.PARENT_PHONE]],
        whatsapp: row[fCols[CONFIG.FAMILY_COLS.PARENT_WHATSAPP]],
        rep: row[fCols[CONFIG.FAMILY_COLS.RELATIONSHIP_OWNER]],
        cubCount: isFirstRun ? 0 : parseInt(row[fCols[CONFIG.FAMILY_COLS.NO_CUBS]] || '0', 10),
      });
    }
  });

  validMasterRows.forEach(row => {
    const pPhone = _safeStr_(row[mCols[CONFIG.COLS.PARENT_PHONE]]);
    const pEmail = _safeStr_(row[mCols[CONFIG.COLS.PARENT_EMAIL]]).toLowerCase();
    const key = pPhone || pEmail;
    if (!key) return;

    seenFamsSet.add(key);

    if (!familyMap.has(key)) {
      familyMap.set(key, {
        firstName: _safeStr_(row[mCols[CONFIG.COLS.PARENT_FIRST_NAME]]),
        lastName:  _safeStr_(row[mCols[CONFIG.COLS.PARENT_LAST_NAME]]),
        email:     pEmail,
        phone:     pPhone,
        whatsapp:  _safeStr_(row[mCols[CONFIG.COLS.PARENT_WHATSAPP]]),
        rep:       _safeStr_(row[mCols[CONFIG.COLS.REP]]),
        cubCount:  1,
      });
    } else {
      familyMap.get(key).cubCount++;
    }
  });

  if (!isFinalRun) {
    try { cache.put('SEEN_FAMS', JSON.stringify(Array.from(seenFamsSet)), 600); } catch(e){}
  } else {
    cache.remove('SEEN_FAMS');
  }

  const outRows = [];
  const staleRanges = [];
  let rowIdx = 2;
  
  familyMap.forEach((fam, key) => {
    const rowObj = new Array(numCols).fill('');
    rowObj[fCols[CONFIG.FAMILY_COLS.PARENT_FIRST_NAME]]  = fam.firstName;
    rowObj[fCols[CONFIG.FAMILY_COLS.PARENT_LAST_NAME]]   = fam.lastName;
    rowObj[fCols[CONFIG.FAMILY_COLS.PARENT_EMAIL]]       = fam.email;
    rowObj[fCols[CONFIG.FAMILY_COLS.PARENT_PHONE]]       = fam.phone;
    rowObj[fCols[CONFIG.FAMILY_COLS.PARENT_WHATSAPP]]    = fam.whatsapp;
    rowObj[fCols[CONFIG.FAMILY_COLS.NO_CUBS]]            = fam.cubCount;
    rowObj[fCols[CONFIG.FAMILY_COLS.RELATIONSHIP_OWNER]] = fam.rep;
    
    outRows.push(rowObj);
    
    if (isFinalRun && !seenFamsSet.has(key)) {
      staleRanges.push(`A${rowIdx}:${String.fromCharCode(64 + numCols)}${rowIdx}`);
    }
    rowIdx++;
  });

  if (outRows.length > 0) {
    familiesSheet.getRange(2, 1, Math.max(familiesSheet.getLastRow(), outRows.length), numCols).clearContent();
    familiesSheet.getRange(2, 1, outRows.length, numCols).setValues(outRows);
  }
  
  familiesSheet.getRange(2, 1, Math.max(familiesSheet.getLastRow(), 2), numCols)
    .setBackground(null)
    .setFontLine('none');

  if (staleRanges.length > 0) {
    const rl = familiesSheet.getRangeList(staleRanges);
    rl.setBackground(CONFIG.REMOVED_ROW_BG_COLOR);
    rl.setFontLine('line-through');
  }
}

function _syncCubsBulk(ss, validMasterRows, mCols, enrichment, tz, isFirstRun, isFinalRun) {
  const cubsSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.CUBS.NAME, CONFIG.SHEETS.CUBS.HEADERS);
  const cCols = _validateSchema(cubsSheet, CONFIG.SHEETS.CUBS.HEADERS);
  const numCols = CONFIG.SHEETS.CUBS.HEADERS.length;
  
  const cData = cubsSheet.getDataRange().getValues();
  const cRows = cData.length > 1 ? cData.slice(1) : [];

  const existingCubsMap = new Map();
  cRows.forEach(row => {
    const id = _safeStr_(row[cCols[CONFIG.CUB_COLS.CUB_ID]]);
    if (id) existingCubsMap.set(id, row);
  });

  const cache = CacheService.getScriptCache();
  let seenCubs = [];
  if (!isFirstRun) {
    try { seenCubs = JSON.parse(cache.get('SEEN_CUBS') || '[]'); } catch(e){}
  }
  const seenCubsSet = new Set(seenCubs);

  const uniqueMasterCubs = new Map();
  validMasterRows.forEach(mRow => {
    const cubId = _safeStr_(mRow[mCols[CONFIG.COLS.CUB_ID]]);
    if (cubId) {
      uniqueMasterCubs.set(cubId, mRow);
      seenCubsSet.add(cubId);
    }
  });
  
  if (!isFinalRun) {
    try { cache.put('SEEN_CUBS', JSON.stringify(Array.from(seenCubsSet)), 600); } catch(e){}
  } else {
    cache.remove('SEEN_CUBS');
  }

  const { registryMap, scoreMap, orientationMap } = enrichment;
  const finalCubsMap = new Map();
  
  existingCubsMap.forEach((row, id) => {
    const fixedRow = new Array(numCols).fill('');
    for (let i = 0; i < Math.min(numCols, row.length); i++) {
      fixedRow[i] = row[i];
    }
    finalCubsMap.set(id, fixedRow);
  });

  uniqueMasterCubs.forEach((mRow, cubId) => {
    const regEntry = registryMap.get(cubId) || null;
    const scoreEntry = scoreMap.get(cubId) || null;
    
    const rowObj = new Array(numCols).fill('');
    
    Object.keys(CONFIG.MASTER_TO_CUBS_MAP).forEach(mColName => {
      const cColName = CONFIG.MASTER_TO_CUBS_MAP[mColName];
      const cIdx = cCols[cColName];
      const mIdx = mCols[mColName];
      if (cIdx !== undefined && mIdx !== undefined) {
        const raw = mRow[mIdx];
        rowObj[cIdx] = (raw instanceof Date) ? _formatCellDate_(raw, tz) : _safeStr_(raw);
      }
    });

    const noSubDaysIdx = cCols[CONFIG.CUB_COLS.NO_SUB_DAYS];
    if (noSubDaysIdx !== undefined) {
      let noSubDays = '-';
      const subStatus = _safeStr_(mRow[mCols[CONFIG.COLS.SUB_STATUS]]).toLowerCase();
      if (!subStatus.includes('expired')) {
        const startRaw = mRow[mCols[CONFIG.COLS.SUB_START_DATE]];
        if (startRaw && startRaw instanceof Date && !isNaN(startRaw)) {
          const startD = new Date(startRaw);
          startD.setHours(0,0,0,0);
          const today = new Date();
          today.setHours(0,0,0,0);
          const diffTime = today - startD;
          if (diffTime >= 0) {
            noSubDays = String(Math.floor(diffTime / (1000 * 60 * 60 * 24)));
          } else {
            noSubDays = '0';
          }
        }
      }
      rowObj[noSubDaysIdx] = noSubDays;
    }

    CONFIG.REGISTRY_FIELDS.forEach(rColName => {
      if (rColName === 'Cumulative Weekly Points' || rColName === 'Last Reading Activity') return;
      const cIdx = cCols[rColName];
      if (cIdx !== undefined) {
        rowObj[cIdx] = regEntry ? (_safeStr_(regEntry[rColName]) || '') : '';
      }
    });

    const cwpIdx = cCols['Cumulative Weekly Points'];
    const lraIdx = cCols['Last Reading Activity'];
    if (cwpIdx !== undefined) rowObj[cwpIdx] = scoreEntry ? _safeStr_(scoreEntry['Cumulative Weekly Points']) : '';
    if (lraIdx !== undefined) rowObj[lraIdx] = scoreEntry ? _safeStr_(scoreEntry['Last Reading Activity']) : '';

    if (existingCubsMap.has(cubId)) {
      const existing = existingCubsMap.get(cubId);
      rowObj[cCols[CONFIG.CUB_COLS.LAST_ENGAGEMENT_ACTIVITY]] = existing[cCols[CONFIG.CUB_COLS.LAST_ENGAGEMENT_ACTIVITY]];
      rowObj[cCols[CONFIG.CUB_COLS.HANDLED_BY_LAST]] = existing[cCols[CONFIG.CUB_COLS.HANDLED_BY_LAST]];
      rowObj[cCols[CONFIG.CUB_COLS.PURPOSE_LAST]] = existing[cCols[CONFIG.CUB_COLS.PURPOSE_LAST]];
    }

    // Orientation Tracker enrichment
    const orientEntry = orientationMap.get(cubId) || null;
    const oStageIdx    = cCols[CONFIG.CUB_COLS.ORIENTATION_STAGE];
    const oStatusIdx   = cCols[CONFIG.CUB_COLS.ORIENTATION_STAGE_STATUS];
    const oNextIdx     = cCols[CONFIG.CUB_COLS.ORIENTATION_NEXT_STAGE];
    const oCompIdx     = cCols[CONFIG.CUB_COLS.ORIENTATION_COMPLETION];
    if (oStageIdx  !== undefined) rowObj[oStageIdx]  = orientEntry ? orientEntry.stage          : '';
    if (oStatusIdx !== undefined) rowObj[oStatusIdx] = orientEntry ? orientEntry.stageStatus    : '';
    if (oNextIdx   !== undefined) rowObj[oNextIdx]   = orientEntry ? orientEntry.nextStage      : '';
    if (oCompIdx   !== undefined) rowObj[oCompIdx]   = orientEntry ? orientEntry.completionDate : '';

    finalCubsMap.set(cubId, rowObj);
  });

  const outRows = [];
  const staleRanges = [];
  let rowIdx = 2;
  
  finalCubsMap.forEach((rowData, id) => {
    outRows.push(rowData);
    if (isFinalRun && !seenCubsSet.has(id)) {
      staleRanges.push(`A${rowIdx}:${String.fromCharCode(64 + numCols)}${rowIdx}`);
    }
    rowIdx++;
  });

  if (outRows.length > 0) {
    cubsSheet.getRange(2, 1, Math.max(cubsSheet.getLastRow(), outRows.length), numCols).clearContent();
    cubsSheet.getRange(2, 1, outRows.length, numCols).setValues(outRows);
  }

  cubsSheet.getRange(2, 1, Math.max(cubsSheet.getLastRow(), 2), numCols)
    .setBackground(null)
    .setFontLine('none');

  if (staleRanges.length > 0) {
    const rl = cubsSheet.getRangeList(staleRanges);
    rl.setBackground(CONFIG.REMOVED_ROW_BG_COLOR);
    rl.setFontLine('line-through');
  }
}

/**
 * Scans the Actions tab and updates the 'Action Status' to 'Overdue' 
 * if the deadline has passed and it's not completed/cancelled.
 */
function _updateOverdueActionsStatus(ss, logs) {
  try {
    const actSheet = _getSheetOrThrow(CONFIG.SHEETS.ACTIONS.NAME, ss);
    const actData = actSheet.getDataRange().getValues();
    if (actData.length <= 1) return;

    const aCols = _validateSchema(actSheet, CONFIG.SHEETS.ACTIONS.HEADERS);
    const deadlineColIdx = aCols[CONFIG.ACTION_COLS.ACTION_DEADLINE];
    const statusColIdx = aCols[CONFIG.ACTION_COLS.ACTION_STATUS];

    const writeCol = statusColIdx + 1;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Collect rows to update, then batch-write in a single setValues call
    const rowsToUpdate = [];
    for (let i = 1; i < actData.length; i++) {
      const row = actData[i];
      const deadlineVal = row[deadlineColIdx];
      const currentStatus = String(row[statusColIdx] || '').trim();

      const lowerStatus = currentStatus.toLowerCase();
      if (lowerStatus === 'completed' || lowerStatus === 'cancelled' || lowerStatus === 'overdue' || lowerStatus === 'should have completed') {
        continue;
      }

      if (deadlineVal) {
        const deadlineDate = new Date(deadlineVal);
        if (!isNaN(deadlineDate.getTime())) {
          deadlineDate.setHours(0, 0, 0, 0);
          if (deadlineDate < today) {
            rowsToUpdate.push(i + 1); // 1-based sheet row
          }
        }
      }
    }

    // Batch update: single range write for all overdue rows
    if (rowsToUpdate.length > 0) {
      const colLetter = writeCol <= 26 ? String.fromCharCode(64 + writeCol) : actSheet.getRange(1, writeCol).getA1Notation().replace(/\d+/, '');
      const rangeRefs = rowsToUpdate.map(r => `${colLetter}${r}`);
      const rangeList = actSheet.getRangeList(rangeRefs);
      rangeList.setValue('Overdue');

      logs.push(`overdue_actions_updated:${rowsToUpdate.length}`);
      _bustAllDashboardCaches();
    }
  } catch (err) {
    logs.push(`overdue_error:${err.message}`);
  }
}
