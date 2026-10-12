/**
 * @file DashboardData.gs
 * @description Read APIs for the Web App Dashboard. Uses CacheService for speed.
 *
 * Cache Strategy: All dashboard cache keys incorporate a "cache_version" integer
 * stored in PropertiesService. Any write operation calls _bustAllDashboardCaches()
 * which increments this version, instantly making all user caches stale — no
 * per-user key tracking needed.
 */

/* eslint-disable no-unused-vars */

/**
 * Fetches high-level stats, actions, interactions, families, and cubs for the dashboard view.
 * @param {string} token
 * @returns {string} JSON payload
 */
function getDashboardData(token, adminRepFilter) {
  try {
    const session = _requireSession(token);

    let effectiveRole = session.role;
    let effectiveName = session.name;
    
    if (session.role === CONFIG.ROLES.ADMIN && adminRepFilter && adminRepFilter !== 'All Reps') {
      effectiveRole = CONFIG.ROLES.REP;
      effectiveName = adminRepFilter;
    }

    // Cache key incorporates role, email, admin filter, AND the current cache version.
    // CODE_VER is bumped on every meaningful code change to auto-bust stale caches.
    const CODE_VER = 'cv7';
    const version = _getCacheVersion();
    const cacheKey = `dash_${CODE_VER}_v${version}_${effectiveRole}_${effectiveName}`;
    const cache = CacheService.getScriptCache();

    // GAS cache max value size is 100KB. For large datasets the payload may exceed this.
    // We split into chunks using _putCacheChunked and _getCacheChunked.
    try {
      const cached = _getCacheChunked(cache, cacheKey);
      if (cached) return cached;
    } catch (e) { /* cache miss */ }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tz = Session.getScriptTimeZone();
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zero time so date comparisons are strictly boundary-based
    
    const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
    const nextMonth = new Date(today); nextMonth.setMonth(today.getMonth() + 1);

    // ── Shared date helpers (defined once, reused across all sections) ───────
    const formatDateTime = (val) => {
      if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val)) {
        return Utilities.formatDate(val, tz, "EEE, dd-MMM-yy - hh:mma")
          .replace("AM", "am").replace("PM", "pm");
      }
      return String(val);
    };
    const formatDateOnly = (val) => {
      if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val)) {
        return Utilities.formatDate(val, tz, "EEE, dd-MMM-yy");
      }
      return String(val);
    };

    // ── 0. Build cubId → parent map from Master (for family-cub linking) ────
    // Uses a lenient header reader (not _validateSchema) so minor header casing
    // or naming variations in Master don't silently empty the map.
    // B5 optimisation: read only the header row first, resolve the 5 needed column
    // indices, then read data rows limited to max(needed col index)+1 columns.
    // This cuts the per-row data volume by ~75% vs getDataRange().getValues().
    const cubToParentMap = new Map();
    try {
      const masterSheet = _getSheetOrThrow(CONFIG.SHEETS.MASTER.NAME, ss);
      const lastRow = masterSheet.getLastRow();
      if (lastRow >= 1) {
        const headerRow = masterSheet.getRange(1, 1, 1, masterSheet.getLastColumn()).getValues()[0];
        const mH = {};
        headerRow.forEach((h, i) => { if (h !== '') mH[String(h).trim()] = i; });

        const mIdCol = mH['Cub ID']           !== undefined ? mH['Cub ID']           : -1;
        const mFnCol = mH['Parent First Name'] !== undefined ? mH['Parent First Name'] : -1;
        const mLnCol = mH['Parent Last Name']  !== undefined ? mH['Parent Last Name']  : -1;
        const mPhCol = mH['Parent Phone']      !== undefined ? mH['Parent Phone']      : -1;
        const mEmCol = mH['Parent Email']      !== undefined ? mH['Parent Email']      : -1;

        if (mIdCol >= 0) {
          // Read only up to the highest needed column to minimise data transfer
          const maxNeededCol = Math.max(mIdCol, mFnCol, mLnCol, mPhCol, mEmCol) + 1;
          const masterData = lastRow > 1
            ? masterSheet.getRange(2, 1, lastRow - 1, maxNeededCol).getValues()
            : [];

          for (let i = 0; i < masterData.length; i++) {
            const r = masterData[i];
            const id = String(r[mIdCol] || '').trim();
            if (!id) continue;
            cubToParentMap.set(id, {
              parentFirstName: mFnCol >= 0 ? String(r[mFnCol] || '').trim() : '',
              parentLastName:  mLnCol >= 0 ? String(r[mLnCol] || '').trim() : '',
              parentPhone:     mPhCol >= 0 ? String(r[mPhCol] || '').trim() : '',
              parentEmail:     mEmCol >= 0 ? String(r[mEmCol] || '').trim().toLowerCase() : '',
            });
          }
        }
      }
    } catch(e) {
      console.warn('Could not build cubToParentMap from Master:', e.message);
    }

    // ── 1. Cubs ──────────────────────────────────────────────────────────────
    const cubsSheet = _getSheetOrThrow(CONFIG.SHEETS.CUBS.NAME, ss);
    const cubsData = cubsSheet.getDataRange().getValues();
    const cCols = _validateSchema(cubsSheet, CONFIG.SHEETS.CUBS.HEADERS);

    let totalCubs = 0, activeSubs = 0, expiredSubs = 0;
    let almostExpiringWeek = 0, almostExpiringMonth = 0, flaggedCubs = 0;
    const cubsList = [];

    const uniqueReps = new Set();
    const repOwnedCubIds = new Set();
    const parentKeyToFullCubs = new Map();
    
    for (let i = 1; i < cubsData.length; i++) {
      const row = cubsData[i];
      const ownerRaw = String(row[cCols[CONFIG.CUB_COLS.RELATIONSHIP_OWNER]]).trim();
      const owner = ownerRaw.toLowerCase();
      const cId = String(row[cCols[CONFIG.CUB_COLS.CUB_ID]]).trim();
      
      if (ownerRaw) uniqueReps.add(ownerRaw);
      
      const isOwnedByRep = (effectiveRole !== CONFIG.ROLES.REP || owner === effectiveName.toLowerCase());
      if (isOwnedByRep && cId) repOwnedCubIds.add(cId);

      const subStatus = String(row[cCols[CONFIG.CUB_COLS.SUB_STATUS]]).trim();
      const subStatusLc = subStatus.toLowerCase();

      const flag = String(row[cCols[CONFIG.CUB_COLS.FLAG]]).trim();

      const subEndDateVal = row[cCols[CONFIG.CUB_COLS.SUB_END_DATE]];
      let formattedEndDate = '';
      let subEndDateISO = ''; 
      let isAlmostExpiringWeek = false;
      let isAlmostExpiringMonth = false;

      if (subEndDateVal) {
        try {
          const endDate = new Date(subEndDateVal);
          if (!isNaN(endDate)) {
            // Strip time from endDate to prevent timezone drifting issues
            endDate.setHours(0, 0, 0, 0);
            
            formattedEndDate = Utilities.formatDate(endDate, tz, "dd-MMM-yyyy");
            subEndDateISO = Utilities.formatDate(endDate, tz, "yyyy-MM-dd"); 
            
            // Only count as almost expiring if the sub status in the sheet is "almost expiring"
            if (subStatusLc === 'almost expiring') {
              if (endDate >= today && endDate <= nextWeek) {
                isAlmostExpiringWeek = true;
              }
              if (endDate >= today && endDate <= nextMonth) {
                isAlmostExpiringMonth = true;
              }
            }
          }
        } catch (e) {}
      }

      const parentInfo = cubToParentMap.get(cId) || {};

      let noSubDays = '-';
      if (!subStatusLc.includes('expired')) {
        const startDateVal = row[cCols[CONFIG.CUB_COLS.SUB_START_DATE]];
        if (startDateVal) {
          try {
            const startD = new Date(startDateVal);
            if (!isNaN(startD)) {
              startD.setHours(0,0,0,0);
              // Use Math.max(0) in case start date is in the future
              const diffTime = today - startD;
              if (diffTime >= 0) {
                noSubDays = String(Math.floor(diffTime / (1000 * 60 * 60 * 24)));
              } else {
                noSubDays = '0';
              }
            }
          } catch(e) {}
        }
      }

      const cubObj = {
        cubId:                  cId,
        cubFirstName:           String(row[cCols[CONFIG.CUB_COLS.CUB_FIRST_NAME]]),
        cubLastName:            String(row[cCols[CONFIG.CUB_COLS.CUB_LAST_NAME]]),
        gender:                 String(row[cCols[CONFIG.CUB_COLS.GENDER]]),
        grade:                  String(row[cCols[CONFIG.CUB_COLS.GRADE]]),
        stream:                 String(row[cCols[CONFIG.CUB_COLS.STREAM]]),
        schoolName:             String(row[cCols[CONFIG.CUB_COLS.SCHOOL_NAME]]),
        subEndDate:             formattedEndDate,
        subEndDateISO:          subEndDateISO,
        subStatus:              subStatus,
        subStatusLc:            subStatusLc,
        noSubDays:              noSubDays,
        currentStreak:          String(row[cCols[CONFIG.CUB_COLS.CURRENT_STREAK]]),
        longestStreak:          String(row[cCols[CONFIG.CUB_COLS.LONGEST_STREAK]]),
        streakLabel:            String(row[cCols[CONFIG.CUB_COLS.STREAK_LABEL]]),
        currentLeague:          String(row[cCols[CONFIG.CUB_COLS.CURRENT_LEAGUE]]),
        medallionStatus:        String(row[cCols[CONFIG.CUB_COLS.MEDALLION_STATUS]]),
        flag:                   flag,
        cumulativePoints:       String(row[cCols[CONFIG.CUB_COLS.CUMULATIVE_POINTS]]),
        cumulativeWeeklyPoints:    String(row[cCols[CONFIG.CUB_COLS.CUMULATIVE_WEEKLY_POINTS]]),
        lastEngagementActivity:    String(row[cCols[CONFIG.CUB_COLS.LAST_ENGAGEMENT_ACTIVITY]]),
        handledBy:                 String(row[cCols[CONFIG.CUB_COLS.HANDLED_BY_LAST]]),
        purpose:                   String(row[cCols[CONFIG.CUB_COLS.PURPOSE_LAST]]),
        segment:                   String(row[cCols[CONFIG.CUB_COLS.SEGMENT]]),
        readingCircleCategory:     String(row[cCols[CONFIG.CUB_COLS.READING_CIRCLE_CATEGORY]]),
        lastAttendanceDate:        formatDateOnly(row[cCols[CONFIG.CUB_COLS.LAST_ATTENDANCE_DATE]]),
        lastReadingActivity:       String(row[cCols[CONFIG.CUB_COLS.LAST_READING_ACTIVITY]]),
        noPresent:                 String(row[cCols[CONFIG.CUB_COLS.NO_PRESENT]]),
        orientationStage:          String(row[cCols[CONFIG.CUB_COLS.ORIENTATION_STAGE]]       || ''),
        orientationStageStatus:    String(row[cCols[CONFIG.CUB_COLS.ORIENTATION_STAGE_STATUS]] || ''),
        orientationNextStage:      String(row[cCols[CONFIG.CUB_COLS.ORIENTATION_NEXT_STAGE]]  || ''),
        orientationCompletionDate: String(row[cCols[CONFIG.CUB_COLS.ORIENTATION_COMPLETION]]  || ''),
        isAlmostExpiringWeek:      isAlmostExpiringWeek,
        isAlmostExpiringMonth:     isAlmostExpiringMonth,
        // Parent linkage for drawer filtering — sourced from Master map
        parentFirstName: parentInfo.parentFirstName || '',
        parentLastName:  parentInfo.parentLastName  || '',
        parentPhone:     parentInfo.parentPhone     || '',
        parentEmail:     parentInfo.parentEmail     || '',
      };

      // Map cub to its family regardless of ownership (matching SyncService logic)
      const ph = (cubObj.parentPhone || '').trim();
      const em = (cubObj.parentEmail || '').trim().toLowerCase();
      const key = ph || em;
      
      if (key) {
        if (!parentKeyToFullCubs.has(key)) parentKeyToFullCubs.set(key, []);
        parentKeyToFullCubs.get(key).push(cubObj);
      }

      // Restrict main dashboard stats and directory list to rep-owned cubs
      if (!isOwnedByRep) continue;

      totalCubs++;
      if (subStatusLc === 'active') activeSubs++;
      else if (subStatusLc === 'expired') expiredSubs++;

      if (flag && flag !== '') flaggedCubs++;

      if (subStatusLc === 'almost expiring') {
        if (isAlmostExpiringWeek) almostExpiringWeek++;
        if (isAlmostExpiringMonth) almostExpiringMonth++;
      }

      cubsList.push(cubObj);
    }

    // ── 2. Families ──────────────────────────────────────────────────────────
    const famSheet = _getSheetOrThrow(CONFIG.SHEETS.FAMILIES.NAME, ss);
    const famData = famSheet.getDataRange().getValues();
    const fCols = _validateSchema(famSheet, CONFIG.SHEETS.FAMILIES.HEADERS);

    let totalParents = 0;
    const familiesList = [];

    for (let i = 1; i < famData.length; i++) {
      const row = famData[i];
      const owner = String(row[fCols[CONFIG.FAMILY_COLS.RELATIONSHIP_OWNER]]).trim().toLowerCase();
      // Admins see all families regardless.
      if (effectiveRole === CONFIG.ROLES.REP && owner !== effectiveName.toLowerCase()) continue;
      totalParents++;

      const fPhone = String(row[fCols[CONFIG.FAMILY_COLS.PARENT_PHONE]]).trim();
      const fEmail = String(row[fCols[CONFIG.FAMILY_COLS.PARENT_EMAIL]]).trim().toLowerCase();
      const fKey   = fPhone || fEmail;
      const familyCubs = fKey ? (parentKeyToFullCubs.get(fKey) || []) : [];

      familiesList.push({
        parentFirstName: String(row[fCols[CONFIG.FAMILY_COLS.PARENT_FIRST_NAME]]),
        parentLastName:  String(row[fCols[CONFIG.FAMILY_COLS.PARENT_LAST_NAME]]),
        parentEmail:     fEmail,
        parentPhone:     fPhone,
        parentWhatsapp:  String(row[fCols[CONFIG.FAMILY_COLS.PARENT_WHATSAPP]]),
        noCubs:          String(row[fCols[CONFIG.FAMILY_COLS.NO_CUBS]]),
        familyCubs:      familyCubs,  // Full cub objects for drawer display
      });
    }

    // ── 3. Actions ───────────────────────────────────────────────────────────
    const actSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.ACTIONS.NAME, CONFIG.SHEETS.ACTIONS.HEADERS);
    const actData = actSheet.getDataRange().getValues();
    const aCols = _validateSchema(actSheet, CONFIG.SHEETS.ACTIONS.HEADERS);

    let pendingActionsCount = 0, completedActionsCount = 0;
    const actionsList = [];

    const cubsByCubId = new Map(cubsList.map(c => [c.cubId, c]));
    
    for (let i = 1; i < actData.length; i++) {
      const row = actData[i];
      const actCubId = String(row[aCols[CONFIG.ACTION_COLS.CUB_ID]]).trim();

      // Visibility rule for Reps: show the action if this rep OWNS the cub.
      // The action belongs to the relationship, not to whoever logged it that day.
      // Admins see all actions regardless.
      if (effectiveRole === CONFIG.ROLES.REP && !repOwnedCubIds.has(actCubId)) continue;

      const actStatus = String(row[aCols[CONFIG.ACTION_COLS.ACTION_STATUS]]).trim();
      if (actStatus === 'Completed') completedActionsCount++;
      else pendingActionsCount++;

      // isOverdue: ACTION_STATUS is set to 'Overdue' by _updateOverdueActionsStatus.
      // OVERDUE_STATUS column is a separate display column; do NOT use it for the boolean flag.
      const isOverdue = actStatus === 'Overdue';

      // Build an ISO sort key from the deadline value for reliable client-side sort
      const deadlineVal = row[aCols[CONFIG.ACTION_COLS.ACTION_DEADLINE]];
      let deadlineSortKey = '';
      if (deadlineVal) {
        try {
          const d = new Date(deadlineVal);
          if (!isNaN(d)) deadlineSortKey = Utilities.formatDate(d, tz, "yyyy-MM-dd");
        } catch(e) {}
      }

      const matchingCub = cubsByCubId.get(actCubId) || {};

      actionsList.push({
        interactionId:    String(row[aCols[CONFIG.ACTION_COLS.INTERACTION_ID]]),
        date:             formatDateTime(row[aCols[CONFIG.ACTION_COLS.DATE]]),
        parentFirstName:  String(row[aCols[CONFIG.ACTION_COLS.PARENT_FIRST_NAME]]),
        parentLastName:   String(row[aCols[CONFIG.ACTION_COLS.PARENT_LAST_NAME]]),
        cubId:            actCubId,
        cubFirstName:     String(row[aCols[CONFIG.ACTION_COLS.CUB_FIRST_NAME]]),
        cubLastName:      String(row[aCols[CONFIG.ACTION_COLS.CUB_LAST_NAME]]),
        handledBy:        String(row[aCols[CONFIG.ACTION_COLS.HANDLED_BY]]),
        action:           String(row[aCols[CONFIG.ACTION_COLS.ACTION]]),
        actionDeadline:   formatDateOnly(deadlineVal),
        actionDeadlineSortKey: deadlineSortKey, // ISO yyyy-MM-dd for reliable sort
        actionStatus:     String(row[aCols[CONFIG.ACTION_COLS.ACTION_STATUS]]),
        isOverdue:        isOverdue,
        subStatus:        matchingCub.subStatus || '',
        subStatusLc:      matchingCub.subStatusLc || '',
        orientationStage: matchingCub.orientationStage || '',
        flag:             matchingCub.flag || ''
      });
    }


    // Sort actions by ISO sort key ascending (earliest deadline first)
    actionsList.sort((a, b) => {
      if (!a.actionDeadlineSortKey) return 1;
      if (!b.actionDeadlineSortKey) return -1;
      return a.actionDeadlineSortKey.localeCompare(b.actionDeadlineSortKey);
    });

    // ── 4. Interactions ──────────────────────────────────────────────────────
    const intSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.INTERACTIONS.NAME, CONFIG.SHEETS.INTERACTIONS.HEADERS);
    const intData = intSheet.getDataRange().getValues();
    const intCols = _validateSchema(intSheet, CONFIG.SHEETS.INTERACTIONS.HEADERS);
    const interactionsList = [];

    for (let i = 1; i < intData.length; i++) {
      const row = intData[i];
      const handledByRaw = String(row[intCols[CONFIG.INTERACTION_COLS.HANDLED_BY]]).trim();
      const handledByLc  = handledByRaw.toLowerCase();
      const cubId        = String(row[intCols[CONFIG.INTERACTION_COLS.CUB_ID]]).trim();

      // Visibility rule for Reps:
      // A rep's dashboard interactions tab shows:
      // 1. ALL interactions logged on Cubs they own (regardless of who logged it)
      // 2. ALL interactions THEY logged (even on Cubs they don't own)
      const isOwnContact = repOwnedCubIds.has(cubId);
      const loggedByMe   = (handledByLc === effectiveName.toLowerCase());
      
      if (effectiveRole === CONFIG.ROLES.REP && !isOwnContact && !loggedByMe) continue;

      const isOwnContactFlag = (effectiveRole === CONFIG.ROLES.ADMIN) ? true : isOwnContact;

      interactionsList.push({
        interactionId:   String(row[intCols[CONFIG.INTERACTION_COLS.INTERACTION_ID]]),
        date:            formatDateTime(row[intCols[CONFIG.INTERACTION_COLS.DATE]]),
        cubId:           cubId,
        cubName:         `${String(row[intCols[CONFIG.INTERACTION_COLS.CUB_FIRST_NAME]])} ${String(row[intCols[CONFIG.INTERACTION_COLS.CUB_LAST_NAME]])}`,
        parentName:      `${String(row[intCols[CONFIG.INTERACTION_COLS.PARENT_FIRST_NAME]])} ${String(row[intCols[CONFIG.INTERACTION_COLS.PARENT_LAST_NAME]])}`,
        parentFirstName: String(row[intCols[CONFIG.INTERACTION_COLS.PARENT_FIRST_NAME]]),
        parentLastName:  String(row[intCols[CONFIG.INTERACTION_COLS.PARENT_LAST_NAME]]),
        type:            String(row[intCols[CONFIG.INTERACTION_COLS.TYPE]]),
        purpose:         String(row[intCols[CONFIG.INTERACTION_COLS.PURPOSE]]),
        status:          String(row[intCols[CONFIG.INTERACTION_COLS.STATUS]]),
        feedback:        String(row[intCols[CONFIG.INTERACTION_COLS.FEEDBACK]]),
        handledBy:       handledByRaw,
        actionRequired:  String(row[intCols[CONFIG.INTERACTION_COLS.ACTION_REQUIRED]]),
        action:          String(row[intCols[CONFIG.INTERACTION_COLS.ACTION]]),
        actionDeadlineRaw: (() => {
          const dv = row[intCols[CONFIG.INTERACTION_COLS.ACTION_DEADLINE]];
          if (!dv) return '';
          try {
            const d = new Date(dv);
            if (!isNaN(d)) return Utilities.formatDate(d, tz, "yyyy-MM-dd");
          } catch(e) {}
          return String(dv);
        })(),
        actionStatus:    String(row[intCols[CONFIG.INTERACTION_COLS.ACTION_STATUS]]),
        // Visibility flags for client-side tab splitting
        isOwnContact:    isOwnContact,
        loggedByMe:      loggedByMe,
      });
    }

    // Reverse for newest-first (interactions appended to bottom of sheet)
    interactionsList.reverse();

    // ── 5. Email History ─────────────────────────────────────────────────────
    const emailHistoryMap = new Map();
    try {
      const emailHistSheet = ss.getSheetByName(CONFIG.SHEETS.EMAIL_HISTORY.NAME);
      if (emailHistSheet) {
        const emailHistData = emailHistSheet.getDataRange().getValues();
        const ehHeaderRow = emailHistData[0] || [];
        const ehH = {};
        ehHeaderRow.forEach((h, idx) => { if (h !== '') ehH[String(h).trim()] = idx; });
        
        const idCol = ehH['Cub ID'];
        if (idCol !== undefined) {
          for (let i = 1; i < emailHistData.length; i++) {
            const row = emailHistData[i];
            const cId = String(row[idCol]).trim();
            if (!cId) continue;
            
            const history = [];
            for (let m = 1; m <= 7; m++) {
              const dCol = ehH[`Msg ${m} Date`];
              const tCol = ehH[`Msg ${m} Type`];
              const mDateVal = dCol !== undefined ? row[dCol] : '';
              const mType = tCol !== undefined ? String(row[tCol] || '').trim() : '';
              
              if (mDateVal || mType) {
                // Parse date safely
                let parsedDate = '-';
                if (mDateVal) {
                  try {
                    const d = new Date(mDateVal);
                    if (!isNaN(d)) {
                       parsedDate = Utilities.formatDate(d, tz, "dd-MMM-yyyy");
                    } else {
                       parsedDate = String(mDateVal);
                    }
                  } catch(e) {
                     parsedDate = String(mDateVal);
                  }
                }
                history.push({
                  date: parsedDate,
                  type: mType || '-'
                });
              }
            }
            // Reverse so newest msg (higher index) is on top
            history.reverse();
            emailHistoryMap.set(cId, history);
          }
        }
      }
    } catch(e) {
      console.warn('Could not process Email History:', e.message);
    }

    // Attach email history to cubs list
    for (const cub of cubsList) {
      cub.emailHistory = emailHistoryMap.get(cub.cubId) || [];
    }

    // ── 6. Reading Circle (Local) ────────────────────────────────────────────
    const rcList = [];
    try {
      const rcSheet = _getSheetOrThrow(CONFIG.SHEETS.READING_CIRCLE.NAME, ss);
      const rcData = rcSheet.getDataRange().getValues();
      if (rcData.length > 1) {
        const rcCols = _validateSchema(rcSheet, CONFIG.SHEETS.READING_CIRCLE.HEADERS);
        for (let i = 1; i < rcData.length; i++) {
          const row = rcData[i];
          const cubId = String(row[rcCols[CONFIG.RC_COLS.CUB_ID]]).trim();
          if (!cubId) continue;
          rcList.push({
            cubId: cubId,
            selectedSession: String(row[rcCols[CONFIG.RC_COLS.SELECTED_SESSION]] || ''),
            rcCategory:      String(row[rcCols[CONFIG.RC_COLS.RC_CATEGORY]] || ''),
            weeksActive:     String(row[rcCols[CONFIG.RC_COLS.WEEKS_ACTIVE]] || ''),
            noPresent:       String(row[rcCols[CONFIG.RC_COLS.NO_PRESENT]] || ''),
            lastAttendanceDate: formatDateOnly(row[rcCols[CONFIG.RC_COLS.LAST_ATTENDANCE_DATE]])
          });
        }
      }
    } catch(e) { console.warn('Could not process Reading Circle:', e.message); }

    // ── 7. Orientation (Local) ───────────────────────────────────────────────
    const orientationList = [];
    try {
      const oriSheet = _getSheetOrThrow(CONFIG.SHEETS.ORIENTATION.NAME, ss);
      const oriData = oriSheet.getDataRange().getValues();
      if (oriData.length > 1) {
        const oriCols = _validateSchema(oriSheet, CONFIG.SHEETS.ORIENTATION.HEADERS);
        for (let i = 1; i < oriData.length; i++) {
          const row = oriData[i];
          const cubId = String(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.CUB_ID]]).trim();
          if (!cubId) continue;
          orientationList.push({
            cubId: cubId,
            session:        String(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.SESSION]] || ''),
            stage:          String(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.STAGE]] || ''),
            stageStatus:    String(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.STAGE_STATUS]] || ''),
            nextStage:      String(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.NEXT_STAGE]] || ''),
            completionDate: formatDateOnly(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.COMPLETION_DATE]]),
            lastUpdatedBy:  String(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED_BY]] || ''),
            versionTs:      String(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.LAST_UPDATED]] || ''), // For optimistic locking
            invitedStatus:      String(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.INVITED_STATUS]] || ''),
            bookedDate:         formatDateOnly(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.BOOKED_DATE]]),
            bookedStatus:       String(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.BOOKED_STATUS]] || ''),
            attendedDate:       formatDateOnly(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.ATTENDED_DATE]]),
            attendedStatus:     String(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.ATTENDED_STATUS]] || ''),
            attendedFeedback:   String(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.ATTENDED_FEEDBACK]] || ''),
            firstWinDate:       formatDateOnly(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.FW_DATE]]),
            firstWinStatus:     String(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.FW_STATUS]] || ''),
            firstWinFeedback:   String(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.FW_FEEDBACK]] || ''),
            rcSelectedDate:     formatDateOnly(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.RC_SELECTED_DATE]]),
            rcSelectedStatus:   String(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.RC_SELECTED_STATUS]] || ''),
            rcSelectedFeedback: String(row[oriCols[CONFIG.ORIENTATION_LOCAL_COLS.RC_SELECTED_FEEDBACK]] || '')
          });
        }
      }
    } catch(e) { console.warn('Could not process Orientation:', e.message); }

    const orientationBlocksList = orientationList;

    // ── 9. Pending Signup Counts ─────────────────────────────────────────────
    let rcPendingCount = 0;
    let orientationPendingCount = 0;
    try {
      const rcPendSheet = _getSheetOrThrow(CONFIG.SHEETS.RC_PENDING.NAME, ss);
      const rcPendData = rcPendSheet.getDataRange().getValues();
      if (rcPendData.length > 1) {
        const pCols = _validateSchema(rcPendSheet, CONFIG.SHEETS.RC_PENDING.HEADERS);
        for (let i = 1; i < rcPendData.length; i++) {
          if (String(rcPendData[i][pCols[CONFIG.PENDING_SIGNUP_COLS.STATUS]]).trim() === CONFIG.PENDING_STATUS.PENDING) rcPendingCount++;
        }
      }
    } catch(e) {}
    try {
      const oriPendSheet = _getSheetOrThrow(CONFIG.SHEETS.ORIENTATION_PENDING.NAME, ss);
      const oriPendData = oriPendSheet.getDataRange().getValues();
      if (oriPendData.length > 1) {
        const pCols = _validateSchema(oriPendSheet, CONFIG.SHEETS.ORIENTATION_PENDING.HEADERS);
        for (let i = 1; i < oriPendData.length; i++) {
          if (String(oriPendData[i][pCols[CONFIG.PENDING_SIGNUP_COLS.STATUS]]).trim() === CONFIG.PENDING_STATUS.PENDING) orientationPendingCount++;
        }
      }
    } catch(e) {}

    // ── Build & cache result ─────────────────────────────────────────────────
    const resultPayload = JSON.stringify({
      success: true,
      stats: {
        totalParents, totalCubs, activeSubs, expiredSubs,
        almostExpiringWeek, almostExpiringMonth, flaggedCubs,
        completedActionsCount, pendingActionsCount,
        rcPendingCount, orientationPendingCount
      },
      actions:      actionsList,
      interactions: interactionsList,
      families:     familiesList,
      cubs:         cubsList,
      readingCircleList:     rcList,
      orientationList:       orientationList,
      orientationBlocksList: orientationBlocksList,
      reps:         Array.from(uniqueReps).sort(),
      constants: {
        rcSessions: CONFIG.RC_SESSIONS,
        orientationSessions: CONFIG.ORIENTATION_SESSIONS,
        stageBlocks: CONFIG.STAGE_BLOCKS
      }
    });

    try {
      _putCacheChunked(cache, cacheKey, resultPayload, CONFIG.CACHE_TTL_SECONDS);
    } catch (e) {
      console.warn('Could not cache dashboard data:', e.message);
    }

    return resultPayload;

  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Fetches the last 50 interactions for a specific cub, newest-first.
 * Used by the history preview panel in the Log Interaction form.
 * Intentionally NOT cached — must be fresh on every form open.
 * @param {string} token
 * @param {string} cubId
 * @returns {string} JSON array of interaction objects
 */
