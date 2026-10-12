/**
 * @file DashboardWrite.gs
 * @description Write APIs for the Web App Dashboard.
 *
 * Concurrency: All mutations use LockService (script-level lock) to prevent
 * concurrent write corruption when multiple reps submit at the same time.
 *
 * Performance: Cubs tab updates are batched per-row (3 cells per interaction)
 * to avoid N×3 individual setValue() calls.
 *
 * Cache: All write functions call _bustAllDashboardCaches() at completion,
 * which increments the cache version and makes all user caches stale.
 */

/* eslint-disable no-unused-vars */

/**
 * Submits an array of interactions to the Interactions tab.
 * @param {string} token
 * @param {Array<Object>} interactions
 */
function submitInteractions(token, interactions) {
  try {
    const session = _requireSession(token);

    if (!Array.isArray(interactions) || interactions.length === 0) {
      throw new Error("No interactions to submit.");
    }

    return _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = _getOrCreateSheet(ss, CONFIG.SHEETS.INTERACTIONS.NAME, CONFIG.SHEETS.INTERACTIONS.HEADERS);
      const iCols = _validateSchema(sheet, CONFIG.SHEETS.INTERACTIONS.HEADERS);

      const actionsSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.ACTIONS.NAME, CONFIG.SHEETS.ACTIONS.HEADERS);
      const aCols = _validateSchema(actionsSheet, CONFIG.SHEETS.ACTIONS.HEADERS);

      const cubsSheet = _getSheetOrThrow(CONFIG.SHEETS.CUBS.NAME, ss);
      const cCols = _validateSchema(cubsSheet, CONFIG.SHEETS.CUBS.HEADERS);
      const cubsData = cubsSheet.getDataRange().getValues();

      // Build cubId → row-number map once (avoids N scans)
      const cubRowMap = new Map();
      for (let i = 1; i < cubsData.length; i++) {
        const id = String(cubsData[i][cCols[CONFIG.CUB_COLS.CUB_ID]]).trim();
        if (id) cubRowMap.set(id, i + 1);
      }

      const tz = Session.getScriptTimeZone();
      const now = new Date();
      let dateTimeStr = Utilities.formatDate(now, tz, "EEE, dd-MMM-yy - hh:mma");
      dateTimeStr = dateTimeStr.replace("AM", "am").replace("PM", "pm");

      const intRows = [];
      const actRows = [];
      let actStartRow = actionsSheet.getLastRow() + 1;

      // Collect batched Cubs updates: { rowNum → [engagement, handledBy, purpose] }
      const cubUpdates = new Map();

      interactions.forEach((interaction) => {
        const cubId = String(interaction.cubId || '').trim();
        if (!cubId || !cubRowMap.has(cubId)) {
          writeLog('WARNING', `Skipped interaction for missing or invalid cubId: "${interaction.cubId}" — not found in Cubs tab. Ensure a Contact Sync has been run.`);
          return; // Skip this interaction
        }
        interaction.cubId = cubId; // normalise for all further use
        const intId = Utilities.getUuid();

        let deadlineStr = interaction.actionDeadline || '';
        if (deadlineStr) {
          try {
            const dlDate = new Date(deadlineStr);
            if (!isNaN(dlDate)) deadlineStr = Utilities.formatDate(dlDate, tz, "EEE, dd-MMM-yy");
          } catch (e) {}
        }

        const row = new Array(Object.keys(iCols).length).fill('');
        row[iCols[CONFIG.INTERACTION_COLS.INTERACTION_ID]] = intId;
        row[iCols[CONFIG.INTERACTION_COLS.DATE]]            = dateTimeStr;
        row[iCols[CONFIG.INTERACTION_COLS.PARENT_FIRST_NAME]] = interaction.parentFirstName || '';
        row[iCols[CONFIG.INTERACTION_COLS.PARENT_LAST_NAME]]  = interaction.parentLastName || '';
        row[iCols[CONFIG.INTERACTION_COLS.CUB_ID]]            = interaction.cubId || '';
        row[iCols[CONFIG.INTERACTION_COLS.CUB_FIRST_NAME]]    = interaction.cubFirstName || '';
        row[iCols[CONFIG.INTERACTION_COLS.CUB_LAST_NAME]]     = interaction.cubLastName || '';
        row[iCols[CONFIG.INTERACTION_COLS.HANDLED_BY]]        = interaction.handledBy || '';
        row[iCols[CONFIG.INTERACTION_COLS.TYPE]]              = interaction.type || '';
        row[iCols[CONFIG.INTERACTION_COLS.PURPOSE]]           = interaction.purpose || '';
        row[iCols[CONFIG.INTERACTION_COLS.STATUS]]            = interaction.status || '';
        row[iCols[CONFIG.INTERACTION_COLS.FEEDBACK]]          = interaction.feedback || '';
        row[iCols[CONFIG.INTERACTION_COLS.ACTION_REQUIRED]]   = interaction.actionRequired || 'No';
        row[iCols[CONFIG.INTERACTION_COLS.ACTION]]            = interaction.action || '';
        row[iCols[CONFIG.INTERACTION_COLS.ACTION_DEADLINE]]   = deadlineStr;
        row[iCols[CONFIG.INTERACTION_COLS.ACTION_STATUS]]     = interaction.actionStatus || '';
        row[iCols[CONFIG.INTERACTION_COLS.LOGGED_BY]]         = session.email;

        intRows.push(row);

        if (interaction.actionRequired === 'Yes') {
          const rowNum = actStartRow + actRows.length;
          const aRow = new Array(Object.keys(aCols).length).fill('');
          aRow[aCols[CONFIG.ACTION_COLS.INTERACTION_ID]]   = intId;
          aRow[aCols[CONFIG.ACTION_COLS.DATE]]             = dateTimeStr;
          aRow[aCols[CONFIG.ACTION_COLS.PARENT_FIRST_NAME]] = interaction.parentFirstName || '';
          aRow[aCols[CONFIG.ACTION_COLS.PARENT_LAST_NAME]]  = interaction.parentLastName || '';
          aRow[aCols[CONFIG.ACTION_COLS.CUB_ID]]           = interaction.cubId || '';
          aRow[aCols[CONFIG.ACTION_COLS.CUB_FIRST_NAME]]   = interaction.cubFirstName || '';
          aRow[aCols[CONFIG.ACTION_COLS.CUB_LAST_NAME]]    = interaction.cubLastName || '';
          aRow[aCols[CONFIG.ACTION_COLS.HANDLED_BY]]       = interaction.handledBy || '';
          aRow[aCols[CONFIG.ACTION_COLS.TYPE]]             = interaction.type || '';
          aRow[aCols[CONFIG.ACTION_COLS.PURPOSE]]          = interaction.purpose || '';
          aRow[aCols[CONFIG.ACTION_COLS.STATUS]]           = interaction.status || '';
          aRow[aCols[CONFIG.ACTION_COLS.FEEDBACK]]         = interaction.feedback || '';
          aRow[aCols[CONFIG.ACTION_COLS.ACTION_REQUIRED]]  = interaction.actionRequired;
          aRow[aCols[CONFIG.ACTION_COLS.ACTION]]           = interaction.action || '';
          aRow[aCols[CONFIG.ACTION_COLS.ACTION_DEADLINE]]  = deadlineStr;
          aRow[aCols[CONFIG.ACTION_COLS.ACTION_STATUS]]    = interaction.actionStatus || 'Pending';
          // Dynamic formula for overdue detection — references the deadline column
          aRow[aCols[CONFIG.ACTION_COLS.OVERDUE_STATUS]]   = `=IF(ISBLANK(O${rowNum}),"No",IF(O${rowNum}<TODAY(),"Yes","No"))`;
          aRow[aCols[CONFIG.ACTION_COLS.LOGGED_BY]]        = session.email;
          actRows.push(aRow);
        }

        // Collect Cubs tab updates (deferred batch write)
        const cubRow = cubRowMap.get(interaction.cubId);
        if (cubRow) {
          cubUpdates.set(cubRow, [dateTimeStr, interaction.handledBy || '', interaction.purpose || '']);
        }
      });

      // Write all interaction rows in one batch
      if (intRows.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, intRows.length, intRows[0].length).setValues(intRows);
      }
      // Write all action rows in one batch
      if (actRows.length > 0) {
        actionsSheet.getRange(actStartRow, 1, actRows.length, actRows[0].length).setValues(actRows);
      }

      // ── Batched Cubs tab update ───────────────────────────────────────────
      // Instead of 3 setValue() calls per interaction, we do one setValues([...]) per
      // affected row. This reduces API calls from 3N to N (typically 1–5).
      const engagCol = cCols[CONFIG.CUB_COLS.LAST_ENGAGEMENT_ACTIVITY] + 1;
      const handledCol = cCols[CONFIG.CUB_COLS.HANDLED_BY_LAST] + 1;
      const purposeCol = cCols[CONFIG.CUB_COLS.PURPOSE_LAST] + 1;

      cubUpdates.forEach((vals, rowNum) => {
        // Write 3 cells as a row of values — 1 API call per cub instead of 3
        cubsSheet.getRange(rowNum, engagCol, 1, 3).setValues([[vals[0], vals[1], vals[2]]]);
      });

      writeLog('SUCCESS', `Submitted ${intRows.length} interactions, ${actRows.length} actions by ${session.email}.`);
      _bustAllDashboardCaches();

      // Return the first (and typically only) interactionId + timestamp
      // so the client-side optimistic record can confirm with real server data.
      const confirmedId = intRows.length > 0 ? intRows[0][iCols[CONFIG.INTERACTION_COLS.INTERACTION_ID]] : null;
      return JSON.stringify({ success: true, count: intRows.length, interactionId: confirmedId, dateTimeStr });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Submits a follow-up interaction for an action, marks it completed,
 * and removes the original action from the queue (or updates its deadline for non-terminal statuses).
 */
