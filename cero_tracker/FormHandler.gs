/**
 * @file FormHandler.gs
 * @description Centralized handler for Reading Circle and Orientation form submissions.
 *              Includes the dynamic date injection logic for the Orientation form.
 */

/* eslint-disable no-unused-vars */

  // ═══════════════════════════════════════════════════════════════
// FORM SUBMIT HANDLERS (Stubs for Phase 4)
  // ═══════════════════════════════════════════════════════════════

/**
 * Triggered on RC form submission.
 * @param {GoogleAppsScript.Events.FormSubmit} e 
 */
function onRCFormSubmit(e) {
  if (e && e.response) {
    _handleFormSubmit(e.response, 'Reading Circle Signup', CONFIG.SHEETS.RC_PENDING, 'RC');
  }
}

/**
 * Triggered on Orientation form submission.
 * @param {GoogleAppsScript.Events.FormSubmit} e 
 */
function onOrientationFormSubmit(e) {
  if (e && e.response) {
    _handleFormSubmit(e.response, 'Orientation Signup', CONFIG.SHEETS.ORIENTATION_PENDING, 'ORIENTATION');
  }
}

/**
 * Common handler — produces one pending row per cub found in the response.
 * Uses _withScriptLock to prevent race conditions.
 * @param {GoogleAppsScript.Forms.FormResponse} response
 * @param {string} formSource
 * @param {Object} targetSheetConfig
 * @param {'RC'|'ORIENTATION'} formType
 */
function _handleFormSubmit(response, formSource, targetSheetConfig, formType) {
  try {
    // Parse outside the lock — read-only
    const parsed = formType === 'RC'
      ? _parseRCFormResponse(response)
      : _parseOrientationFormResponse(response);

    const timestamp = Utilities.formatDate(
      response.getTimestamp(), Session.getScriptTimeZone(), "EEE, dd-MMM-yy HH:mm:ss"
    );

    // Build phone index once for the whole submission — O(N) cost shared across
    // all cub matches instead of O(M×N). Fallback to no-index if it fails.
    const phoneIndex = _buildPhoneIndex_();

    // Build one pending record per cub
    const cubRecords = parsed.cubs.map(cub => {
      const match = _autoMatch(parsed.parentPhone, cub.name, cub.libraryCard, phoneIndex);
      return {
        parentName:   parsed.parentName   || '',
        parentPhone:  parsed.parentPhone  || '',
        cubName:      cub.name            || '',
        libraryCard:  cub.libraryCard     || '',
        session:      (cub.session        || '').replace(/\s*\([^)]*\)/g, '').trim(),
        grade:        cub.grade           || '',
        matchedCubId: match.cubId         || '',
        confidence:   match.confidence,
      };
    });

    if (cubRecords.length === 0) {
      console.warn(formSource + ': no cub records found in response.');
      return;
    }

    _withScriptLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = _getOrCreateSheet(ss, targetSheetConfig.NAME, targetSheetConfig.HEADERS);
      const cols = _validateSchema(sheet, targetSheetConfig.HEADERS);
      const numCols = Object.keys(cols).length;

      // Append one row per cub in a single batched call
      const rows = cubRecords.map(rec => {
        const row = new Array(numCols).fill('');
        row[cols[CONFIG.PENDING_SIGNUP_COLS.PENDING_ID]]       = Utilities.getUuid();
        row[cols[CONFIG.PENDING_SIGNUP_COLS.TIMESTAMP]]        = timestamp;
        row[cols[CONFIG.PENDING_SIGNUP_COLS.FORM_SOURCE]]      = formSource;
        row[cols[CONFIG.PENDING_SIGNUP_COLS.PARENT_NAME]]      = rec.parentName;
        row[cols[CONFIG.PENDING_SIGNUP_COLS.PARENT_PHONE]]     = rec.parentPhone;
        row[cols[CONFIG.PENDING_SIGNUP_COLS.CUB_NAME]]         = rec.cubName;
        row[cols[CONFIG.PENDING_SIGNUP_COLS.LIBRARY_CARD]]     = rec.libraryCard;
        row[cols[CONFIG.PENDING_SIGNUP_COLS.SELECTED_SESSION]] = rec.session;
        row[cols[CONFIG.PENDING_SIGNUP_COLS.GRADE]]            = rec.grade;
        row[cols[CONFIG.PENDING_SIGNUP_COLS.MATCHED_CUB_ID]]   = rec.matchedCubId;
        row[cols[CONFIG.PENDING_SIGNUP_COLS.MATCH_CONFIDENCE]] = rec.confidence;
        row[cols[CONFIG.PENDING_SIGNUP_COLS.STATUS]]           = CONFIG.PENDING_STATUS.PENDING;
        return row;
      });

      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rows.length, numCols).setValues(rows);

      _bustAllDashboardCaches();
    });
  } catch (err) {
    console.error(formSource + ' form submit error: ' + err.message);
  }
}


  // ═══════════════════════════════════════════════════════════════