function getInteractionsForCub(token, cubId) {
  try {
    _requireSession(token);
    if (!cubId) return JSON.stringify({ success: true, interactions: [] });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tz = Session.getScriptTimeZone();
    const intSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.INTERACTIONS.NAME, CONFIG.SHEETS.INTERACTIONS.HEADERS);
    const intData = intSheet.getDataRange().getValues();
    const intCols = _validateSchema(intSheet, CONFIG.SHEETS.INTERACTIONS.HEADERS);

    const formatDateTime = (val) => {
      if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val)) {
        return Utilities.formatDate(val, tz, "EEE, dd-MMM-yy - hh:mma")
          .replace("AM", "am").replace("PM", "pm");
      }
      return String(val);
    };

    const results = [];
    const MAX = 50;

    // Scan bottom-up so we collect newest rows first efficiently
    for (let i = intData.length - 1; i >= 1 && results.length < MAX; i--) {
      const row = intData[i];
      if (String(row[intCols[CONFIG.INTERACTION_COLS.CUB_ID]]).trim() !== cubId) continue;
      results.push({
        date:      formatDateTime(row[intCols[CONFIG.INTERACTION_COLS.DATE]]),
        handledBy: String(row[intCols[CONFIG.INTERACTION_COLS.HANDLED_BY]]),
        type:      String(row[intCols[CONFIG.INTERACTION_COLS.TYPE]]),
        status:    String(row[intCols[CONFIG.INTERACTION_COLS.STATUS]]),
        purpose:   String(row[intCols[CONFIG.INTERACTION_COLS.PURPOSE]]),
        feedback:  String(row[intCols[CONFIG.INTERACTION_COLS.FEEDBACK]]),
      });
    }

    return JSON.stringify({ success: true, interactions: results });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Fetches ALL pending actions across all reps, enriched with the Relationship Owner
 * from the Cubs tab. Used by the Cover page so any CRF can see and act on
 * another rep's pending tasks without logging into that rep's session.
 * @param {string} token
 * @returns {string} JSON array of action objects with `relationshipOwner` field
 */