function submitActionFollowUp(token, interactionId, interactionData, newActionStatus, newDeadlineISO) {
  try {
    const session = _requireSession(token);

    return _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const tz = Session.getScriptTimeZone();
      const now = new Date();
      let dateTimeStr = Utilities.formatDate(now, tz, "EEE, dd-MMM-yy - hh:mma");
      dateTimeStr = dateTimeStr.replace("AM", "am").replace("PM", "pm");

      const sheet = _getOrCreateSheet(ss, CONFIG.SHEETS.INTERACTIONS.NAME, CONFIG.SHEETS.INTERACTIONS.HEADERS);
      const iCols = _validateSchema(sheet, CONFIG.SHEETS.INTERACTIONS.HEADERS);

      // 1. Find original interaction's row before appending the new one
      const intData = sheet.getDataRange().getValues();
      let originalRowIndex = -1;
      for (let i = intData.length - 1; i >= 1; i--) {
        if (String(intData[i][iCols[CONFIG.INTERACTION_COLS.INTERACTION_ID]]).trim() === interactionId) {
          originalRowIndex = i + 1;
          break;
        }
      }

      // 2. Prepare the follow-up interaction
      const row = new Array(Object.keys(iCols).length).fill('');
      row[iCols[CONFIG.INTERACTION_COLS.INTERACTION_ID]]  = Utilities.getUuid();
      row[iCols[CONFIG.INTERACTION_COLS.DATE]]            = dateTimeStr;
      row[iCols[CONFIG.INTERACTION_COLS.PARENT_FIRST_NAME]] = interactionData.parentFirstName || '';
      row[iCols[CONFIG.INTERACTION_COLS.PARENT_LAST_NAME]]  = interactionData.parentLastName || '';
      row[iCols[CONFIG.INTERACTION_COLS.CUB_ID]]          = interactionData.cubId || '';
      row[iCols[CONFIG.INTERACTION_COLS.CUB_FIRST_NAME]]  = interactionData.cubFirstName || '';
      row[iCols[CONFIG.INTERACTION_COLS.CUB_LAST_NAME]]   = interactionData.cubLastName || '';
      row[iCols[CONFIG.INTERACTION_COLS.HANDLED_BY]]      = interactionData.handledBy || '';
      row[iCols[CONFIG.INTERACTION_COLS.TYPE]]            = interactionData.type || '';
      row[iCols[CONFIG.INTERACTION_COLS.PURPOSE]]         = interactionData.purpose || '';
      row[iCols[CONFIG.INTERACTION_COLS.STATUS]]          = interactionData.status || '';
      row[iCols[CONFIG.INTERACTION_COLS.FEEDBACK]]        = interactionData.feedback || '';
      row[iCols[CONFIG.INTERACTION_COLS.ACTION_REQUIRED]] = interactionData.actionRequired || 'No';
      let deadlineStr = '';
      if (interactionData.actionRequired === 'Yes') {
        row[iCols[CONFIG.INTERACTION_COLS.ACTION]] = interactionData.action || '';
        if (interactionData.actionDeadline) {
          try {
            const dlDate = new Date(interactionData.actionDeadline);
            if (!isNaN(dlDate)) deadlineStr = Utilities.formatDate(dlDate, tz, "EEE, dd-MMM-yy");
          } catch(e) {}
        }
        row[iCols[CONFIG.INTERACTION_COLS.ACTION_DEADLINE]] = deadlineStr;
        row[iCols[CONFIG.INTERACTION_COLS.ACTION_STATUS]]   = 'Pending';
      }
      row[iCols[CONFIG.INTERACTION_COLS.LOGGED_BY]]       = session.email;

      // 3. Write follow-up and update original
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
      
      if (originalRowIndex !== -1) {
        sheet.getRange(originalRowIndex, iCols[CONFIG.INTERACTION_COLS.ACTION_STATUS] + 1).setValue(newActionStatus);
      }

      // 3. Update or delete the action from Actions tab based on status
      const actSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.ACTIONS.NAME, CONFIG.SHEETS.ACTIONS.HEADERS);
      const actCols = _validateSchema(actSheet, CONFIG.SHEETS.ACTIONS.HEADERS);
      const actData = actSheet.getDataRange().getValues();

      const TERMINAL_STATUSES = ['Completed', 'Cancelled'];
      const isTerminal = TERMINAL_STATUSES.includes(newActionStatus);

      for (let i = actData.length - 1; i >= 1; i--) {
        if (String(actData[i][actCols[CONFIG.ACTION_COLS.INTERACTION_ID]]).trim() === interactionId) {
          if (isTerminal) {
            // Remove action from queue permanently
            actSheet.deleteRow(i + 1);
          } else {
            // Non-terminal: update status
            actSheet.getRange(i + 1, actCols[CONFIG.ACTION_COLS.ACTION_STATUS] + 1).setValue(newActionStatus);
          }
          break;
        }
      }

      // 3.5 Create NEW action if the follow-up had one
      if (interactionData.actionRequired === 'Yes') {
        const aRow = new Array(Object.keys(actCols).length).fill('');
        const rowNum = actSheet.getLastRow() + 1;
        
        aRow[actCols[CONFIG.ACTION_COLS.INTERACTION_ID]]     = row[iCols[CONFIG.INTERACTION_COLS.INTERACTION_ID]]; // link to the new follow up interaction ID
        aRow[actCols[CONFIG.ACTION_COLS.DATE]]               = dateTimeStr;
        aRow[actCols[CONFIG.ACTION_COLS.PARENT_FIRST_NAME]]  = interactionData.parentFirstName || '';
        aRow[actCols[CONFIG.ACTION_COLS.PARENT_LAST_NAME]]   = interactionData.parentLastName || '';
        aRow[actCols[CONFIG.ACTION_COLS.CUB_ID]]             = interactionData.cubId || '';
        aRow[actCols[CONFIG.ACTION_COLS.CUB_FIRST_NAME]]     = interactionData.cubFirstName || '';
        aRow[actCols[CONFIG.ACTION_COLS.CUB_LAST_NAME]]      = interactionData.cubLastName || '';
        aRow[actCols[CONFIG.ACTION_COLS.HANDLED_BY]]         = interactionData.handledBy || '';
        aRow[actCols[CONFIG.ACTION_COLS.ACTION]]             = interactionData.action || '';
        aRow[actCols[CONFIG.ACTION_COLS.ACTION_DEADLINE]]    = deadlineStr;
        aRow[actCols[CONFIG.ACTION_COLS.ACTION_STATUS]]      = 'Pending';
        aRow[actCols[CONFIG.ACTION_COLS.OVERDUE_STATUS]]     = `=IF(ISBLANK(O${rowNum}),"No",IF(O${rowNum}<TODAY(),"Yes","No"))`;
        aRow[actCols[CONFIG.ACTION_COLS.LOGGED_BY]]          = session.email;

        actSheet.getRange(rowNum, 1, 1, aRow.length).setValues([aRow]);
      }

      // 4. Update Cubs tab — one read, batched write
      const cubsSheet = _getSheetOrThrow(CONFIG.SHEETS.CUBS.NAME, ss);
      const cCols = _validateSchema(cubsSheet, CONFIG.SHEETS.CUBS.HEADERS);
      const cubsData = cubsSheet.getDataRange().getValues();
      for (let i = 1; i < cubsData.length; i++) {
        if (String(cubsData[i][cCols[CONFIG.CUB_COLS.CUB_ID]]).trim() === interactionData.cubId) {
          cubsSheet.getRange(i + 1, cCols[CONFIG.CUB_COLS.LAST_ENGAGEMENT_ACTIVITY] + 1, 1, 3).setValues([[
            dateTimeStr,
            interactionData.handledBy || '',
            interactionData.purpose || ''
          ]]);
          break;
        }
      }

      writeLog('SUCCESS', `Follow-up logged for action ${interactionId} by ${session.email}.`);
      _bustAllDashboardCaches();

      return JSON.stringify({ success: true, dateTimeStr });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Deletes an interaction, removes any linked action, and rolls back the Cub's last activity.
 */
function deleteInteraction(token, interactionId) {
  try {
    const session = _requireSession(token);

    return _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();

      const intSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.INTERACTIONS.NAME, CONFIG.SHEETS.INTERACTIONS.HEADERS);
      const intCols = _validateSchema(intSheet, CONFIG.SHEETS.INTERACTIONS.HEADERS);
      const intData = intSheet.getDataRange().getValues();

      let deletedCubId = null;

      for (let i = intData.length - 1; i >= 1; i--) {
        if (String(intData[i][intCols[CONFIG.INTERACTION_COLS.INTERACTION_ID]]).trim() === interactionId) {
          deletedCubId = String(intData[i][intCols[CONFIG.INTERACTION_COLS.CUB_ID]]).trim();
          intSheet.deleteRow(i + 1);
          break;
        }
      }

      if (!deletedCubId) throw new Error("Interaction not found.");

      // Remove linked action
      const actSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.ACTIONS.NAME, CONFIG.SHEETS.ACTIONS.HEADERS);
      const actCols = _validateSchema(actSheet, CONFIG.SHEETS.ACTIONS.HEADERS);
      const actData = actSheet.getDataRange().getValues();

      for (let i = actData.length - 1; i >= 1; i--) {
        if (String(actData[i][actCols[CONFIG.ACTION_COLS.INTERACTION_ID]]).trim() === interactionId) {
          actSheet.deleteRow(i + 1);
          break;
        }
      }

      // Rollback Cubs tab to last remaining interaction for this cub
      // Reuse the in-memory array to avoid a second slow sheet read
      let lastIntForCub = null;
      for (let i = intData.length - 1; i >= 1; i--) {
        if (String(intData[i][intCols[CONFIG.INTERACTION_COLS.INTERACTION_ID]]).trim() === interactionId) continue; // Skip deleted row
        if (String(intData[i][intCols[CONFIG.INTERACTION_COLS.CUB_ID]]).trim() === deletedCubId) {
          lastIntForCub = intData[i];
          break;
        }
      }

      const cubsSheet = _getSheetOrThrow(CONFIG.SHEETS.CUBS.NAME, ss);
      const cCols = _validateSchema(cubsSheet, CONFIG.SHEETS.CUBS.HEADERS);
      const cubsData = cubsSheet.getDataRange().getValues();

      for (let i = 1; i < cubsData.length; i++) {
        if (String(cubsData[i][cCols[CONFIG.CUB_COLS.CUB_ID]]).trim() === deletedCubId) {
          if (lastIntForCub) {
            cubsSheet.getRange(i + 1, cCols[CONFIG.CUB_COLS.LAST_ENGAGEMENT_ACTIVITY] + 1, 1, 3).setValues([[
              lastIntForCub[intCols[CONFIG.INTERACTION_COLS.DATE]],
              lastIntForCub[intCols[CONFIG.INTERACTION_COLS.HANDLED_BY]],
              lastIntForCub[intCols[CONFIG.INTERACTION_COLS.PURPOSE]]
            ]]);
          } else {
            cubsSheet.getRange(i + 1, cCols[CONFIG.CUB_COLS.LAST_ENGAGEMENT_ACTIVITY] + 1, 1, 3).setValues([['', '', '']]);
          }
          break;
        }
      }

      _bustAllDashboardCaches();
      writeLog('SUCCESS', `Deleted interaction ${interactionId} by ${session.email}.`);
      return JSON.stringify({ success: true });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Edits an existing interaction, syncing with Actions tab.
 * Preserves the original date and original Status (unless explicitly updated).
 */
function editInteraction(token, interactionId, interaction) {
  try {
    const session = _requireSession(token);

    return _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const tz = Session.getScriptTimeZone();

      const sheet = _getOrCreateSheet(ss, CONFIG.SHEETS.INTERACTIONS.NAME, CONFIG.SHEETS.INTERACTIONS.HEADERS);
      const iCols = _validateSchema(sheet, CONFIG.SHEETS.INTERACTIONS.HEADERS);
      const intData = sheet.getDataRange().getValues(); // Read once

      let rowIndex = -1;
      let origDateTimeStr = '';
      let origStatus = ''; // Preserve original status

      for (let i = 1; i < intData.length; i++) {
        if (String(intData[i][iCols[CONFIG.INTERACTION_COLS.INTERACTION_ID]]).trim() === interactionId) {
          rowIndex = i + 1;
          const dateVal = intData[i][iCols[CONFIG.INTERACTION_COLS.DATE]];
          origDateTimeStr = (typeof dateVal === 'object' && dateVal !== null)
            ? Utilities.formatDate(dateVal, tz, "EEE, dd-MMM-yy - hh:mma").replace("AM", "am").replace("PM", "pm")
            : String(dateVal);
          origStatus = String(intData[i][iCols[CONFIG.INTERACTION_COLS.STATUS]]); // ← BUG FIX: preserve status
          break;
        }
      }

      if (rowIndex === -1) throw new Error("Interaction not found.");

      let deadlineStr = interaction.actionDeadline || '';
      if (deadlineStr) {
        try {
          const dlDate = new Date(deadlineStr);
          if (!isNaN(dlDate)) deadlineStr = Utilities.formatDate(dlDate, tz, "EEE, dd-MMM-yy");
        } catch (e) {}
      }

      const row = new Array(Object.keys(iCols).length).fill('');
      row[iCols[CONFIG.INTERACTION_COLS.INTERACTION_ID]] = interactionId;
      row[iCols[CONFIG.INTERACTION_COLS.DATE]]            = origDateTimeStr;
      row[iCols[CONFIG.INTERACTION_COLS.PARENT_FIRST_NAME]] = interaction.parentFirstName || '';
      row[iCols[CONFIG.INTERACTION_COLS.PARENT_LAST_NAME]]  = interaction.parentLastName || '';
      row[iCols[CONFIG.INTERACTION_COLS.CUB_ID]]            = interaction.cubId || '';
      row[iCols[CONFIG.INTERACTION_COLS.CUB_FIRST_NAME]]    = interaction.cubFirstName || '';
      row[iCols[CONFIG.INTERACTION_COLS.CUB_LAST_NAME]]     = interaction.cubLastName || '';
      row[iCols[CONFIG.INTERACTION_COLS.HANDLED_BY]]        = interaction.handledBy || '';
      row[iCols[CONFIG.INTERACTION_COLS.TYPE]]              = interaction.type || '';
      row[iCols[CONFIG.INTERACTION_COLS.PURPOSE]]           = interaction.purpose || '';
      // Use the user-provided status if given, otherwise preserve the original
      row[iCols[CONFIG.INTERACTION_COLS.STATUS]]            = interaction.status || origStatus;
      row[iCols[CONFIG.INTERACTION_COLS.FEEDBACK]]          = interaction.feedback || '';
      row[iCols[CONFIG.INTERACTION_COLS.ACTION_REQUIRED]]   = interaction.actionRequired || 'No';
      row[iCols[CONFIG.INTERACTION_COLS.ACTION]]            = interaction.action || '';
      row[iCols[CONFIG.INTERACTION_COLS.ACTION_DEADLINE]]   = deadlineStr;
      row[iCols[CONFIG.INTERACTION_COLS.ACTION_STATUS]]     = interaction.actionStatus || '';
      row[iCols[CONFIG.INTERACTION_COLS.LOGGED_BY]]         = session.email;

      sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);

      // Sync with Actions sheet
      const actionsSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.ACTIONS.NAME, CONFIG.SHEETS.ACTIONS.HEADERS);
      const aCols = _validateSchema(actionsSheet, CONFIG.SHEETS.ACTIONS.HEADERS);
      const actData = actionsSheet.getDataRange().getValues();

      let actRowIndex = -1;
      for (let i = 1; i < actData.length; i++) {
        if (String(actData[i][aCols[CONFIG.ACTION_COLS.INTERACTION_ID]]).trim() === interactionId) {
          actRowIndex = i + 1;
          break;
        }
      }

      if (interaction.actionRequired === 'Yes') {
        const writeRow = actRowIndex > -1 ? actRowIndex : actionsSheet.getLastRow() + 1;
        const aRow = new Array(Object.keys(aCols).length).fill('');
        aRow[aCols[CONFIG.ACTION_COLS.INTERACTION_ID]]  = interactionId;
        aRow[aCols[CONFIG.ACTION_COLS.DATE]]            = origDateTimeStr;
        aRow[aCols[CONFIG.ACTION_COLS.PARENT_FIRST_NAME]] = interaction.parentFirstName || '';
        aRow[aCols[CONFIG.ACTION_COLS.PARENT_LAST_NAME]]  = interaction.parentLastName || '';
        aRow[aCols[CONFIG.ACTION_COLS.CUB_ID]]          = interaction.cubId || '';
        aRow[aCols[CONFIG.ACTION_COLS.CUB_FIRST_NAME]]  = interaction.cubFirstName || '';
        aRow[aCols[CONFIG.ACTION_COLS.CUB_LAST_NAME]]   = interaction.cubLastName || '';
        aRow[aCols[CONFIG.ACTION_COLS.HANDLED_BY]]      = interaction.handledBy || '';
        aRow[aCols[CONFIG.ACTION_COLS.TYPE]]            = interaction.type || '';
        aRow[aCols[CONFIG.ACTION_COLS.PURPOSE]]         = interaction.purpose || '';
        aRow[aCols[CONFIG.ACTION_COLS.STATUS]]          = interaction.status || origStatus;
        aRow[aCols[CONFIG.ACTION_COLS.FEEDBACK]]        = interaction.feedback || '';
        aRow[aCols[CONFIG.ACTION_COLS.ACTION_REQUIRED]] = interaction.actionRequired;
        aRow[aCols[CONFIG.ACTION_COLS.ACTION]]          = interaction.action || '';
        aRow[aCols[CONFIG.ACTION_COLS.ACTION_DEADLINE]] = deadlineStr;
        aRow[aCols[CONFIG.ACTION_COLS.ACTION_STATUS]]   = interaction.actionStatus || 'Pending';
        aRow[aCols[CONFIG.ACTION_COLS.OVERDUE_STATUS]]  = `=IF(ISBLANK(O${writeRow}),"No",IF(O${writeRow}<TODAY(),"Yes","No"))`;
        aRow[aCols[CONFIG.ACTION_COLS.LOGGED_BY]]       = session.email;
        actionsSheet.getRange(writeRow, 1, 1, aRow.length).setValues([aRow]);
      } else {
        if (actRowIndex > -1) actionsSheet.deleteRow(actRowIndex);
      }

      // ── Batched Cubs tab update (using already-read intData — no second getDataRange) ──
      // Find the last interaction for this cub from the already-read intData
      let lastIntForCub = null;
      for (let i = intData.length - 1; i >= 1; i--) {
        if (String(intData[i][iCols[CONFIG.INTERACTION_COLS.CUB_ID]]).trim() === interaction.cubId) {
          lastIntForCub = intData[i];
          break;
        }
      }
      // If the edited row IS the last, use the newly written values
      if (!lastIntForCub || String(lastIntForCub[iCols[CONFIG.INTERACTION_COLS.INTERACTION_ID]]) === interactionId) {
        lastIntForCub = row; // Use the newly written row data
      }

      if (lastIntForCub) {
        const cubsSheet = _getSheetOrThrow(CONFIG.SHEETS.CUBS.NAME, ss);
        const cCols = _validateSchema(cubsSheet, CONFIG.SHEETS.CUBS.HEADERS);
        const cubsData = cubsSheet.getDataRange().getValues();
        for (let i = 1; i < cubsData.length; i++) {
          if (String(cubsData[i][cCols[CONFIG.CUB_COLS.CUB_ID]]).trim() === interaction.cubId) {
            cubsSheet.getRange(i + 1, cCols[CONFIG.CUB_COLS.LAST_ENGAGEMENT_ACTIVITY] + 1, 1, 3).setValues([[
              lastIntForCub[iCols[CONFIG.INTERACTION_COLS.DATE]] || origDateTimeStr,
              lastIntForCub[iCols[CONFIG.INTERACTION_COLS.HANDLED_BY]] || interaction.handledBy || '',
              lastIntForCub[iCols[CONFIG.INTERACTION_COLS.PURPOSE]] || interaction.purpose || ''
            ]]);
            break;
          }
        }
      }

      _bustAllDashboardCaches();
      writeLog('SUCCESS', `Edited interaction ${interactionId} by ${session.email}.`);
      return JSON.stringify({ success: true });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Saves or updates a Handover Note.
 * @param {string} token
 * @param {object} payload { noteId, summary, pendingIssues }
 */
function submitHandoverNote(token, payload) {
  try {
    const session = _requireSession(token);

    return _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const tz = Session.getScriptTimeZone();
      const sheet = _getOrCreateSheet(ss, CONFIG.SHEETS.HANDOVER_NOTES.NAME, CONFIG.SHEETS.HANDOVER_NOTES.HEADERS);
      const cols = _validateSchema(sheet, CONFIG.SHEETS.HANDOVER_NOTES.HEADERS);
      const data = sheet.getDataRange().getValues();

      let isNew = !payload.noteId;
      let noteId = payload.noteId;
      let rowIndex = -1;
      let origDateTimeStr = '';
      let loggedBy = session.name || session.email; // Fallback to email if name is not set

      if (!isNew) {
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][cols[CONFIG.HANDOVER_NOTES_COLS.NOTE_ID]]).trim() === noteId) {
            rowIndex = i + 1;
            const dateVal = data[i][cols[CONFIG.HANDOVER_NOTES_COLS.DATE]];
            origDateTimeStr = (typeof dateVal === 'object' && dateVal !== null)
              ? Utilities.formatDate(dateVal, tz, "EEE, dd-MMM-yy HH:mm:ss")
              : String(dateVal);
            
            // Security: Only allow editing if the logged in user is the owner
            const rowOwner = String(data[i][cols[CONFIG.HANDOVER_NOTES_COLS.LOGGED_BY]]).trim();
            if (rowOwner.toLowerCase() !== loggedBy.toLowerCase()) {
              throw new Error("You can only edit your own handover notes.");
            }
            break;
          }
        }
        if (rowIndex === -1) throw new Error("Note not found.");
      } else {
        noteId = `hn_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        rowIndex = sheet.getLastRow() + 1;
        origDateTimeStr = Utilities.formatDate(new Date(), tz, "EEE, dd-MMM-yy HH:mm:ss");
      }

      const row = new Array(Object.keys(cols).length).fill('');
      row[cols[CONFIG.HANDOVER_NOTES_COLS.NOTE_ID]]        = noteId;
      row[cols[CONFIG.HANDOVER_NOTES_COLS.DATE]]           = origDateTimeStr;
      row[cols[CONFIG.HANDOVER_NOTES_COLS.LOGGED_BY]]      = loggedBy;
      row[cols[CONFIG.HANDOVER_NOTES_COLS.SUMMARY]]        = payload.summary || '';
      row[cols[CONFIG.HANDOVER_NOTES_COLS.PENDING_ISSUES]] = payload.pendingIssues || '';

      sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);

      _bustAllDashboardCaches();
      writeLog('SUCCESS', `${isNew ? 'Created' : 'Edited'} handover note ${noteId} by ${session.email}.`);
      
      return JSON.stringify({ 
        success: true, 
        noteId: noteId,
        date: origDateTimeStr,
        loggedBy: loggedBy
      });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Updates the Stage, Status, Next Stage, and Completion Date in the Orientation tab.
 * @param {string} token 
 * @param {Object} payload { cubId, session, stage, stageStatus, completionDate, versionTs }
 */
function updateOrientationStage(token, payload) {
  try {
    const session = _requireSession(token);

    return _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = _getOrCreateSheet(ss, CONFIG.SHEETS.ORIENTATION.NAME, CONFIG.SHEETS.ORIENTATION.HEADERS);
      const cols = _validateSchema(sheet, CONFIG.SHEETS.ORIENTATION.HEADERS);
      const data = sheet.getDataRange().getValues();

      const tz = Session.getScriptTimeZone();
      let nextStage = '';
      if (payload.stage) {
        const stageIdx = CONFIG.STAGE_ORDER.indexOf(payload.stage);
        if (stageIdx >= 0 && stageIdx < CONFIG.STAGE_ORDER.length - 1) {
          nextStage = CONFIG.STAGE_ORDER[stageIdx + 1];
        }
      }

      let completionDateStr = payload.completionDate || '';
      if (completionDateStr) {
        try {
          const d = new Date(completionDateStr);
          if (!isNaN(d)) completionDateStr = Utilities.formatDate(d, tz, "EEE, dd-MMM-yy");
        } catch(e) {}
      }

      const user = session.name || session.email;
      const newVersionTs = Date.now().toString();

      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][cols[CONFIG.ORIENTATION_LOCAL_COLS.CUB_ID]]).trim() === payload.cubId) {
          rowIndex = i + 1;
          const currentVersionTs = String(data[i][cols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED]] || '').trim();
          if (currentVersionTs && currentVersionTs !== String(payload.versionTs || '').trim()) {
            throw new Error("Conflict: This record was modified by another user. Please refresh and try again.");
          }
          break;
        }
      }

      if (rowIndex === -1) {
        // Re-read inside the lock to guard against two reps simultaneously
        // creating the first Orientation row for the same cub.
        const freshData = sheet.getDataRange().getValues();
        let existingRowIndex = -1;
        for (let i = 1; i < freshData.length; i++) {
          if (String(freshData[i][cols[CONFIG.ORIENTATION_LOCAL_COLS.CUB_ID]]).trim() === payload.cubId) {
            existingRowIndex = i + 1;
            break;
          }
        }

        if (existingRowIndex > -1) {
          // Another write beat us to it — update that row instead of appending
          rowIndex = existingRowIndex;
        } else {
          // Confirmed no existing row: safe to append
          rowIndex = sheet.getLastRow() + 1;
        }
        const row = new Array(Object.keys(cols).length).fill('');
        row[cols[CONFIG.ORIENTATION_LOCAL_COLS.CUB_ID]] = payload.cubId;
        row[cols[CONFIG.ORIENTATION_LOCAL_COLS.SESSION]] = payload.session || '';
        row[cols[CONFIG.ORIENTATION_LOCAL_COLS.STAGE]] = payload.stage || '';
        row[cols[CONFIG.ORIENTATION_LOCAL_COLS.STAGE_STATUS]] = payload.stageStatus || '';
        row[cols[CONFIG.ORIENTATION_LOCAL_COLS.NEXT_STAGE]] = nextStage;
        row[cols[CONFIG.ORIENTATION_LOCAL_COLS.COMPLETION_DATE]] = completionDateStr;
        row[cols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED_BY]] = user;
        row[cols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED]] = newVersionTs;
        sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
      } else {
        // Update existing row — write each field to its exact column.
        // Session→Stage→StageStatus→NextStage→CompletionDate are cols 2-6,
        // but Last Updated By and Last Updated are cols 19-20 (after 13 block cols).
        // Using a full-row approach to avoid clobbering block columns.
        const existingRow = data[rowIndex - 1].slice();
        existingRow[cols[CONFIG.ORIENTATION_LOCAL_COLS.SESSION]]      = payload.session || '';
        existingRow[cols[CONFIG.ORIENTATION_LOCAL_COLS.STAGE]]        = payload.stage || '';
        existingRow[cols[CONFIG.ORIENTATION_LOCAL_COLS.STAGE_STATUS]] = payload.stageStatus || '';
        existingRow[cols[CONFIG.ORIENTATION_LOCAL_COLS.NEXT_STAGE]]   = nextStage;
        existingRow[cols[CONFIG.ORIENTATION_LOCAL_COLS.COMPLETION_DATE]] = completionDateStr;
        existingRow[cols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED_BY]] = user;
        existingRow[cols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED]]    = newVersionTs;
        sheet.getRange(rowIndex, 1, 1, existingRow.length).setValues([existingRow]);
      }

      _bustOriRcCachesOnly();
      writeLog('SUCCESS', `Updated Orientation Stage for cub ${payload.cubId} by ${user}.`);
      
      return JSON.stringify({ 
        success: true, 
        versionTs: newVersionTs,
        nextStage: nextStage
      });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Updates detailed checklist blocks in the Orientation Blocks tab.
 * @param {string} token 
 * @param {Object} payload contains cubId, block fields, and versionTs
 */
function updateOrientationBlocks(token, payload) {
  try {
    const session = _requireSession(token);

    return _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = _getOrCreateSheet(ss, CONFIG.SHEETS.ORIENTATION.NAME, CONFIG.SHEETS.ORIENTATION.HEADERS);
      const cols = _validateSchema(sheet, CONFIG.SHEETS.ORIENTATION.HEADERS);
      const data = sheet.getDataRange().getValues();

      const newVersionTs = Date.now().toString();
      const user = session.name || session.email;
      const tz = Session.getScriptTimeZone();

      const formatDt = (dStr) => {
        if (!dStr) return '';
        try {
           const d = new Date(dStr);
           if (!isNaN(d)) return Utilities.formatDate(d, tz, "EEE, dd-MMM-yy");
        } catch(e) {}
        return dStr;
      };

      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][cols[CONFIG.ORIENTATION_LOCAL_COLS.CUB_ID]]).trim() === payload.cubId) {
          rowIndex = i + 1;
          const currentVersionTs = String(data[i][cols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED]] || '').trim();
          if (currentVersionTs && currentVersionTs !== String(payload.versionTs || '').trim()) {
            throw new Error("Conflict: This record was modified by another user. Please refresh and try again.");
          }
          break;
        }
      }

      const row = new Array(Object.keys(cols).length).fill('');
      if (rowIndex !== -1) {
        for (let c = 0; c < data[rowIndex - 1].length; c++) {
          row[c] = data[rowIndex - 1][c];
        }
      }

      // Update fields from payload if they exist
      row[cols[CONFIG.ORIENTATION_LOCAL_COLS.CUB_ID]] = payload.cubId;
      if (payload.invitedStatus !== undefined) row[cols[CONFIG.ORIENTATION_LOCAL_COLS.INVITED_STATUS]] = payload.invitedStatus;
      if (payload.bookedDate !== undefined) row[cols[CONFIG.ORIENTATION_LOCAL_COLS.BOOKED_DATE]] = formatDt(payload.bookedDate);
      if (payload.bookedStatus !== undefined) row[cols[CONFIG.ORIENTATION_LOCAL_COLS.BOOKED_STATUS]] = payload.bookedStatus;
      if (payload.attendedDate !== undefined) row[cols[CONFIG.ORIENTATION_LOCAL_COLS.ATTENDED_DATE]] = formatDt(payload.attendedDate);
      if (payload.attendedStatus !== undefined) row[cols[CONFIG.ORIENTATION_LOCAL_COLS.ATTENDED_STATUS]] = payload.attendedStatus;
      if (payload.attendedFeedback !== undefined) row[cols[CONFIG.ORIENTATION_LOCAL_COLS.ATTENDED_FEEDBACK]] = payload.attendedFeedback;
      if (payload.firstWinDate !== undefined) row[cols[CONFIG.ORIENTATION_LOCAL_COLS.FW_DATE]] = formatDt(payload.firstWinDate);
      if (payload.firstWinStatus !== undefined) row[cols[CONFIG.ORIENTATION_LOCAL_COLS.FW_STATUS]] = payload.firstWinStatus;
      if (payload.firstWinFeedback !== undefined) row[cols[CONFIG.ORIENTATION_LOCAL_COLS.FW_FEEDBACK]] = payload.firstWinFeedback;
      if (payload.rcSelectedDate !== undefined) row[cols[CONFIG.ORIENTATION_LOCAL_COLS.RC_SELECTED_DATE]] = formatDt(payload.rcSelectedDate);
      if (payload.rcSelectedStatus !== undefined) row[cols[CONFIG.ORIENTATION_LOCAL_COLS.RC_SELECTED_STATUS]] = payload.rcSelectedStatus;
      if (payload.rcSelectedFeedback !== undefined) row[cols[CONFIG.ORIENTATION_LOCAL_COLS.RC_SELECTED_FEEDBACK]] = payload.rcSelectedFeedback;
      row[cols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED]] = newVersionTs;
      row[cols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED_BY]] = user;

      if (rowIndex === -1) {
        rowIndex = sheet.getLastRow() + 1;
      }
      sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);

      _bustOriRcCachesOnly();
      writeLog('SUCCESS', `Updated Orientation Blocks for cub ${payload.cubId} by ${user}.`);
      
      return JSON.stringify({ 
        success: true, 
        versionTs: newVersionTs
      });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Updates Reading Circle properties (Session, Category, Weeks Active).
 * @param {string} token 
 * @param {Object} payload { cubId, selectedSession, rcCategory, weeksActive }
 */
function updateReadingCircle(token, payload) {
  try {
    const session = _requireSession(token);

    return _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = _getOrCreateSheet(ss, CONFIG.SHEETS.READING_CIRCLE.NAME, CONFIG.SHEETS.READING_CIRCLE.HEADERS);
      const cols = _validateSchema(sheet, CONFIG.SHEETS.READING_CIRCLE.HEADERS);
      const data = sheet.getDataRange().getValues();

      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][cols[CONFIG.RC_COLS.CUB_ID]]).trim() === payload.cubId) {
          rowIndex = i + 1;
          break;
        }
      }

      if (rowIndex === -1) {
        // Append new row
        rowIndex = sheet.getLastRow() + 1;
        const row = new Array(Math.max(Object.keys(cols).length, sheet.getLastColumn())).fill('');
        row[cols[CONFIG.RC_COLS.CUB_ID]] = payload.cubId;
        row[cols[CONFIG.RC_COLS.SELECTED_SESSION]] = payload.selectedSession || '';
        row[cols[CONFIG.RC_COLS.RC_CATEGORY]] = payload.rcCategory || '';
        row[cols[CONFIG.RC_COLS.WEEKS_ACTIVE]] = payload.weeksActive || '';
        sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
      } else {
        // Update existing row (assuming contiguous cols 1, 2, 3 as defined in Config)
        sheet.getRange(rowIndex, cols[CONFIG.RC_COLS.SELECTED_SESSION] + 1, 1, 3).setValues([[
          payload.selectedSession || '',
          payload.rcCategory || '',
          payload.weeksActive || ''
        ]]);
      }

      _bustAllDashboardCaches();
      const user = session.name || session.email;
      writeLog('SUCCESS', `Updated Reading Circle props for cub ${payload.cubId} by ${user}.`);
      
      return JSON.stringify({ success: true });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Submits bulk attendance for a specific session on a specific date.
 * Creates a new dynamic date column if it doesn't exist, and logs to Attendance Log.
 * @param {string} token 
 * @param {Object} payload { session, dateStr, attendanceMap }
 *      attendanceMap = { [cubId]: "Present" | "Absent" | "Rescheduled" }
 */
function submitRCAttendance(token, payload) {
  try {
    const authSession = _requireSession(token);

    if (!payload.dateStr || !payload.session || !payload.attendanceMap) {
      throw new Error("Missing required payload fields: dateStr, session, attendanceMap");
    }

    return _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = _getOrCreateSheet(ss, CONFIG.SHEETS.READING_CIRCLE.NAME, CONFIG.SHEETS.READING_CIRCLE.HEADERS);
      let data = sheet.getDataRange().getValues();
      let headers = data[0];

      // 1. Ensure dateStr column exists
      let dateColIdx = headers.indexOf(payload.dateStr);
      if (dateColIdx === -1) {
        dateColIdx = headers.length;
        sheet.getRange(1, dateColIdx + 1).setValue(payload.dateStr);
        SpreadsheetApp.flush(); // Ensure the column is fully written before re-reading
        // Re-read data to ensure arrays are fully padded with the new column (Google Sheets pads automatically)
        data = sheet.getDataRange().getValues();
        headers = data[0];
      }

      const cols = _validateSchema(sheet, CONFIG.SHEETS.READING_CIRCLE.HEADERS);
      const cubIdCol = cols[CONFIG.RC_COLS.CUB_ID];
      const noPresentCol = cols[CONFIG.RC_COLS.NO_PRESENT];
      const lastAttendCol = cols[CONFIG.RC_COLS.LAST_ATTENDANCE_DATE];
      
      const tz = Session.getScriptTimeZone();
      let submissionPresentCount = 0;
      let hasUpdates = false;

      const existingCubIds = new Set();

      // 2. Update existing rows — sparse updates only (changed rows, not entire sheet)
      const changedRowIndices = []; // 1-based sheet row numbers that changed

      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const cubId = String(row[cubIdCol]).trim();
        if (!cubId) continue;
        
        existingCubIds.add(cubId);

        if (payload.attendanceMap.hasOwnProperty(cubId)) {
          const status = payload.attendanceMap[cubId];
          row[dateColIdx] = status;
          if (status === 'Present') submissionPresentCount++;
          hasUpdates = true;

          // Recalculate totals for this cub
          let presentCount = 0;
          let lastDate = '';
          for (let c = CONFIG.RC_STATIC_COL_COUNT; c < headers.length; c++) {
            if (String(row[c]).trim() === 'Present') {
              presentCount++;
              lastDate = headers[c]; // Header value (dateStr)
            }
          }
          row[noPresentCol] = presentCount;
          row[lastAttendCol] = lastDate;
          changedRowIndices.push(i + 1); // convert to 1-based sheet row
        }
      }

      // ── Sparse write: one setValues per changed row instead of full sheet rewrite ──
      // With 500 cubs and 5-20 changed in a session, this is 5-20 API calls vs 1 massive one.
      // Lock hold time drops from 2-3s to ~300-500ms; quota usage reduced 90%+.
      if (hasUpdates) {
        changedRowIndices.forEach(sheetRow => {
          const rowData = data[sheetRow - 1];
          sheet.getRange(sheetRow, 1, 1, rowData.length).setValues([rowData]);
        });
      }

      // 3. Append new rows for any cubs not yet in the Reading Circle tab
      const newRows = [];
      for (const cubId of Object.keys(payload.attendanceMap)) {
        if (!existingCubIds.has(cubId)) {
          const status = payload.attendanceMap[cubId];
          const row = new Array(headers.length).fill('');
          row[cubIdCol] = cubId;
          row[cols[CONFIG.RC_COLS.SELECTED_SESSION]] = payload.session;
          row[dateColIdx] = status;
          if (status === 'Present') {
            submissionPresentCount++;
            row[noPresentCol] = 1;
            row[lastAttendCol] = payload.dateStr;
          } else {
            row[noPresentCol] = 0;
            row[lastAttendCol] = '';
          }
          newRows.push(row);
        }
      }

      if (newRows.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, headers.length).setValues(newRows);
      }

      // 4. Propagate to Cubs tab so dashboard updates instantly
      if (hasUpdates || newRows.length > 0) {
        // Only propagate for cubs that actually changed
        for (const cubId of Object.keys(payload.attendanceMap)) {
          // Calculate the updated noPresent and lastDate from the fresh RC tab data for this cub
          let presentCount = 0;
          let lastDate = '';
          for (let i = 1; i < data.length; i++) {
             if (String(data[i][cubIdCol]).trim() === cubId) {
                for (let c = CONFIG.RC_STATIC_COL_COUNT; c < headers.length; c++) {
                  if (String(data[i][c]).trim() === 'Present') {
                    presentCount++;
                    lastDate = headers[c];
                  }
                }
                break;
             }
          }
          if (presentCount === 0 && lastDate === '') {
             // It might be a newly added row
             const nr = newRows.find(r => r[cubIdCol] === cubId);
             if (nr) {
                presentCount = nr[noPresentCol];
                lastDate = nr[lastAttendCol];
             }
          }
          _propagateRCToCubs_(cubId, null, presentCount, lastDate, ss);
        }
      }

      _bustAllDashboardCaches();
      writeLog('SUCCESS', `Submitted RC attendance for session ${payload.session} by ${authSession.name || authSession.email}.`);
      
      return JSON.stringify({ success: true, presentCount: submissionPresentCount });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Confirms a pending signup (RC or Orientation).
 * @param {string} token 
 * @param {Object} payload { module: 'RC'|'Orientation', pendingId, matchedCubId, selectedSession }
 */
function confirmPendingSignup(token, payload) {
  try {
    const session = _requireSession(token);
    
    return _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const moduleType = payload.module || payload.type || 'Orientation'; // support both
      const isRC = moduleType === 'RC' || moduleType === 'rc';
      const sheetName = isRC ? CONFIG.SHEETS.RC_PENDING.NAME : CONFIG.SHEETS.ORIENTATION_PENDING.NAME;
      const sheet = _getSheetOrThrow(sheetName, ss);
      const cols = _validateSchema(sheet, isRC ? CONFIG.SHEETS.RC_PENDING.HEADERS : CONFIG.SHEETS.ORIENTATION_PENDING.HEADERS);
      const data = sheet.getDataRange().getValues();
      
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][cols[CONFIG.PENDING_SIGNUP_COLS.PENDING_ID]]) === payload.pendingId) {
          rowIndex = i + 1;
          break;
        }
      }
      
      if (rowIndex === -1) {
        throw new Error("Pending record not found.");
      }
      
      const pendingRow = data[rowIndex - 1];
      const gradeStr = pendingRow[cols[CONFIG.PENDING_SIGNUP_COLS.GRADE]];
      const gradeMatch = String(gradeStr || '').match(/(\d+)/);
      const gradeNum = gradeMatch ? Number(gradeMatch[1]) : NaN;

      let finalSession = payload.selectedSession;
      if (isRC && gradeNum === 1) {
        finalSession = "Saturday - 8am"; // grade 1 override
      }

      const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEE, dd-MMM-yy HH:mm:ss");
      const user = session.name || session.email;
      
      // Delete the pending row entirely instead of updating it
      sheet.deleteRow(rowIndex);
      
      // Add to respective main module
      if (isRC) {
        const rcSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.READING_CIRCLE.NAME, CONFIG.SHEETS.READING_CIRCLE.HEADERS);
        const rcCols = _validateSchema(rcSheet, CONFIG.SHEETS.READING_CIRCLE.HEADERS);
        const rcData = rcSheet.getDataRange().getValues();
        let rcRowIdx = -1;
        for (let i = 1; i < rcData.length; i++) {
          if (String(rcData[i][rcCols[CONFIG.RC_COLS.CUB_ID]]).trim() === payload.matchedCubId) {
            rcRowIdx = i + 1;
            break;
          }
        }
        
        // Compute RC Category
        let rcCategory = "Unassigned";
        if (gradeNum === 1) {
          rcCategory = "Word Astronauts - Saturday";
        } else if (!isNaN(gradeNum) && gradeNum >= 2 && gradeNum <= 8) {
          const mainCategory = gradeNum <= 4 ? "Word Astronauts" : "Word Miners";
          const sLower = String(finalSession || '').toLowerCase();
          let day = null;
          if (sLower.includes("tuesday")) day = "Tuesday";
          else if (sLower.includes("wednesday")) day = "Wednesday";
          else if (sLower.includes("saturday")) day = "Saturday";
          else if (sLower.includes("sunday")) day = "Sunday";
          rcCategory = day ? (mainCategory + " - " + day) : "Unassigned";
        }

        if (rcRowIdx === -1) {
          rcRowIdx = rcSheet.getLastRow() + 1;
          const newRow = new Array(Math.max(Object.keys(rcCols).length, rcSheet.getLastColumn())).fill('');
          newRow[rcCols[CONFIG.RC_COLS.CUB_ID]] = payload.matchedCubId;
          newRow[rcCols[CONFIG.RC_COLS.SELECTED_SESSION]] = finalSession;
          if (rcCols[CONFIG.RC_COLS.RC_CATEGORY] !== undefined) {
             newRow[rcCols[CONFIG.RC_COLS.RC_CATEGORY]] = rcCategory;
          }
          rcSheet.getRange(rcRowIdx, 1, 1, newRow.length).setValues([newRow]);
        } else {
          rcSheet.getRange(rcRowIdx, rcCols[CONFIG.RC_COLS.SELECTED_SESSION] + 1, 1, 1).setValues([[finalSession]]);
          if (rcCols[CONFIG.RC_COLS.RC_CATEGORY] !== undefined) {
             rcSheet.getRange(rcRowIdx, rcCols[CONFIG.RC_COLS.RC_CATEGORY] + 1, 1, 1).setValues([[rcCategory]]);
          }
        }
      } else { // Orientation
        const oSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.ORIENTATION.NAME, CONFIG.SHEETS.ORIENTATION.HEADERS);
        const oCols = _validateSchema(oSheet, CONFIG.SHEETS.ORIENTATION.HEADERS);
        const oData = oSheet.getDataRange().getValues();
        let oRowIdx = -1;
        for (let i = 1; i < oData.length; i++) {
          if (String(oData[i][oCols[CONFIG.ORIENTATION_LOCAL_COLS.CUB_ID]]).trim() === payload.matchedCubId) {
            oRowIdx = i + 1;
            break;
          }
        }
        
        const versionTs = Date.now().toString();
        if (oRowIdx === -1) {
          oRowIdx = oSheet.getLastRow() + 1;
          const newRow = new Array(Object.keys(oCols).length).fill('');
          newRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.CUB_ID]] = payload.matchedCubId;
          newRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.SESSION]] = payload.selectedSession;
          newRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.STAGE]] = 'Booked';
          newRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.STAGE_STATUS]] = 'Completed';
          newRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.NEXT_STAGE]] = 'Attended';
          newRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED_BY]] = user;
          newRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED]] = versionTs;
          if (oCols[CONFIG.ORIENTATION_LOCAL_COLS.INVITED_STATUS] !== undefined) newRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.INVITED_STATUS]] = 'Yes';
          if (oCols[CONFIG.ORIENTATION_LOCAL_COLS.BOOKED_STATUS] !== undefined) {
             newRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.BOOKED_STATUS]] = 'Completed';
             newRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.BOOKED_DATE]] = now;
          }
          oSheet.getRange(oRowIdx, 1, 1, newRow.length).setValues([newRow]);
          _propagateOriStagesToMaster_(payload.matchedCubId, 'Booked', 'Completed', 'Attended', '', ss);
        } else {
          oSheet.getRange(oRowIdx, oCols[CONFIG.ORIENTATION_LOCAL_COLS.SESSION] + 1).setValue(payload.selectedSession);
          oSheet.getRange(oRowIdx, oCols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED_BY] + 1).setValue(user);
          oSheet.getRange(oRowIdx, oCols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED] + 1).setValue(versionTs);
          // if they are confirming another invite, maybe we also set Invited Status?
          // We leave the block alone if it exists.
        }
      }
      if (isRC && typeof rcCategory !== 'undefined') {
         _propagateRCToCubs_(payload.matchedCubId, rcCategory, null, null, ss);
      }
      
      _bustAllDashboardCaches();
      writeLog('SUCCESS', `Confirmed and moved ${moduleType} pending signup for ${payload.matchedCubId} by ${user}.`);
      
      return JSON.stringify({ success: true });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Rejects a pending signup.
 * @param {string} token 
 * @param {Object} payload { module: 'RC'|'Orientation', pendingId }
 */
function rejectPendingSignup(token, payload) {
  try {
    const session = _requireSession(token);
    
    return _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const moduleType = payload.module || payload.type || 'Orientation'; // support both
      const isRC = moduleType === 'RC' || moduleType === 'rc';
      const sheetName = isRC ? CONFIG.SHEETS.RC_PENDING.NAME : CONFIG.SHEETS.ORIENTATION_PENDING.NAME;
      const sheet = _getSheetOrThrow(sheetName, ss);
      const cols = _validateSchema(sheet, isRC ? CONFIG.SHEETS.RC_PENDING.HEADERS : CONFIG.SHEETS.ORIENTATION_PENDING.HEADERS);
      const data = sheet.getDataRange().getValues();
      
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][cols[CONFIG.PENDING_SIGNUP_COLS.PENDING_ID]]) === payload.pendingId) {
          rowIndex = i + 1;
          break;
        }
      }
      
      if (rowIndex === -1) {
        throw new Error("Pending record not found.");
      }
      
      const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "EEE, dd-MMM-yy HH:mm:ss");
      const user = session.name || session.email;
      
      // Delete the pending row entirely
      sheet.deleteRow(rowIndex);
      
      _bustOriRcCachesOnly();
      writeLog('SUCCESS', `Rejected and deleted ${moduleType} pending signup by ${user}.`);
      
      return JSON.stringify({ success: true });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Updates a cub's orientation journey stage blocks.
 * Ported from the old standalone Orientation Tracker Sidebar.gs.
 * @param {string} token
 * @param {Object} payload { cubId, blocks: { BOOKED, ATTENDED, FIRST_WIN, RC_SELECTED } }
 */
function updateCubJourney(token, payload) {
  try {
    const session = _requireSession(token);
    return _withScriptLock(() => {
      const ss   = SpreadsheetApp.getActiveSpreadsheet();
      const card = String(payload.cubId || '').trim();
      const user = session.name || session.email;
      if (!card) throw new Error('Cub ID is required.');

      const oSheet = _getSheetOrThrow(CONFIG.SHEETS.ORIENTATION.NAME, ss);
      const oCols  = _validateSchema(oSheet, CONFIG.SHEETS.ORIENTATION.HEADERS);
      const oData  = oSheet.getDataRange().getValues();

      let rowIndex = -1;
      for (let i = 1; i < oData.length; i++) {
        if (String(oData[i][oCols[CONFIG.ORIENTATION_LOCAL_COLS.CUB_ID]] || '').trim() === card) {
          rowIndex = i + 1;
          break;
        }
      }
      if (rowIndex === -1) throw new Error('Cub not found in Orientation sheet.');

      const rd = oSheet.getRange(rowIndex, 1, 1, oData[0].length).getValues()[0];
      const B  = payload.blocks || {};
      const tz = Session.getScriptTimeZone();
      const now = Utilities.formatDate(new Date(), tz, "EEE, dd-MMM-yy HH:mm");
      const set = (col, val) => { if (val !== undefined && val !== null && oCols[col] !== undefined) rd[oCols[col]] = val; };

      if (B.BOOKED) {
        const old = String(rd[oCols['Booked Status']] || '').trim();
        if (B.BOOKED.status && B.BOOKED.status !== old) set('Booked Date', now);
        set('Booked Status', B.BOOKED.status);
      }
      if (B.ATTENDED) {
        const old = String(rd[oCols['Attended Status']] || '').trim();
        if (B.ATTENDED.status && B.ATTENDED.status !== old) set('Attended Date', now);
        set('Attended Status', B.ATTENDED.status);
        set('Attended Feedback', B.ATTENDED.feedback);
      }
      if (B.FIRST_WIN) {
        const old = String(rd[oCols['First Win Status']] || '').trim();
        if (B.FIRST_WIN.status && B.FIRST_WIN.status !== old) set('First Win Date', now);
        set('First Win Status', B.FIRST_WIN.status);
        set('First Win Feedback', B.FIRST_WIN.feedback);
      }
      if (B.RC_SELECTED) {
        const old = String(rd[oCols['RC Selected Status']] || '').trim();
        if (B.RC_SELECTED.status && B.RC_SELECTED.status !== old) set('RC Selected Date', now);
        set('RC Selected Status', B.RC_SELECTED.status);
        set('RC Selected Feedback', B.RC_SELECTED.feedback);
      }

      const attendedStatus = String(rd[oCols['Attended Status']] || '').trim();
      const fwStatus       = String(rd[oCols['First Win Status']] || '').trim();
      const rcStatus       = String(rd[oCols['RC Selected Status']] || '').trim();
      const bookedStatus   = String(rd[oCols['Booked Status']] || '').trim();

      let stage = '', nextStage = '', stageStatus = '', completionDate = '';

      if (fwStatus === 'Yes') {
        stage = 'Completed'; nextStage = ''; stageStatus = fwStatus; completionDate = now;
      } else if (rcStatus === 'Completed') {
        stage = 'RC Selected'; nextStage = 'First Win Sent'; stageStatus = rcStatus;
      } else if (attendedStatus === 'Present') {
        stage = 'Attended'; nextStage = 'RC Selected'; stageStatus = attendedStatus;
      } else if (attendedStatus === 'Rescheduled') {
        stage = 'Rescheduled'; nextStage = 'Booked'; stageStatus = attendedStatus;
      } else if (attendedStatus === 'Absent') {
        stage = 'Absent'; nextStage = 'Booked'; stageStatus = attendedStatus;
      } else if (bookedStatus === 'Completed') {
        stage = 'Booked'; nextStage = 'Attended'; stageStatus = bookedStatus;
      }

      if (stage) {
        set('Stage', stage);
        set('Stage Status', stageStatus);
        set('Next Stage', nextStage);
        if (completionDate) set('Completion Date', completionDate);
      }

      set('Last Updated By', user);
      set('Last Updated', Date.now().toString());

      oSheet.getRange(rowIndex, 1, 1, rd.length).setValues([rd]);
      SpreadsheetApp.flush();

      if (stage) {
        _propagateOriStagesToMaster_(card, stage, stageStatus, nextStage, completionDate, ss);
      }
      _bustOriRcCachesOnly();
      writeLog('SUCCESS', `Updated orientation journey for ${card} by ${user}.`);
      return JSON.stringify({ success: true });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

function _propagateOriStagesToMaster_(cubId, stage, stageStatus, nextStage, completionDate, ss) {
  try {
    // Orientation Stage columns live on the Cubs sheet, not Master
    const cubsSheet = _getSheetOrThrow(CONFIG.SHEETS.CUBS.NAME, ss);
    const cubsHeaders = cubsSheet.getRange(1, 1, 1, cubsSheet.getLastColumn()).getValues()[0];
    const cIdx = {};
    cubsHeaders.forEach((h, i) => { cIdx[h] = i; });
    const cubsData = cubsSheet.getDataRange().getValues();

    for (let i = 1; i < cubsData.length; i++) {
      if (String(cubsData[i][cIdx['Cub ID']] || '').trim() !== cubId) continue;
      
      const row = cubsData[i];
      if (cIdx['Orientation Stage'] !== undefined) row[cIdx['Orientation Stage']] = stage;
      if (cIdx['Orientation Stage Status'] !== undefined) row[cIdx['Orientation Stage Status']] = stageStatus;
      if (cIdx['Orientation Next Stage'] !== undefined) row[cIdx['Orientation Next Stage']] = nextStage;
      if (completionDate && cIdx['Orientation Completion Date'] !== undefined) {
        row[cIdx['Orientation Completion Date']] = completionDate;
      }
      
      cubsSheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      SpreadsheetApp.flush();
      break;
    }
  } catch (e) {
    console.warn('_propagateOriStagesToMaster_ error:', e.message);
  }
}

function _propagateRCToCubs_(cubId, rcCategory, noPresent, lastAttendanceDate, ss) {
  try {
    const cubsSheet = _getSheetOrThrow(CONFIG.SHEETS.CUBS.NAME, ss);
    const cubsHeaders = cubsSheet.getRange(1, 1, 1, cubsSheet.getLastColumn()).getValues()[0];
    const cIdx = {};
    cubsHeaders.forEach((h, i) => { cIdx[h] = i; });
    const cubsData = cubsSheet.getDataRange().getValues();

    for (let i = 1; i < cubsData.length; i++) {
      if (String(cubsData[i][cIdx['Cub ID']] || '').trim() !== cubId) continue;
      
      const row = cubsData[i];
      let updated = false;
      
      if (rcCategory !== null && cIdx['Reading Circle Category'] !== undefined) {
         row[cIdx['Reading Circle Category']] = rcCategory;
         updated = true;
      }
      if (noPresent !== null && cIdx['No. Present'] !== undefined) {
         row[cIdx['No. Present']] = noPresent;
         updated = true;
      }
      if (lastAttendanceDate !== null && cIdx['Last Attendance Date'] !== undefined) {
         row[cIdx['Last Attendance Date']] = lastAttendanceDate;
         updated = true;
      }
      
      if (updated) {
         cubsSheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
         SpreadsheetApp.flush();
      }
      break;
    }
  } catch (e) {
    console.warn('_propagateRCToCubs_ error:', e.message);
  }
}

/**
 * Changes a cub's Reading Circle session.
 * Recomputes their RC Category based on their Grade in the Master directory.
 * @param {string} token 
 * @param {Object} payload { cubId, newSession }
 */
function changeCubRCSession(token, payload) {
  try {
    const session = _requireSession(token);
    
    return _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      
      // 1. Get Grade from Master to recalculate category
      const masterSheet = _getSheetOrThrow(CONFIG.SHEETS.MASTER.NAME, ss);
      const mCols = _validateSchema(masterSheet, CONFIG.SHEETS.MASTER.HEADERS);
      const mData = masterSheet.getDataRange().getValues();
      let gradeStr = '';
      for (let i = 1; i < mData.length; i++) {
        if (String(mData[i][mCols[CONFIG.COLS.CUB_ID]]).trim() === payload.cubId) {
          gradeStr = String(mData[i][mCols[CONFIG.COLS.GRADE]] || '');
          break;
        }
      }
      
      // Extract grade number
      let gradeNum = 0;
      const match = gradeStr.match(/\d+/);
      if (match) gradeNum = parseInt(match[0], 10);
      
      // Compute new category
      let newCategory = "Unassigned";
      if (gradeNum === 1) {
        newCategory = "Word Astronauts - Saturday";
      } else if (gradeNum > 1 && gradeNum <= 8) {
        const mainCategory = gradeNum <= 4 ? "Word Astronauts" : "Word Miners";
        const sessionStr = String(payload.newSession).toLowerCase();
        let day = "";
        if (sessionStr.includes('tuesday')) day = "Tuesday";
        else if (sessionStr.includes('wednesday')) day = "Wednesday";
        else if (sessionStr.includes('saturday')) day = "Saturday";
        else if (sessionStr.includes('sunday')) day = "Sunday";
        
        if (day) newCategory = `${mainCategory} - ${day}`;
      }
      
      // 2. Update Reading Circle tab
      const rcSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.READING_CIRCLE.NAME, CONFIG.SHEETS.READING_CIRCLE.HEADERS);
      const rcCols = _validateSchema(rcSheet, CONFIG.SHEETS.READING_CIRCLE.HEADERS);
      const rcData = rcSheet.getDataRange().getValues();
      
      let rcRowIdx = -1;
      for (let i = 1; i < rcData.length; i++) {
        if (String(rcData[i][rcCols[CONFIG.RC_COLS.CUB_ID]]).trim() === payload.cubId) {
          rcRowIdx = i + 1;
          break;
        }
      }
      
      if (rcRowIdx === -1) {
        // They weren't in RC, add them
        rcRowIdx = rcSheet.getLastRow() + 1;
        const newRow = new Array(Math.max(Object.keys(rcCols).length, rcSheet.getLastColumn())).fill('');
        newRow[rcCols[CONFIG.RC_COLS.CUB_ID]] = payload.cubId;
        newRow[rcCols[CONFIG.RC_COLS.SELECTED_SESSION]] = payload.newSession;
        newRow[rcCols[CONFIG.RC_COLS.RC_CATEGORY]] = newCategory;
        rcSheet.getRange(rcRowIdx, 1, 1, newRow.length).setValues([newRow]);
      } else {
        rcSheet.getRange(rcRowIdx, rcCols[CONFIG.RC_COLS.SELECTED_SESSION] + 1).setValue(payload.newSession);
        rcSheet.getRange(rcRowIdx, rcCols[CONFIG.RC_COLS.RC_CATEGORY] + 1).setValue(newCategory);
      }
      
      _propagateRCToCubs_(payload.cubId, newCategory, null, null, ss);
      _bustAllDashboardCaches();
      const user = session.name || session.email;
      writeLog('SUCCESS', `Changed RC session for ${payload.cubId} to ${payload.newSession} by ${user}.`);
      
      return JSON.stringify({ success: true, newCategory: newCategory });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Changes a cub's Orientation session.
 * @param {string} token 
 * @param {Object} payload { cubId, newSession, versionTs }
 */
function changeCubOrientationSession(token, payload) {
  try {
    const session = _requireSession(token);
    
    return _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const oSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.ORIENTATION.NAME, CONFIG.SHEETS.ORIENTATION.HEADERS);
      const oCols = _validateSchema(oSheet, CONFIG.SHEETS.ORIENTATION.HEADERS);
      const data = oSheet.getDataRange().getValues();
      
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][oCols[CONFIG.ORIENTATION_LOCAL_COLS.CUB_ID]]).trim() === payload.cubId) {
          rowIndex = i + 1;
          const currentVersionTs = String(data[i][oCols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED]] || '').trim();
          if (currentVersionTs && currentVersionTs !== String(payload.versionTs || '').trim()) {
            throw new Error("Conflict: This record was modified by another user. Please refresh and try again.");
          }
          break;
        }
      }
      
      const user = session.name || session.email;
      const newVersionTs = Date.now().toString();
      
      if (rowIndex === -1) {
        // They weren't in Orientation, add them
        rowIndex = oSheet.getLastRow() + 1;
        const newRow = new Array(Object.keys(oCols).length).fill('');
        newRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.CUB_ID]] = payload.cubId;
        newRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.SESSION]] = payload.newSession;
        newRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.STAGE]] = 'Invited';
        newRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.STAGE_STATUS]] = 'Yes';
        newRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.NEXT_STAGE]] = 'Booked';
        newRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED_BY]] = user;
        newRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED]] = newVersionTs;
        oSheet.getRange(rowIndex, 1, 1, newRow.length).setValues([newRow]);
        
        // Ensure orientation block exists
        const obSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.ORIENTATION_BLOCKS.NAME, CONFIG.SHEETS.ORIENTATION_BLOCKS.HEADERS);
        const obCols = _validateSchema(obSheet, CONFIG.SHEETS.ORIENTATION_BLOCKS.HEADERS);
        const obData = obSheet.getDataRange().getValues();
        let obRowIdx = -1;
        for (let j = 1; j < obData.length; j++) {
           if (String(obData[j][obCols[CONFIG.ORIENTATION_BLOCKS_COLS.CUB_ID]]).trim() === payload.cubId) {
             obRowIdx = j + 1;
             break;
           }
        }
        if (obRowIdx === -1) {
          const newObRow = new Array(Object.keys(obCols).length).fill('');
          newObRow[obCols[CONFIG.ORIENTATION_BLOCKS_COLS.CUB_ID]] = payload.cubId;
          newObRow[obCols[CONFIG.ORIENTATION_BLOCKS_COLS.INVITED_STATUS]] = 'Yes';
          newObRow[obCols[CONFIG.ORIENTATION_BLOCKS_COLS.LAST_UPDATED]] = newVersionTs;
          obSheet.getRange(obSheet.getLastRow() + 1, 1, 1, newObRow.length).setValues([newObRow]);
        }
      } else {
        // Update existing row
        const oRow = new Array(Object.keys(oCols).length).fill('');
        for (let c = 0; c < data[rowIndex - 1].length; c++) {
          oRow[c] = data[rowIndex - 1][c];
        }
        oRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.SESSION]] = payload.newSession;
        oRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED_BY]] = user;
        oRow[oCols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED]] = newVersionTs;
        oSheet.getRange(rowIndex, 1, 1, oRow.length).setValues([oRow]);
      }
      
      _bustOriRcCachesOnly();
      writeLog('SUCCESS', `Changed Orientation session for ${payload.cubId} to ${payload.newSession} by ${user}.`);
      
      return JSON.stringify({ success: true, versionTs: newVersionTs });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Saves dropdown configuration from the Admin Settings page.
 * Rewrites columns E, F, G, H in the local Config tab.
 * @param {string} token 
 * @param {Object} payload { type: string[], purpose: string[], status: string[], actionStatus: string[] }
 */
function saveDropdownConfig(token, payload) {
  try {
    const session = _requireSession(token);
    if (session.role !== CONFIG.ROLES.ADMIN) throw new Error("Unauthorized.");

    return _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = _getSheetOrThrow(CONFIG.ACCESS_LIST_TAB, ss);
      
      const maxRows = Math.max(
        (payload.type || []).length,
        (payload.purpose || []).length,
        (payload.status || []).length,
        (payload.actionStatus || []).length,
        1
      );

      // Clear existing columns E-H (rows 2 and down)
      const lastRow = Math.max(sheet.getLastRow(), 2);
      sheet.getRange(2, 5, lastRow, 4).clearContent();

      // Write new data
      if (maxRows > 0) {
        const newData = [];
        for (let i = 0; i < maxRows; i++) {
          newData.push([
            (payload.type || [])[i] || '',
            (payload.purpose || [])[i] || '',
            (payload.status || [])[i] || '',
            (payload.actionStatus || [])[i] || ''
          ]);
        }
        
        // Ensure sheet has enough rows
        if (sheet.getMaxRows() < maxRows + 1) {
          sheet.insertRowsAfter(sheet.getMaxRows(), (maxRows + 1) - sheet.getMaxRows());
        }

        sheet.getRange(2, 5, newData.length, 4).setValues(newData);
      }

      _bustAllDashboardCaches();
      CacheService.getScriptCache().remove('form_init_data_v3');
      writeLog('SUCCESS', `Admin ${session.name} updated dropdown configurations.`);
      return JSON.stringify({ success: true });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Saves or updates a user in the Config tab.
 * @param {string} token 
 * @param {Object} payload { rowIdx, name, role, email, password }
 */
function saveUser(token, payload) {
  try {
    const session = _requireSession(token);
    if (session.role !== CONFIG.ROLES.ADMIN) throw new Error("Unauthorized.");

    return _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = _getSheetOrThrow(CONFIG.ACCESS_LIST_TAB, ss);
      
      const newRow = [
        String(payload.name).trim(),
        String(payload.role).trim(),
        String(payload.email).trim().toLowerCase(),
        String(payload.password).trim()
      ];

      if (payload.rowIdx && payload.rowIdx > 1) {
        // Update existing row
        sheet.getRange(payload.rowIdx, 10, 1, 4).setValues([newRow]);
      } else {
        // Find first empty row in J-M or append
        const usersData = sheet.getRange('J1:M').getValues();
        let targetRow = -1;
        for (let i = 1; i < usersData.length; i++) {
          if (!String(usersData[i][0]).trim() && !String(usersData[i][2]).trim()) {
            targetRow = i + 1;
            break;
          }
        }
        
        if (targetRow === -1) {
          const lastRow = sheet.getLastRow();
          targetRow = lastRow + 1;
        }
        
        sheet.getRange(targetRow, 10, 1, 4).setValues([newRow]);
      }

      CacheService.getScriptCache().remove('access_list_v1');
      writeLog('SUCCESS', `Admin ${session.name} saved user ${payload.email}.`);
      return JSON.stringify({ success: true });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Deletes a user from the Config tab.
 * @param {string} token 
 * @param {Object} payload { rowIdx }
 */
function deleteUser(token, payload) {
  try {
    const session = _requireSession(token);
    if (session.role !== CONFIG.ROLES.ADMIN) throw new Error("Unauthorized.");

    if (!payload.rowIdx || payload.rowIdx < 2) throw new Error("Invalid row index.");

    return _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = _getSheetOrThrow(CONFIG.ACCESS_LIST_TAB, ss);
      
      // Clear cells in J-M for that row
      sheet.getRange(payload.rowIdx, 10, 1, 4).clearContent();

      CacheService.getScriptCache().remove('access_list_v1');
      writeLog('SUCCESS', `Admin ${session.name} deleted a user at row ${payload.rowIdx}.`);
      return JSON.stringify({ success: true });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Called by frontend to sync reps from Master to Config D column.
 */
function syncRepsFromMaster(token) {
  try {
    const session = _requireSession(token);
    if (session.role !== CONFIG.ROLES.ADMIN) throw new Error("Unauthorized.");

    return _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      _syncRepsFromMasterCore(ss);
      writeLog('SUCCESS', `Admin ${session.name} synced reps from Master.`);
      return JSON.stringify({ success: true });
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Core function to sync Reps from Master to Config Col D.
 * Intended to be called within a lock.
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss 
 */
function _syncRepsFromMasterCore(ss) {
  const masterSheet = _getSheetOrThrow(CONFIG.SHEETS.MASTER.NAME, ss);
  const mCols = _validateSchema(masterSheet, CONFIG.SHEETS.MASTER.HEADERS);
  const data = masterSheet.getDataRange().getValues();
  
  const uniqueReps = new Set();
  for (let i = 1; i < data.length; i++) {
    const rep = String(data[i][mCols[CONFIG.COLS.REP]] || '').trim();
    if (rep) uniqueReps.add(rep);
  }
  
  const repsArray = Array.from(uniqueReps).sort();
  const configSheet = _getSheetOrThrow(CONFIG.ACCESS_LIST_TAB, ss);
  const lastRow = Math.max(configSheet.getLastRow(), 2);
  
  configSheet.getRange(2, 4, lastRow, 1).clearContent();
  
  if (repsArray.length > 0) {
    const outData = repsArray.map(r => [r]);
    if (configSheet.getMaxRows() < repsArray.length + 1) {
      configSheet.insertRowsAfter(configSheet.getMaxRows(), (repsArray.length + 1) - configSheet.getMaxRows());
    }
    configSheet.getRange(2, 4, outData.length, 1).setValues(outData);
  }

  _bustAllDashboardCaches();
  CacheService.getScriptCache().remove('form_init_data_v3');
}