// FORM PARSERS
  // ═══════════════════════════════════════════════════════════════

/**
 * Parses a Reading Circle form response.
 * Cubs are identified by "Cub N:" prefix in question titles (e.g. "Cub 1: First Name").
 * Each cub has their own session question.
 * @param {GoogleAppsScript.Forms.FormResponse} response
 * @returns {{ parentName: string, parentPhone: string, cubs: Array }}
 */
function _parseRCFormResponse(response) {
  const result = { parentName: '', parentPhone: '', cubs: [] };
  const cubMap = {};

  const itemResponses = response.getItemResponses();
  itemResponses.forEach(ir => {
    const title = ir.getItem().getTitle();
    const titleLower = title.toLowerCase();
    const answer = Array.isArray(ir.getResponse()) ? ir.getResponse().join(', ') : String(ir.getResponse() || '');

    // Parent fields (no "Cub N:" prefix)
    if (!title.match(/Cub\s*\d/i)) {
      if (titleLower.includes('parent') || titleLower.includes('your name') || titleLower.includes('full name')) {
        result.parentName = answer;
      }
      if (titleLower.includes('phone') || titleLower.includes('whatsapp') || titleLower.includes('contact')) {
        result.parentPhone = answer;
      }
      return;
    }

    // Cub N: ... fields
    const numMatch = title.match(/Cub\s*(\d+)/i);
    if (!numMatch) return;
    const idx = parseInt(numMatch[1], 10);
    if (!cubMap[idx]) cubMap[idx] = { firstName: '', lastName: '', libraryCard: '', grade: '', school: '', session: '' };

    if (titleLower.includes('first name')) {
      cubMap[idx].firstName = answer;
    } else if (titleLower.includes('last name')) {
      cubMap[idx].lastName = answer;
    } else if (titleLower.includes('library card') || titleLower.includes('card number')) {
      cubMap[idx].libraryCard = answer;
    } else if (titleLower.includes('grade') || titleLower.includes('class')) {
      cubMap[idx].grade = answer;
    } else if (titleLower.includes('school')) {
      cubMap[idx].school = answer;
    } else if (titleLower.includes('session') || titleLower.includes('schedule') || titleLower.includes('time')) {
      cubMap[idx].session = answer;
    }
  });

  Object.keys(cubMap).sort((a, b) => parseInt(a) - parseInt(b)).forEach(k => {
    const c = cubMap[k];
    const fullName = [c.firstName || '', c.lastName || ''].filter(Boolean).join(' ').trim();
    if (!fullName) return;
    result.cubs.push({
      name:        fullName,
      libraryCard: c.libraryCard || '',
      grade:       c.grade       || '',
      school:      c.school      || '',
      session:     c.session     || '',
    });
  });

  return result;
}

/**
 * Parses an Orientation form response.
 * Cubs share one session (last session question in the form).
 * Child fields repeat without a numbered prefix — collected in order and zipped.
 * @param {GoogleAppsScript.Forms.FormResponse} response
 * @returns {{ parentName: string, parentPhone: string, cubs: Array }}
 */