function getCoverActions(token) {
  try {
    _requireSession(token);

    const CODE_VER = 'cv6';
    const version = _getCacheVersion();
    const cacheKey = `cover_${CODE_VER}_v${version}`;
    const cache = CacheService.getScriptCache();

    try {
      const cached = _getCacheChunked(cache, cacheKey);
      if (cached) return cached;
    } catch (e) { /* cache miss */ }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tz = Session.getScriptTimeZone();

    const formatDateOnly = (val) => {
      if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val)) {
        return Utilities.formatDate(val, tz, 'EEE, dd-MMM-yy');
      }
      return String(val);
    };

    // ── 1. Build cubId → {owner, subStatus, orientationStage, flag} map from Cubs tab ─────
    const cubInfoMap = new Map();
    try {
      const cubsSheet = _getSheetOrThrow(CONFIG.SHEETS.CUBS.NAME, ss);
      const cubsData = cubsSheet.getDataRange().getValues();
      const cCols = _validateSchema(cubsSheet, CONFIG.SHEETS.CUBS.HEADERS);
      for (let i = 1; i < cubsData.length; i++) {
        const id = String(cubsData[i][cCols[CONFIG.CUB_COLS.CUB_ID]]).trim();
        if (!id) continue;
        cubInfoMap.set(id, {
          owner:            String(cubsData[i][cCols[CONFIG.CUB_COLS.RELATIONSHIP_OWNER]]  || '').trim(),
          subStatus:        String(cubsData[i][cCols[CONFIG.CUB_COLS.SUB_STATUS]]          || '').trim(),
          orientationStage: String(cubsData[i][cCols[CONFIG.CUB_COLS.ORIENTATION_STAGE]]   || '').trim(),
          flag:             String(cubsData[i][cCols[CONFIG.CUB_COLS.FLAG]]                 || '').trim(),
        });
      }
    } catch (e) {
      console.warn('getCoverActions: could not build cubInfoMap:', e.message);
    }

    // ── 2. Read Actions tab — all rows, no rep filter ────────────────────────
    const actSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.ACTIONS.NAME, CONFIG.SHEETS.ACTIONS.HEADERS);
    const actData = actSheet.getDataRange().getValues();
    const aCols = _validateSchema(actSheet, CONFIG.SHEETS.ACTIONS.HEADERS);

    const result = [];

    for (let i = 1; i < actData.length; i++) {
      const row = actData[i];
      const actCubId = String(row[aCols[CONFIG.ACTION_COLS.CUB_ID]]).trim();
      const actStatus = String(row[aCols[CONFIG.ACTION_COLS.ACTION_STATUS]]).trim();

      // Skip terminal statuses
      if (actStatus === 'Completed' || actStatus === 'Cancelled') continue;

      // isOverdue: ACTION_STATUS is set to 'Overdue' by _updateOverdueActionsStatus.
      // OVERDUE_STATUS column is a separate display column; do NOT use it for the boolean flag.
      const isOverdue = actStatus === 'Overdue';

      const deadlineVal = row[aCols[CONFIG.ACTION_COLS.ACTION_DEADLINE]];
      let deadlineSortKey = '';
      if (deadlineVal) {
        try {
          const d = new Date(deadlineVal);
          if (!isNaN(d)) deadlineSortKey = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
        } catch (e) {}
      }

      const cubInfo = cubInfoMap.get(actCubId) || {};

      result.push({
        interactionId:    String(row[aCols[CONFIG.ACTION_COLS.INTERACTION_ID]]),
        cubId:            actCubId,
        cubFirstName:     String(row[aCols[CONFIG.ACTION_COLS.CUB_FIRST_NAME]]),
        cubLastName:      String(row[aCols[CONFIG.ACTION_COLS.CUB_LAST_NAME]]),
        parentFirstName:  String(row[aCols[CONFIG.ACTION_COLS.PARENT_FIRST_NAME]]),
        parentLastName:   String(row[aCols[CONFIG.ACTION_COLS.PARENT_LAST_NAME]]),
        handledBy:        String(row[aCols[CONFIG.ACTION_COLS.HANDLED_BY]]),
        action:           String(row[aCols[CONFIG.ACTION_COLS.ACTION]]),
        actionDeadline:   formatDateOnly(deadlineVal),
        actionDeadlineSortKey: deadlineSortKey,
        actionStatus:     actStatus,
        isOverdue:        isOverdue,
        // Enriched from Cubs tab
        relationshipOwner: cubInfo.owner || String(row[aCols[CONFIG.ACTION_COLS.HANDLED_BY]]),
        subStatus:         cubInfo.subStatus        || '',
        orientationStage:  cubInfo.orientationStage || '',
        flag:              cubInfo.flag             || '',
      });
    }

    // Sort by deadline ascending (earliest first)
    result.sort((a, b) => {
      if (!a.actionDeadlineSortKey) return 1;
      if (!b.actionDeadlineSortKey) return -1;
      return a.actionDeadlineSortKey.localeCompare(b.actionDeadlineSortKey);
    });

    const payload = JSON.stringify({ success: true, actions: result });

    try {
      _putCacheChunked(cache, cacheKey, payload, CONFIG.CACHE_TTL_SECONDS);
    } catch (e) {
      console.warn('Could not cache cover actions:', e.message);
    }

    return payload;

  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Fetches all Handover Notes.
 * @param {string} token
 * @returns {string} JSON array of note objects
 */
