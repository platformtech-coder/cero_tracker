/**
 * @file Utils.gs
 * @description Pure, stateless helper functions, schema validation, and logging management.
 */

/* eslint-disable no-unused-vars */

  // ═══════════════════════════════════════════════════════════════
// LOCK & EXECUTION WRAPPERS
  // ═══════════════════════════════════════════════════════════════

/**
 * Executes fn inside a script-level lock. Throws if the lock cannot be acquired.
 * Increased from 10s to 30s to handle concurrent writes from multiple reps.
 * @param {function(): *} fn
 * @param {number} [timeoutMs=30000]
 * @returns {*} Return value of fn
 */
function _withScriptLock(fn, timeoutMs = 30000) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(timeoutMs);
    return fn();
  } catch (e) {
    if (e.message && e.message.includes('Could not obtain lock')) {
      throw new Error(
        'Another user is currently saving data. ' +
        'Please wait a few seconds and try again.'
      );
    }
    throw e;
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

  // ═══════════════════════════════════════════════════════════════
// CACHE VERSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

/**
 * Returns the current cache version from PropertiesService.
 * All dashboard cache keys incorporate this version so that incrementing
 * it atomically busts all user caches at once — no per-user tracking needed.
 * @returns {number}
 */
function _getCacheVersion() {
  try {
    return parseInt(PropertiesService.getScriptProperties().getProperty('cache_version') || '1', 10);
  } catch (e) {
    return 1;
  }
}

/**
 * Returns the ori/rc-specific cache version. This increments independently
 * from the main dashboard cache version, so Orientation and RC writes only
 * invalidate their own page caches, not the expensive dashboard payload.
 * @returns {number}
 */
function _getOriRcCacheVersion() {
  try {
    return parseInt(PropertiesService.getScriptProperties().getProperty('ori_rc_version') || '1', 10);
  } catch (e) {
    return 1;
  }
}


/**
 * Increments the cache version, instantly invalidating all per-user
 * dashboard caches. Called after any write operation that changes data.
 * This is the recommended cache-busting strategy for this project:
 *   - No per-user key tracking required.
 *   - Scales to any number of concurrent users.
 *   - Stale cache keys become orphaned and are cleaned up by TTL.
 */
function _bustAllDashboardCaches() {
  try {
    const props = PropertiesService.getScriptProperties();
    const current = parseInt(props.getProperty('cache_version') || '1', 10);
    props.setProperty('cache_version', String(current + 1));
    // Also clear the form init data cache so dropdown changes propagate
    try { CacheService.getScriptCache().remove('form_init_data'); } catch (e) {}
  } catch (e) {
    console.warn('WARN [_bustAllDashboardCaches]: Could not bump cache version:', e.message);
  }
}

/**
 * Bumps only the search-index cache version. Called after the daily sync
 * completes (which is the only thing that changes the Master data the
 * search index is built from). Interaction writes do NOT call this —
 * the search index is based on Master, not Interactions/Actions/Cubs/Families.
 */
function _bustSearchCacheOnly() {
  try {
    const props = PropertiesService.getScriptProperties();
    const current = parseInt(props.getProperty('search_cache_version') || '1', 10);
    props.setProperty('search_cache_version', String(current + 1));
  } catch (e) {
    console.warn('WARN [_bustSearchCacheOnly]: Could not bump search cache version:', e.message);
  }
}

/**
 * Bumps ONLY the ori/rc page cache version without touching the main dashboard
 * cache version. Orientation and RC writes call this instead of
 * _bustAllDashboardCaches() so the expensive dashboard payload survives.
 */
function _bustOriRcCachesOnly() {
  try {
    const props = PropertiesService.getScriptProperties();
    const current = parseInt(props.getProperty('ori_rc_version') || '1', 10);
    props.setProperty('ori_rc_version', String(current + 1));
  } catch (e) {
    console.warn('WARN [_bustOriRcCachesOnly]: Could not bump ori/rc cache version:', e.message);
  }
}


  // ═══════════════════════════════════════════════════════════════
// SHEET UTILS
  // ═══════════════════════════════════════════════════════════════

/**
 * Gets a sheet by name from the specified spreadsheet (defaults to active).
 * @param {string} name
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [ss]
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 * @throws {Error} If sheet not found
 */
function _getSheetOrThrow(name, ss = SpreadsheetApp.getActiveSpreadsheet()) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Sheet "${name}" not found.`);
  return sheet;
}

/**
 * Safely computes the true last row with data in a sheet by checking column A.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} [column=1] - The column to check (1-based)
 * @returns {number} The 1-based index of the last non-empty row
 */
function _getTrueLastRow(sheet, column = 1) {
  const data = sheet.getRange(1, column, sheet.getLastRow() || 1, 1).getValues();
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i][0] !== '') return i + 1;
  }
  return 0;
}

/**
 * Validates that all required headers are present in the sheet's header row.
 * Returns a map of header string → 0-based column index for safe column access.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string[]} requiredHeaders - Exact header strings expected
 * @returns {{ [header: string]: number }}
 * @throws {Error} If any required header is absent from row 1
 */
function _validateSchema(sheet, requiredHeaders) {
  if (sheet.getLastColumn() === 0) {
    throw new Error(`Sheet "${sheet.getName()}" is empty. Expected headers.`);
  }
  const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const headerMap = {};
  headerRow.forEach((h, i) => { if (h !== '') headerMap[h] = i; });

  const missing = requiredHeaders.filter(h => headerMap[h] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Schema mismatch in sheet "${sheet.getName()}": ` +
      `missing column(s): [${missing.map(h => `"${h}"`).join(', ')}]. `
    );
  }
  return headerMap;
}

  // ═══════════════════════════════════════════════════════════════