function _parseOrientationFormResponse(response) {
  const result = { parentName: '', parentPhone: '', cubs: [] };
  let sharedSession = '';

  const childFirstNames   = [];
  const childLastNames    = [];
  const childLibraryCards = [];

  const itemResponses = response.getItemResponses();
  itemResponses.forEach(ir => {
    const title = ir.getItem().getTitle();
    const titleLower = title.toLowerCase();
    const answer = Array.isArray(ir.getResponse()) ? ir.getResponse().join(', ') : String(ir.getResponse() || '');

    if (!answer) return;

    if (titleLower.includes("parent's full name") || (titleLower.includes("parent") && titleLower.includes("name"))) {
      result.parentName = answer; return;
    }
    if (titleLower.includes("parent's phone") || titleLower.includes("phone number") || titleLower.includes("whatsapp")) {
      result.parentPhone = answer; return;
    }
    if (titleLower.includes("email")) return;

    if (titleLower.includes('session') || titleLower.includes('which session') || titleLower.includes('schedule')) {
      sharedSession = answer; return;
    }

    if (titleLower.includes("child's first name") || (titleLower.includes("child") && titleLower.includes("first name"))) {
      childFirstNames.push(answer); return;
    }
    if (titleLower.includes("child's last name") || (titleLower.includes("child") && titleLower.includes("last name"))) {
      childLastNames.push(answer); return;
    }
    if (titleLower.includes('library card') || titleLower.includes('card number')) {
      childLibraryCards.push(answer); return;
    }
  });

  const maxCubs = Math.max(childFirstNames.length, childLastNames.length);
  for (let i = 0; i < maxCubs; i++) {
    const firstName   = childFirstNames[i]   || '';
    const lastName    = childLastNames[i]    || '';
    const libraryCard = childLibraryCards[i] || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (!fullName) continue;
    result.cubs.push({
      name:        fullName,
      libraryCard: libraryCard,
      grade:       '',
      school:      '',
      session:     sharedSession,
    });
  }

  return result;
}
/**
 * Helper to attempt auto-matching of a submitted form against the Cubs directory.
 * @param {string} phone 
 * @param {string} cubName 
 * @param {string} libraryCard
 * @param {Map<string, string[]>} [phoneIndex] Pre-built phone→[cubId] Map for O(1) lookup.
 *   When provided, skips the full Master scan and uses O(1) phone lookup instead.
 *   Build once per form submission via _buildPhoneIndex_() before the cubs loop.
 * @returns {Object} { cubId: string|null, confidence: string }
 */
function _autoMatch(phone, cubName, libraryCard, phoneIndex) {
  let bestMatchId = null;
  let confidence = CONFIG.PENDING_CONFIDENCE.NONE;

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = _getSheetOrThrow(CONFIG.SHEETS.MASTER.NAME, ss);
    const mCols = _validateSchema(masterSheet, CONFIG.SHEETS.MASTER.HEADERS);
    const data = masterSheet.getDataRange().getValues();

    const cleanPhone = String(phone || '').replace(/\D/g, '');
    const cleanCubName = String(cubName || '').toLowerCase().trim();
    const cleanLibraryCard = String(libraryCard || '').trim().toUpperCase();

    // ── Fast path: library card is an exact Cub ID match ──────────────────
    if (cleanLibraryCard) {
      for (let i = 1; i < data.length; i++) {
        const mId = String(data[i][mCols[CONFIG.COLS.CUB_ID]]).trim();
        if (mId.toUpperCase() === cleanLibraryCard) {
          return { cubId: mId, confidence: CONFIG.PENDING_CONFIDENCE.HIGH };
        }
      }
    }

    // ── Phone lookup: use pre-built index (O(1)) or fall back to full scan ──
    const matches = [];

    if (phoneIndex && cleanPhone && cleanPhone.length >= 8) {
      // O(1): look up all cub IDs for this phone number from the pre-built index
      const candidateIds = phoneIndex.get(cleanPhone) || [];
      for (const mId of candidateIds) {
        // Try to get the name for this cubId from the full data (still need for name check)
        for (let i = 1; i < data.length; i++) {
          if (String(data[i][mCols[CONFIG.COLS.CUB_ID]]).trim() !== mId) continue;
          const cFirst = String(data[i][mCols[CONFIG.COLS.CUB_FIRST_NAME]]).toLowerCase();
          const cLast  = String(data[i][mCols[CONFIG.COLS.CUB_LAST_NAME]]).toLowerCase();
          if (cleanCubName && (cleanCubName.includes(cFirst) || cleanCubName.includes(cLast))) {
            return { cubId: mId, confidence: CONFIG.PENDING_CONFIDENCE.HIGH };
          }
          matches.push(mId);
          break;
        }
      }
    } else {
      // Fallback: linear scan (used when no phoneIndex is provided)
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const mId = String(row[mCols[CONFIG.COLS.CUB_ID]]).trim();
        if (!mId) continue;

        const pPhone = String(row[mCols[CONFIG.COLS.PARENT_PHONE]]).replace(/\D/g, '');
        const pWa = String(row[mCols[CONFIG.COLS.PARENT_WHATSAPP]]).replace(/\D/g, '');
        const cFirst = String(row[mCols[CONFIG.COLS.CUB_FIRST_NAME]]).toLowerCase();
        const cLast = String(row[mCols[CONFIG.COLS.CUB_LAST_NAME]]).toLowerCase();

        let phoneMatch = false;
        if (cleanPhone && (cleanPhone.length >= 8) && (pPhone.includes(cleanPhone) || pWa.includes(cleanPhone) || cleanPhone.includes(pPhone))) {
          phoneMatch = true;
        }

        let nameMatch = false;
        if (cleanCubName && (cleanCubName.includes(cFirst) || cleanCubName.includes(cLast))) {
          nameMatch = true;
        }

        if (phoneMatch && nameMatch) {
          return { cubId: mId, confidence: CONFIG.PENDING_CONFIDENCE.HIGH };
        } else if (phoneMatch) {
          matches.push(mId);
        }
      }
    }

    if (matches.length === 1) {
      bestMatchId = matches[0];
      confidence = CONFIG.PENDING_CONFIDENCE.HIGH; 
    } else if (matches.length > 1) {
      bestMatchId = matches[0]; 
      confidence = CONFIG.PENDING_CONFIDENCE.MEDIUM; 
    }
  } catch (e) {
    console.warn("Auto-match failed: " + e.message);
  }

  return { cubId: bestMatchId, confidence: confidence };
}