function getHandoverNotes(token) {
  try {
    _requireSession(token);

    const CODE_VER = 'hn1';
    const version = _getCacheVersion();
    const cacheKey = `handover_${CODE_VER}_v${version}`;
    const cache = CacheService.getScriptCache();

    try {
      const cached = _getCacheChunked(cache, cacheKey);
      if (cached) return cached;
    } catch (e) { /* cache miss */ }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tz = Session.getScriptTimeZone();

    const hnSheet = _getOrCreateSheet(ss, CONFIG.SHEETS.HANDOVER_NOTES.NAME, CONFIG.SHEETS.HANDOVER_NOTES.HEADERS);
    const hnData = hnSheet.getDataRange().getValues();
    const hCols = _validateSchema(hnSheet, CONFIG.SHEETS.HANDOVER_NOTES.HEADERS);

    const result = [];
    for (let i = 1; i < hnData.length; i++) {
      const row = hnData[i];
      let dateVal = row[hCols[CONFIG.HANDOVER_NOTES_COLS.DATE]];
      let displayDate = '';
      let dateSortKey = '';
      if (dateVal) {
        try {
          const d = new Date(dateVal);
          if (!isNaN(d)) {
            displayDate = Utilities.formatDate(d, tz, 'EEE, dd-MMM-yy hh:mma');
            dateSortKey = d.getTime();
          } else {
            displayDate = String(dateVal);
            dateSortKey = 0;
          }
        } catch(e) {
          displayDate = String(dateVal);
          dateSortKey = 0;
        }
      }

      result.push({
        noteId:        String(row[hCols[CONFIG.HANDOVER_NOTES_COLS.NOTE_ID]]),
        date:          displayDate,
        dateSortKey:   dateSortKey,
        loggedBy:      String(row[hCols[CONFIG.HANDOVER_NOTES_COLS.LOGGED_BY]]),
        summary:       String(row[hCols[CONFIG.HANDOVER_NOTES_COLS.SUMMARY]]),
        pendingIssues: String(row[hCols[CONFIG.HANDOVER_NOTES_COLS.PENDING_ISSUES]]),
      });
    }

    // Sort descending by date
    result.sort((a, b) => b.dateSortKey - a.dateSortKey);

    const payload = JSON.stringify({ success: true, notes: result });
    try {
      _putCacheChunked(cache, cacheKey, payload, CONFIG.CACHE_TTL_SECONDS);
    } catch (e) {
      console.warn('Could not cache handover notes:', e.message);
    }

    return payload;

  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Searches Master for a query, matching Cubs name, Parent name, or phone.
 * When searchAll=true, bypasses the rep filter so reps can log interactions
 * for any cub (cross-rep logging from the header button).
 * @param {string} token
 * @param {string} query
 * @param {boolean} [searchAll=false] — true = search entire master, ignoring rep filter
 * @returns {string} JSON array of matches
 */
function searchContacts(token, query, searchAll) {
  try {
    const session = _requireSession(token);
    const q = (query || '').toLowerCase().trim();
    if (q.length < 2) return JSON.stringify([]);

    const CODE_VER = 'cv5';
    const searchVer = parseInt(PropertiesService.getScriptProperties().getProperty('search_cache_version') || '1', 10);
    const cacheKey = `search_idx_${CODE_VER}_v${searchVer}`;
    const cache = CacheService.getScriptCache();
    let searchableList = [];
    
    const cachedIdx = _getCacheChunked(cache, cacheKey);
    if (cachedIdx) {
      searchableList = JSON.parse(cachedIdx);
    } else {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const masterSheet = _getSheetOrThrow(CONFIG.SHEETS.MASTER.NAME, ss);
      const masterData = masterSheet.getDataRange().getValues();
      const mCols = _validateSchema(masterSheet, CONFIG.SHEETS.MASTER.HEADERS);
      
      for (let i = 1; i < masterData.length; i++) {
        const row = masterData[i];
        searchableList.push({
          cubId: String(row[mCols[CONFIG.COLS.CUB_ID]]).trim(),
          owner: String(row[mCols[CONFIG.COLS.REP]]).trim().toLowerCase(),
          repName: String(row[mCols[CONFIG.COLS.REP]]).trim(),
          cFirst: String(row[mCols[CONFIG.COLS.CUB_FIRST_NAME]]).trim(),
          cLast: String(row[mCols[CONFIG.COLS.CUB_LAST_NAME]]).trim(),
          pFirst: String(row[mCols[CONFIG.COLS.PARENT_FIRST_NAME]]).trim(),
          pLast: String(row[mCols[CONFIG.COLS.PARENT_LAST_NAME]]).trim(),
          pPhone: String(row[mCols[CONFIG.COLS.PARENT_PHONE]]).trim()
        });
      }
      
      try {
        _putCacheChunked(cache, cacheKey, JSON.stringify(searchableList), 3600);
      } catch (e) { }
    }

    const results = [];
    const maxResults = 15;
    const bypassFilter = searchAll === true || session.role === CONFIG.ROLES.ADMIN;
    const sessionNameLower = session.name.toLowerCase();

    for (const item of searchableList) {
      if (!bypassFilter && item.owner !== sessionNameLower) continue;

      const searchStr = `${item.cFirst} ${item.cLast} ${item.pFirst} ${item.pLast} ${item.pPhone} ${item.cubId}`.toLowerCase();
      
      if (searchStr.includes(q)) {
        results.push({
          cubId: item.cubId,
          cubFirstName: item.cFirst,
          cubLastName: item.cLast,
          parentFirstName: item.pFirst,
          parentLastName: item.pLast,
          parentPhone: item.pPhone,
          repName: item.repName,
          isOwnContact: item.owner === sessionNameLower,
        });
        if (results.length >= maxResults) break;
      }
    }

    return JSON.stringify(results);

  } catch (err) {
    console.error('searchContacts Error: ', err);
    return JSON.stringify([]);
  }
}


/**
 * Gets initialization data for forms (dropdowns).
 * @param {string} token
 */
function getFormInitData(token) {
  try {
    _requireSession(token);

    const cache = CacheService.getScriptCache();
    const cacheKey = 'form_init_data_v3';
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const localConfigSheet = _getSheetOrThrow(CONFIG.ACCESS_LIST_TAB, ss);
    const localData = localConfigSheet.getRange('D2:O').getValues();

    const extractCol = (data, colIdx) => {
      return Array.from(new Set(data.map(r => String(r[colIdx] || '').trim()).filter(v => v !== '')));
    };

    const dropdowns = {
      handledBy:         extractCol(localData, 0),  // D
      type:              extractCol(localData, 1),  // E
      purpose:           extractCol(localData, 2),  // F
      status:            extractCol(localData, 3),  // G
      actionStatus:      extractCol(localData, 4),  // H
      orientationStages: extractCol(localData, 11), // O (Index 11 because D is 0)
    };

    const payload = JSON.stringify({ success: true, dropdowns });
    cache.put(cacheKey, payload, 3600); // 1 hour cache
    return payload;
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

/**
 * Puts a large string into CacheService by chunking it.
 */
function _putCacheChunked(cache, key, value, ttl) {
  const chunkSize = 90000;
  const numChunks = Math.ceil(value.length / chunkSize);
  try {
    cache.put(`${key}_meta`, numChunks.toString(), ttl);
    for (let i = 0; i < numChunks; i++) {
      cache.put(`${key}_${i}`, value.substring(i * chunkSize, (i + 1) * chunkSize), ttl);
    }
  } catch (e) {
    console.warn(`Cache chunking failed for ${key}:`, e.message);
  }
}

/**
 * Gets a chunked string from CacheService.
 */
function _getCacheChunked(cache, key) {
  const numChunksStr = cache.get(`${key}_meta`);
  if (!numChunksStr) return null;
  
  const numChunks = parseInt(numChunksStr, 10);
  let result = '';
  for (let i = 0; i < numChunks; i++) {
    const chunk = cache.get(`${key}_${i}`);
    if (chunk === null || chunk === undefined) return null; // Cache expired or incomplete
    result += chunk;
  }
  return result;
}



/**
 * Returns the entire master directory search index for client-side caching.
 * @param {string} token 
 */
function getMasterSearchIndex(token) {
  try {
    const session = _requireSession(token);
    const CODE_VER = 'cv5';
    const searchVer = parseInt(PropertiesService.getScriptProperties().getProperty('search_cache_version') || '1', 10);
    const cacheKey = `search_idx_${CODE_VER}_v${searchVer}`;
    const cache = CacheService.getScriptCache();
    
    const cachedIdx = _getCacheChunked(cache, cacheKey);
    if (cachedIdx) return cachedIdx;
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const masterSheet = _getSheetOrThrow(CONFIG.SHEETS.MASTER.NAME, ss);
    const masterData = masterSheet.getDataRange().getValues();
    const mCols = _validateSchema(masterSheet, CONFIG.SHEETS.MASTER.HEADERS);
    
    const searchableList = [];
    for (let i = 1; i < masterData.length; i++) {
      const row = masterData[i];
      searchableList.push({
        cubId: String(row[mCols[CONFIG.COLS.CUB_ID]]).trim(),
        owner: String(row[mCols[CONFIG.COLS.REP]]).trim().toLowerCase(),
        repName: String(row[mCols[CONFIG.COLS.REP]]).trim(),
        cFirst: String(row[mCols[CONFIG.COLS.CUB_FIRST_NAME]]).trim(),
        cLast: String(row[mCols[CONFIG.COLS.CUB_LAST_NAME]]).trim(),
        pFirst: String(row[mCols[CONFIG.COLS.PARENT_FIRST_NAME]]).trim(),
        pLast: String(row[mCols[CONFIG.COLS.PARENT_LAST_NAME]]).trim(),
        pPhone: String(row[mCols[CONFIG.COLS.PARENT_PHONE]]).trim()
      });
    }
    
    const jsonStr = JSON.stringify(searchableList);
    try {
      _putCacheChunked(cache, cacheKey, jsonStr, 3600);
    } catch (e) { }
    
    return jsonStr;
  } catch (err) {
    console.error('getMasterSearchIndex Error: ', err);
    return JSON.stringify([]);
  }
}

/**
 * Gets settings data (dropdowns and users) for the Admin Settings page.
 * @param {string} token
 */
function getSettingsData(token) {
  try {
    const session = _requireSession(token);
    if (session.role !== CONFIG.ROLES.ADMIN) throw new Error("Unauthorized.");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const localConfigSheet = _getSheetOrThrow(CONFIG.ACCESS_LIST_TAB, ss);
    
    // Get dropdowns (D-H)
    const localData = localConfigSheet.getRange('D2:H').getValues();
    const extractCol = (data, colIdx) => {
      return Array.from(new Set(data.map(r => String(r[colIdx] || '').trim()).filter(v => v !== '')));
    };

    const dropdowns = {
      handledBy:         extractCol(localData, 0),  // D
      type:              extractCol(localData, 1),  // E
      purpose:           extractCol(localData, 2),  // F
      status:            extractCol(localData, 3),  // G
      actionStatus:      extractCol(localData, 4),  // H
    };

    // Get users (J-M)
    const usersData = localConfigSheet.getRange('J2:M').getValues();
    const users = [];
    usersData.forEach((row, index) => {
      if (String(row[0] || '').trim() || String(row[2] || '').trim()) {
        users.push({
          rowIdx: index + 2,
          name: String(row[0] || '').trim(),
          role: String(row[1] || '').trim(),
          email: String(row[2] || '').trim(),
          password: String(row[3] || '').trim()
        });
      }
    });

    return JSON.stringify({ success: true, dropdowns, users });
  } catch (err) {
    return JSON.stringify({ success: false, error: err.message });
  }
}

  // ═══════════════════════════════════════════════════════════════
// ORIENTATION PAGE DATA
// Returns { pendingRows, trackerRows }
  // ═══════════════════════════════════════════════════════════════

function getOrientationPageData(token) {
  try {
    _requireSession(token);

    const CODE_VER = 'ori1';
    const version = _getOriRcCacheVersion();
    const cacheKey = `ori_page_${CODE_VER}_v${version}`;
    const cache = CacheService.getScriptCache();

    try {
      const cached = _getCacheChunked(cache, cacheKey);
      if (cached) return cached;
    } catch (e) { /* cache miss */ }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tz = Session.getScriptTimeZone();

    // ── Orientation Pending ────────────────────────────────────────────────────
    const pendingRows = [];
    try {
      const ps   = _getSheetOrThrow(CONFIG.SHEETS.ORIENTATION_PENDING.NAME, ss);
      const pCols = _validateSchema(ps, CONFIG.SHEETS.ORIENTATION_PENDING.HEADERS);
      const pData = ps.getDataRange().getValues();
      for (let i = 1; i < pData.length; i++) {
        const r = pData[i];
        const pendingId = String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.PENDING_ID]] || '').trim();
        if (!pendingId) continue;
        
        let tsRaw = r[pCols[CONFIG.PENDING_SIGNUP_COLS.TIMESTAMP]];
        let ts = '';
        if (tsRaw instanceof Date) {
          ts = Utilities.formatDate(tsRaw, tz, "EEE, dd-MMM-yy HH:mm");
        } else {
          ts = String(tsRaw || '').replace(/\sGMT.*/, '');
        }

        pendingRows.push({
          pendingId,
          timestamp:    ts,
          parentName:   String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.PARENT_NAME]]  || ''),
          parentPhone:  String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.PARENT_PHONE]] || ''),
          cubName:      String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.CUB_NAME]]     || ''),
          session:      String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.SELECTED_SESSION]] || ''),
          matchedCubId: String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.MATCHED_CUB_ID]]   || ''),
          confidence:   String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.MATCH_CONFIDENCE]] || ''),
          confirmedBy:  String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.CONFIRMED_BY]] || ''),
          status:       String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.STATUS]]        || ''),
        });
      }
    } catch(e) { console.warn('Orientation Pending read error:', e.message); }

    // ── Build Cubs lookup (cubId → { cubName, parentName }) using Cubs sheet ──
    const masterLookup = {};
    try {
      const cubsSheet = _getSheetOrThrow(CONFIG.SHEETS.CUBS.NAME, ss);
      const cubsHeaders = cubsSheet.getRange(1, 1, 1, cubsSheet.getLastColumn()).getValues()[0];
      const hIdx = {};
      cubsHeaders.forEach((h, i) => { hIdx[h] = i; });
      const cubsData = cubsSheet.getDataRange().getValues();
      for (let i = 1; i < cubsData.length; i++) {
        const r = cubsData[i];
        const cubId = String(r[hIdx['Cub ID']] || '').trim();
        if (!cubId) continue;
        // Master has parent info — also read from Master for parent name
        masterLookup[cubId] = {
          cubName:    `${String(r[hIdx['Cub First Name']] || '').trim()} ${String(r[hIdx['Cub Last Name']] || '').trim()}`.trim(),
          parentName: '',  // filled in from Master below
        };
      }
      // Enrich with parent names from Master sheet
      const ms = _getSheetOrThrow(CONFIG.SHEETS.MASTER.NAME, ss);
      const msHeaders = ms.getRange(1, 1, 1, ms.getLastColumn()).getValues()[0];
      const msIdx = {};
      msHeaders.forEach((h, i) => { msIdx[h] = i; });
      const mData = ms.getDataRange().getValues();
      for (let i = 1; i < mData.length; i++) {
        const r = mData[i];
        const cubId = String(r[msIdx['Cub ID']] || '').trim();
        if (!cubId || !masterLookup[cubId]) continue;
        masterLookup[cubId].parentName = `${String(r[msIdx['Parent First Name']] || '').trim()} ${String(r[msIdx['Parent Last Name']] || '').trim()}`.trim();
        masterLookup[cubId].parentPhone = String(r[msIdx['Parent Phone']] || '').trim();
      }
    } catch(e) { console.warn('Cubs/Master lookup error:', e.message); }

    // ── Orientation Tracker (all confirmed cubs) ───────────────────────────────
    const trackerRows = [];
    // sessionRows are now derived client-side from trackerRows to halve payload size.
    try {
      const os   = _getSheetOrThrow(CONFIG.SHEETS.ORIENTATION.NAME, ss);
      const oCols = _validateSchema(os, CONFIG.SHEETS.ORIENTATION.HEADERS);
      const oData = os.getDataRange().getValues();
      for (let i = 1; i < oData.length; i++) {
        const r = oData[i];
        const cubId = String(r[oCols['Cub ID']] || '').trim();
        if (!cubId) continue;

        const stage = String(r[oCols['Stage']] || '');
        const stageStatus = String(r[oCols['Stage Status']] || '');
        const completionDate = String(r[oCols['Completion Date']] || '');
        const lookup = masterLookup[cubId] || {};

        const row = {
          cubId,
          cubName:        lookup.cubName    || cubId,
          parentName:     lookup.parentName || '—',
          parentPhone:    lookup.parentPhone || '—',
          session:        String(r[oCols['Session']]              || ''),
          stage,
          stageStatus,
          nextStage:      String(r[oCols['Next Stage']]           || ''),
          completionDate,
          bookedDate:     String(r[oCols['Booked Date']]          || ''),
          attendedDate:   String(r[oCols['Attended Date']]        || ''),
          firstWinDate:   String(r[oCols['First Win Date']]       || ''),
          rcSelectedDate: String(r[oCols['RC Selected Date']]     || ''),
          lastUpdatedBy:  String(r[oCols['Last Updated By']]      || ''),
          // Block data for journey drawer
          blocks: {
            INVITED:     { status: String(r[oCols['Invited Status']] || '') },
            BOOKED:      { status: String(r[oCols['Booked Status']] || '') },
            ATTENDED:    { status: String(r[oCols['Attended Status']] || ''), feedback: String(r[oCols['Attended Feedback']] || '') },
            FIRST_WIN:   { status: String(r[oCols['First Win Status']] || ''), feedback: String(r[oCols['First Win Feedback']] || '') },
            RC_SELECTED: { status: String(r[oCols['RC Selected Status']] || ''), feedback: String(r[oCols['RC Selected Feedback']] || '') },
          },
        };

        trackerRows.push(row);
      }
    } catch(e) { console.warn('Orientation tracker read error:', e.message); }

    // sessionRows is derived client-side from trackerRows to avoid sending the same
    // rows twice in the payload. The client filters where !isComplete.
    const resultPayload = JSON.stringify({ pendingRows, trackerRows });

    try {
      _putCacheChunked(cache, cacheKey, resultPayload, CONFIG.CACHE_TTL_SECONDS);
    } catch (e) {
      console.warn('Could not cache orientation page data:', e.message);
    }

    return resultPayload;
  } catch(err) {
    return JSON.stringify({ error: err.message });
  }
}


  // ═══════════════════════════════════════════════════════════════