// SETUP & VALIDATION MENU COMMANDS
  // ═══════════════════════════════════════════════════════════════

/**
 * Returns the named sheet, creating it with the given headers if it does not exist.
 * On creation: writes headers to row 1, styles, freezes row 1, auto-resizes columns.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} name - Exact tab name
 * @param {string[]} headers - Ordered header strings
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function _getOrCreateSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);

    // Write headers
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setValues([headers]);

    // Header formatting
    headerRange.setBackground(CONFIG.HEADER_BG_COLOR);
    headerRange.setFontColor(CONFIG.HEADER_FONT_COLOR);
    headerRange.setFontFamily(CONFIG.HEADER_FONT_FAMILY);
    headerRange.setFontWeight('bold');

    // Default data font for the whole sheet (only on creation — avoids
    // re-applying to every cell on every write call from concurrent reps)
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns())
         .setFontFamily(CONFIG.DATA_FONT_FAMILY)
         .setFontSize(CONFIG.DATA_FONT_SIZE);

    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
  }

  return sheet;
}

/**
 * Ensures every sheet defined in CONFIG.SHEETS exists with its correct header row.
 * Called from onOpen and as the first step of sync.
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.values(CONFIG.SHEETS).forEach(({ NAME, HEADERS }) => {
    _getOrCreateSheet(ss, NAME, HEADERS);
  });
}

/**
 * Validates headers on every sheet in CONFIG.SHEETS.
 */
function validateAllSchemas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const errors = [];

  Object.values(CONFIG.SHEETS).forEach(({ NAME, HEADERS }) => {
    try {
      const sheet = _getSheetOrThrow(NAME, ss);
      _validateSchema(sheet, HEADERS);
    } catch (e) {
      errors.push(e.message);
    }
  });

  if (errors.length > 0) {
    SpreadsheetApp.getUi().alert(
      'Schema Validation Failed',
      errors.join('\n\n'),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } else {
    ss.toast('All schemas valid.', CONFIG.MENU_NAME, 4);
  }
}

  // ═══════════════════════════════════════════════════════════════
// LOGGING UTILS
  // ═══════════════════════════════════════════════════════════════

/**
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getOrCreateLogSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);

  if (!logSheet) {
    logSheet = ss.insertSheet(CONFIG.LOG_SHEET_NAME, ss.getNumSheets());
    const headerRange = logSheet.getRange(1, 1, 1, CONFIG.LOG_HEADERS.length);
    headerRange.setValues([CONFIG.LOG_HEADERS]).setFontWeight('bold');
    logSheet.setFrozenRows(1);
    logSheet.autoResizeColumns(1, CONFIG.LOG_HEADERS.length);

    // Optional: Protect the log sheet
    const p = logSheet.protect().setDescription('Log Protection');
    p.setWarningOnly(true);
  }
  return logSheet;
}

/**
 * Writes a log entry. Appends to the bottom of the log (newest-last).
 * Uses appendRow() which is atomic in GAS — safe for concurrent writes.
 * Prunes the oldest rows when MAX_LOG_ROWS is exceeded.
 * @param {string} status - e.g. 'SUCCESS', 'ERROR', 'INFO', 'WARNING'
 * @param {string|string[]} details
 * @param {number} [durationMs]
 */
function writeLog(status, details, durationMs = 0) {
  if (CONFIG.DRY_RUN && status !== 'ERROR') {
    console.log(`[DRY RUN] ${status} | ${details}`);
    return;
  }

  try {
    const logSheet = getOrCreateLogSheet();
    const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const detailsStr = Array.isArray(details) ? details.join(' | ') : String(details);

    // appendRow is atomic — safe under concurrent writes from multiple reps.
    logSheet.appendRow([timestamp, status, detailsStr, durationMs]);

    // Prune oldest rows when we exceed the cap. Delete in batches of 10 to
    // avoid one deleteRow call per write under heavy load.
    const maxDataRows = CONFIG.MAX_LOG_ROWS;
    const lastRow = logSheet.getLastRow();
    const dataRows = lastRow - 1; // row 1 is the header
    if (dataRows > maxDataRows + 10) {
      const rowsToDelete = dataRows - maxDataRows;
      // Row 2 is the oldest entry (bottom of old prepend model was newest;
      // now we're append-based so row 2 is the oldest).
      logSheet.deleteRows(2, rowsToDelete);
    }
  } catch (logErr) {
    // Never let logging failures crash the calling function
    console.error('LOG WRITE FAILED:', logErr.message);
  }
}