/**
 * Builds a phone → [cubId] lookup Map from Master data for O(1) phone matching.
 * Called once per form submission before the cubs loop to avoid O(M×N) scanning.
 * @returns {Map<string, string[]>} Cleaned phone string → array of matching Cub IDs
 */
function _buildPhoneIndex_() {
  const phoneIndex = new Map();
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = _getSheetOrThrow(CONFIG.SHEETS.MASTER.NAME, ss);
    const mCols = _validateSchema(masterSheet, CONFIG.SHEETS.MASTER.HEADERS);
    const data = masterSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const cubId = String(row[mCols[CONFIG.COLS.CUB_ID]]).trim();
      if (!cubId) continue;
      const pPhone = String(row[mCols[CONFIG.COLS.PARENT_PHONE]] || '').replace(/\D/g, '');
      const pWa    = String(row[mCols[CONFIG.COLS.PARENT_WHATSAPP]] || '').replace(/\D/g, '');
      if (pPhone && pPhone.length >= 8) {
        if (!phoneIndex.has(pPhone)) phoneIndex.set(pPhone, []);
        phoneIndex.get(pPhone).push(cubId);
      }
      if (pWa && pWa !== pPhone && pWa.length >= 8) {
        if (!phoneIndex.has(pWa)) phoneIndex.set(pWa, []);
        phoneIndex.get(pWa).push(cubId);
      }
    }
  } catch (e) {
    console.warn('_buildPhoneIndex_: could not build phone index:', e.message);
  }
  return phoneIndex;
}


  // ═══════════════════════════════════════════════════════════════
// DYNAMIC DATE INJECTION (Ported from Orientation Tracker)
  // ═══════════════════════════════════════════════════════════════

const WEEKDAY_NAMES_ = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * If text starts with a weekday name, inserts the next occurrence date
 * right after the day name — e.g. "Tuesday 7:00 pm" becomes
 * "Tuesday (23 Jun 2026) 7:00 pm". Never compounds on already-injected text.
 * @param {string} text
 * @returns {string}
 */
function injectNextWeekdayDate_(text) {
  const trimmed = String(text).trim();
  for (let i = 0; i < WEEKDAY_NAMES_.length; i++) {
    const dayName = WEEKDAY_NAMES_[i];
    if (trimmed.indexOf(dayName) === 0) {
      const dateStr = formatSessionDate_(getNextWeekdayDate_(i));
      return dayName + ' (' + dateStr + ')' + trimmed.substring(dayName.length);
    }
  }
  return trimmed;
}