// READING CIRCLE PAGE DATA
// Returns { pendingRows, rosterRows }
  // ═══════════════════════════════════════════════════════════════

function getRCPageData(token) {
  try {
    _requireSession(token);

    const CODE_VER = 'rc1';
    const version = _getOriRcCacheVersion();
    const cacheKey = `rc_page_${CODE_VER}_v${version}`;
    const cache = CacheService.getScriptCache();

    try {
      const cached = _getCacheChunked(cache, cacheKey);
      if (cached) return cached;
    } catch (e) { /* cache miss */ }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tz = Session.getScriptTimeZone();

    // ── RC Pending ─────────────────────────────────────────────────────────────
    const pendingRows = [];
    try {
      const ps    = _getSheetOrThrow(CONFIG.SHEETS.RC_PENDING.NAME, ss);
      const pCols = _validateSchema(ps, CONFIG.SHEETS.RC_PENDING.HEADERS);
      const pData = ps.getDataRange().getValues();
      for (let i = 1; i < pData.length; i++) {
        const r = pData[i];
        const pendingId = String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.PENDING_ID]] || '').trim();
        if (!pendingId) continue;
        
        let tsRaw = r[pCols[CONFIG.PENDING_SIGNUP_COLS.TIMESTAMP]];
        let ts = '';
        if (tsRaw instanceof Date) {
          ts = Utilities.formatDate(tsRaw, tz, "EEE, dd-MMM-yy HH:mm");
        } else {
          ts = String(tsRaw || '').replace(/\sGMT.*/, '');
        }

        pendingRows.push({
          pendingId,
          timestamp:    ts,
          parentName:   String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.PARENT_NAME]]  || ''),
          parentPhone:  String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.PARENT_PHONE]] || ''),
          cubName:      String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.CUB_NAME]]     || ''),
          session:      String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.SELECTED_SESSION]] || ''),
          grade:        String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.GRADE]]         || ''),
          matchedCubId: String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.MATCHED_CUB_ID]]   || ''),
          confidence:   String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.MATCH_CONFIDENCE]] || ''),
          confirmedBy:  String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.CONFIRMED_BY]] || ''),
          status:       String(r[pCols[CONFIG.PENDING_SIGNUP_COLS.STATUS]]        || ''),
        });
      }
    } catch(e) { console.warn('RC Pending read error:', e.message); }

    // ── RC Roster ─────────────────────────────────────────────────────────────
    const rosterRows = [];
    try {
      const cubInfoMap = new Map();
      try {
        const cubsSheet = _getSheetOrThrow(CONFIG.SHEETS.CUBS.NAME, ss);
        const cubsData = cubsSheet.getDataRange().getValues();
        const cCols = _validateSchema(cubsSheet, CONFIG.SHEETS.CUBS.HEADERS);
        for (let i = 1; i < cubsData.length; i++) {
          const id = String(cubsData[i][cCols[CONFIG.CUB_COLS.CUB_ID]] || '').trim();
          if (id) cubInfoMap.set(id, {
            streak:    String(cubsData[i][cCols[CONFIG.CUB_COLS.CURRENT_STREAK]] || '0').trim(),
            firstName: String(cubsData[i][cCols[CONFIG.CUB_COLS.CUB_FIRST_NAME]] || '').trim(),
            lastName:  String(cubsData[i][cCols[CONFIG.CUB_COLS.CUB_LAST_NAME]]  || '').trim(),
            parentName: '',
            parentPhone: '',
          });
        }
        
        // Enrich with parent info from Master
        const ms = _getSheetOrThrow(CONFIG.SHEETS.MASTER.NAME, ss);
        const msHeaders = ms.getRange(1, 1, 1, ms.getLastColumn()).getValues()[0];
        const msIdx = {};
        msHeaders.forEach((h, i) => { msIdx[h] = i; });
        const mData = ms.getDataRange().getValues();
        for (let i = 1; i < mData.length; i++) {
          const id = String(mData[i][msIdx['Cub ID']] || '').trim();
          if (!id || !cubInfoMap.has(id)) continue;
          const info = cubInfoMap.get(id);
          info.parentName = `${String(mData[i][msIdx['Parent First Name']] || '').trim()} ${String(mData[i][msIdx['Parent Last Name']] || '').trim()}`.trim();
          info.parentPhone = String(mData[i][msIdx['Parent Phone']] || '').trim();
        }
      } catch(e) { console.warn('Could not read cub info from Cubs/Master sheet:', e.message); }

      const rs    = _getSheetOrThrow(CONFIG.SHEETS.READING_CIRCLE.NAME, ss);
      const rCols = _validateSchema(rs, CONFIG.SHEETS.READING_CIRCLE.HEADERS);
      const rData = rs.getDataRange().getValues();

      // Identify dynamic date columns (anything beyond the static headers)
      const staticCount  = CONFIG.SHEETS.READING_CIRCLE.HEADERS.length;
      const headerRow    = rData[0] || [];

      for (let i = 1; i < rData.length; i++) {
        const r = rData[i];
        const cubId = String(r[rCols['Cub ID']] || '').trim();
        if (!cubId) continue;

        // Last attendance date from dynamic date columns
        let lastAttendanceDate = '';
        for (let j = headerRow.length - 1; j >= staticCount; j--) {
          const val = r[j];
          if (val && String(val).trim() !== '' && String(val).trim() !== '0') {
            const hdr = headerRow[j];
            if (hdr instanceof Date) {
              lastAttendanceDate = Utilities.formatDate(hdr, tz, 'dd-MMM-yy');
            } else {
              lastAttendanceDate = String(hdr);
            }
            break;
          }
        }

        const info = cubInfoMap.get(cubId) || {};
        rosterRows.push({
          cubId,
          cubFirstName:      info.firstName || '',
          cubLastName:       info.lastName  || '',
          parentName:        info.parentName || '—',
          parentPhone:       info.parentPhone || '—',
          session:           String(r[rCols['Selected Session']]     || ''),
          rcCategory:        String(r[rCols['RC Category']]          || ''),
          weeksActive:       String(r[rCols['Weeks Active']]         || '0'),
          noPresent:         String(r[rCols['No. Present']]          || '0'),
          lastAttendanceDate: lastAttendanceDate,
          currentStreak:     info.streak || '0', // sourced from Cubs tab
        });
      }
    } catch(e) { console.warn('RC Roster read error:', e.message); }

    const resultPayload = JSON.stringify({ pendingRows, rosterRows });

    try {
      _putCacheChunked(cache, cacheKey, resultPayload, CONFIG.CACHE_TTL_SECONDS);
    } catch (e) {
      console.warn('Could not cache RC page data:', e.message);
    }

    return resultPayload;
  } catch(err) {
    return JSON.stringify({ error: err.message });
  }
}

/**
 * Lightweight endpoint polled by the client to check if any data has changed on the server.
 * Enables background syncing across multiple concurrent users.
 * @param {string} token
 * @returns {string} JSON string of version numbers
 */
function checkDataVersions(token) {
  try {
    _requireSession(token);
    const props = PropertiesService.getScriptProperties();
    return JSON.stringify({
      dashboard: parseInt(props.getProperty('cache_version') || '1', 10),
      ori_rc: parseInt(props.getProperty('ori_rc_version') || '1', 10),
      search: parseInt(props.getProperty('search_cache_version') || '1', 10)
    });
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}