/**
 * Returns the next Date falling on targetDayIndex (0=Sunday … 6=Saturday).
 * Today is eligible if it already matches.
 * @param {number} targetDayIndex
 * @returns {Date}
 */
function getNextWeekdayDate_(targetDayIndex) {
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const dayNameToIndex = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6
  };
  const todayName = Utilities.formatDate(now, tz, 'EEEE');
  const todayIdx = dayNameToIndex[todayName] !== undefined ? dayNameToIndex[todayName] : 0;
  const diff = (targetDayIndex - todayIdx + 7) % 7;
  return new Date(now.getTime() + diff * 24 * 60 * 60 * 1000);
}

/**
 * Helper to format the session date.
 * @param {Date} date 
 * @returns {string}
 */
function formatSessionDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'd MMM yyyy');
}

/**
 * Re-applies freshly computed dates to choice-based form questions.
 * Runs daily at 1 AM via TriggerManager.
 * @returns {void}
 */
function refreshOrientationFormDates() {
  const start = Date.now();
  const logs = [];
  let status = 'SUCCESS';

  return _withScriptLock(() => {
    try {
      const props = PropertiesService.getScriptProperties();
      const formId = props.getProperty('ORIENTATION_FORM_ID');
      if (!formId) {
        logs.push('warn:no_form_id');
        return;
      }
      
      const form = FormApp.openById(formId);
      const schemaJson = props.getProperty('ORIENTATION_FORM_SCHEMA_JSON');
      if (!schemaJson) {
        logs.push('warn:no_schema_json');
        return;
      }
      
      const schema = JSON.parse(schemaJson);

      schema.forEach(s => {
        if (!s.itemId || !s.rawOptions || s.rawOptions.length === 0) return;
        const item = form.getItemById(s.itemId);
        if (!item) return;

        const freshChoices = s.rawOptions.map(injectNextWeekdayDate_);
        const type = item.getType();
        if (type === FormApp.ItemType.MULTIPLE_CHOICE) item.asMultipleChoiceItem().setChoiceValues(freshChoices);
        else if (type === FormApp.ItemType.CHECKBOX) item.asCheckboxItem().setChoiceValues(freshChoices);
        else if (type === FormApp.ItemType.LIST) item.asListItem().setChoiceValues(freshChoices);
      });
      logs.push('dates_refreshed');
    } catch (err) {
      status = 'ERROR';
      logs.push(`error:${err.message}`);
      console.error(err);
    } finally {
      writeLog(status, logs, Date.now() - start);
    }
  });
}

/**
 * Captures the raw base options of the orientation form and saves them to script properties.
 * Must be run manually from the menu whenever form questions are added or changed.
 */
function captureOrientationFormSchema() {
  const props = PropertiesService.getScriptProperties();
  const formId = props.getProperty('ORIENTATION_FORM_ID');
  if (!formId) throw new Error("Missing ORIENTATION_FORM_ID in Script Properties.");
  
  const form = FormApp.openById(formId);
  const items = form.getItems();
  const schema = [];
  
  items.forEach(item => {
    const type = item.getType();
    let choices = [];
    if (type === FormApp.ItemType.MULTIPLE_CHOICE) choices = item.asMultipleChoiceItem().getChoices().map(c => c.getValue());
    else if (type === FormApp.ItemType.CHECKBOX) choices = item.asCheckboxItem().getChoices().map(c => c.getValue());
    else if (type === FormApp.ItemType.LIST) choices = item.asListItem().getChoices().map(c => c.getValue());
    
    if (choices.length > 0) {
      // Strip out any injected dates to get the raw option string
      // e.g. "Tuesday (06 Oct 2026) 7:00 pm" -> "Tuesday 7:00 pm"
      const rawOptions = choices.map(c => c.replace(/\s*\([^)]+\)/g, '').trim());
      schema.push({
        itemId: item.getId(),
        rawOptions: rawOptions
      });
    }
  });
  
  props.setProperty('ORIENTATION_FORM_SCHEMA_JSON', JSON.stringify(schema));
  
  const ui = SpreadsheetApp.getUi();
  if (ui) ui.alert('Success', 'Orientation form schema captured and saved to properties.', ui.ButtonSet.OK);
}
