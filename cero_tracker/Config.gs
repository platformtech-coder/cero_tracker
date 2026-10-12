/**
 * @file Config.gs
 * @description Central configuration for CERO Tracker — centralized web app dashboard.
 *              All constants, sheet definitions, column mappings, and formatting.
 */

/* eslint-disable no-unused-vars */

const CONFIG = {

  // ═══════════════════════════════════════════════════════════════
  // PARENT SPREADSHEET — Contains Config tab with source URLs & dropdown lists.
  // The script owner must have at least Viewer access.
  // ═══════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════
  // PARENT CONFIG TAB REFERENCES
  PARENT_CONFIG_TAB: 'Config',
  // B2 = URL to the spreadsheet that has the Master tab (contact source)
  PARENT_CONFIG_MASTER_SOURCE_CELL: 'B2',
  // B3 = URL to the Cubs Registry + Score Calendar spreadsheet (enrichment source)
  PARENT_CONFIG_REGISTRY_CELL:      'B3',
  // ═══════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════
  // PARENT CONFIG DROPDOWN RANGES (from remote Config tab)
  // Col A = label, Col B = URLs (rows 2-3), Col C onward = dropdown lists
  // Row 1 = header, data from row 2 onward
  // ═══════════════════════════════════════════════════════════════
  PARENT_CONFIG_DROPDOWNS: {
    HANDLED_BY:          'D2:D',
    TYPE:                'E2:E',
    PURPOSE:             'F2:F',
    STATUS:              'G2:G',
    ACTION_STATUS:       'H2:H',
    ORIENTATION_STAGES:  'O2:O',
  },

  // ═══════════════════════════════════════════════════════════════
  // ACCESS LIST — Stored in this spreadsheet's own Config tab
  // Layout: A=label, B=URLs, C-G=dropdowns, H=blank, I=Name, J=Role, K=Email, L=Password
  // Header in row 1, data from row 2
  // ═══════════════════════════════════════════════════════════════
  ACCESS_LIST_TAB:      'Config',
  ACCESS_NAME_COL:      9,   // J (0-indexed = 9)
  ACCESS_ROLE_COL:      10,  // K
  ACCESS_EMAIL_COL:     11,  // L
  ACCESS_PASSWORD_COL:  12,  // M

  // ═══════════════════════════════════════════════════════════════
  // WEB APP
  // ═══════════════════════════════════════════════════════════════
  WEB_APP_TITLE:       'CERO Tracker',
  CACHE_TTL_SECONDS:   300,   // 5 minutes for dashboard data — balances freshness with performance under concurrent users
  SESSION_TTL_SECONDS: 21600, // 6 hours for sessions

  ROLES: {
    REP:   'Rep',
    ADMIN: 'Admin'
  },

  // ═══════════════════════════════════════════════════════════════
  // SOURCE SHEET TAB NAMES (in Parent Spreadsheet)
  // ═══════════════════════════════════════════════════════════════
  SOURCE_CUBS_REGISTRY_TAB:  'Cubs Registry',
  SOURCE_SCORE_CALENDAR_TAB: 'Score Calendar',
  SOURCE_READING_CIRCLE_TAB: 'All Cubs',

  // ═══════════════════════════════════════════════════════════════
  // GENERAL SETTINGS
  // ═══════════════════════════════════════════════════════════════
  MENU_NAME:    'CERO Tracker',
  TIMEZONE:     'Africa/Accra',
  TRIGGER_HOUR: 6,
  DEBUG_MODE:   false,
  DRY_RUN:      false,
  MAX_ROWS_PER_RUN: 2000,

  // ═══════════════════════════════════════════════════════════════
  // FORMATTING
  // ═══════════════════════════════════════════════════════════════
  HEADER_BG_COLOR:     '#46bdc6',
  HEADER_FONT_COLOR:   '#ffffff',
  HEADER_FONT_FAMILY:  'Lexend',
  DATA_FONT_FAMILY:    'Lexend',
  DATA_FONT_COLOR:     '#000000',
  DATA_FONT_SIZE:      10,
  REMOVED_ROW_BG_COLOR: '#f4cccc',

  // ═══════════════════════════════════════════════════════════════
  // COLUMN NAMES — Master Tab
  // ═══════════════════════════════════════════════════════════════
  COLS: {
    DATE:               'Date',
    CUB_ID:             'Cub ID',
    CUB_FIRST_NAME:     'Cub First Name',
    CUB_LAST_NAME:      'Cub Last Name',
    GENDER:             'Gender',
    DATE_OF_BIRTH:      'Date of Birth',
    GRADE:              'Grade',
    STREAM:             'Stream',
    SCHOOL_CODE:        'School Code',
    SCHOOL_NAME:        'School Name',
    SUB_START_DATE:     'Sub Start Date',
    SUB_END_DATE:       'Sub End Date',
    SUB_STATUS:         'Sub Status',
    PARENT_FIRST_NAME:  'Parent First Name',
    PARENT_LAST_NAME:   'Parent Last Name',
    PARENT_EMAIL:       'Parent Email',
    PARENT_PHONE:       'Parent Phone',
    PARENT_WHATSAPP:    'Parent Whatsapp',
    SEGMENT:            'Segment',
    TOTAL_SUBSCRIPTIONS:'Total Subscriptions',
    UPDATE_HISTORY:     'Update History',
    REP:                'Rep',
  },

  // ═══════════════════════════════════════════════════════════════
  // COLUMN NAMES — Families Tab
  // ═══════════════════════════════════════════════════════════════
  FAMILY_COLS: {
    PARENT_FIRST_NAME: 'Parent First Name',
    PARENT_LAST_NAME:  'Parent Last Name',
    PARENT_EMAIL:      'Parent Email',
    PARENT_PHONE:      'Parent Phone',
    PARENT_WHATSAPP:   'Parent Whatsapp',
    NO_CUBS:           'No. Cubs',
    RELATIONSHIP_OWNER:'Relationship Owner',
  },

  // ═══════════════════════════════════════════════════════════════
  // COLUMN NAMES — Cubs Tab
  // ═══════════════════════════════════════════════════════════════
  CUB_COLS: {
    DATE_ONBOARDED:           'Date Onboarded',
    CUB_ID:                   'Cub ID',
    CUB_FIRST_NAME:           'Cub First Name',
    CUB_LAST_NAME:            'Cub Last Name',
    GENDER:                   'Gender',
    GRADE:                    'Grade',
    STREAM:                   'Stream',
    SCHOOL_NAME:              'School Name',
    SUB_START_DATE:           'Sub Start Date',
    SUB_END_DATE:             'Sub End Date',
    NO_SUB_DAYS:              'No. Sub Days',
    SUB_STATUS:               'Sub Status',
    CURRENT_STREAK:           'Current Streak',
    LONGEST_STREAK:           'Longest Streak',
    STREAK_LABEL:             'Streak Label',
    CURRENT_LEAGUE:           'Current League',
    MEDALLION_STATUS:         'Medallion Status',
    FLAG:                     'Flag',
    CUMULATIVE_POINTS:        'Cumulative Points',
    CUMULATIVE_WEEKLY_POINTS: 'Cumulative Weekly Points',
    SEGMENT:                  'Segment',
    READING_CIRCLE_CATEGORY:  'Reading Circle Category',
    LAST_ATTENDANCE_DATE:     'Last Attendance Date',
    LAST_READING_ACTIVITY:    'Last Reading Activity',
    NO_PRESENT:               'No. Present',
    LAST_ENGAGEMENT_ACTIVITY: 'Last Engagement Activity',
    HANDLED_BY_LAST:          'Handled By',
    PURPOSE_LAST:             'Purpose',
    ORIENTATION_STAGE:        'Orientation Stage',
    ORIENTATION_STAGE_STATUS: 'Orientation Stage Status',
    ORIENTATION_NEXT_STAGE:   'Orientation Next Stage',
    ORIENTATION_COMPLETION:   'Orientation Completion Date',
    RELATIONSHIP_OWNER:       'Relationship Owner',
  },

  // ═══════════════════════════════════════════════════════════════
  // COLUMN NAMES — Interactions Tab
  // ═══════════════════════════════════════════════════════════════
  INTERACTION_COLS: {
    INTERACTION_ID:    'Interaction ID',
    DATE:              'Date',
    PARENT_FIRST_NAME: 'Parent First Name',
    PARENT_LAST_NAME:  'Parent Last Name',
    CUB_ID:            'Cub ID',
    CUB_FIRST_NAME:    'Cub First Name',
    CUB_LAST_NAME:     'Cub Last Name',
    HANDLED_BY:        'Handled By',
    TYPE:              'Type',
    PURPOSE:           'Purpose',
    STATUS:            'Status',
    FEEDBACK:          'Feedback',
    ACTION_REQUIRED:   'Action Required',
    ACTION:            'Action',
    ACTION_DEADLINE:   'Action Deadline',
    ACTION_STATUS:     'Action Status',
    LOGGED_BY:         'Logged By',
  },

  // ═══════════════════════════════════════════════════════════════
  // COLUMN NAMES — Actions Tab
  // ═══════════════════════════════════════════════════════════════
  ACTION_COLS: {
    INTERACTION_ID:    'Interaction ID',
    DATE:              'Date',
    PARENT_FIRST_NAME: 'Parent First Name',
    PARENT_LAST_NAME:  'Parent Last Name',
    CUB_ID:            'Cub ID',
    CUB_FIRST_NAME:    'Cub First Name',
    CUB_LAST_NAME:     'Cub Last Name',
    HANDLED_BY:        'Handled By',
    TYPE:              'Type',
    PURPOSE:           'Purpose',
    STATUS:            'Status',
    FEEDBACK:          'Feedback',
    ACTION_REQUIRED:   'Action Required',
    ACTION:            'Action',
    ACTION_DEADLINE:   'Action Deadline',
    ACTION_STATUS:     'Action Status',
    OVERDUE_STATUS:    'Overdue Status',
    LOGGED_BY:         'Logged By',
  },

  // ═══════════════════════════════════════════════════════════════
  // COLUMN NAMES — Handover Notes Tab
  // ═══════════════════════════════════════════════════════════════
  HANDOVER_NOTES_COLS: {
    NOTE_ID:           'Note ID',
    DATE:              'Date',
    LOGGED_BY:         'Logged By',
    SUMMARY:           'Summary',
    PENDING_ISSUES:    'Pending Issues',
  },

  // ═══════════════════════════════════════════════════════════════
  // COLUMN NAMES — Cubs Registry Source
  // ═══════════════════════════════════════════════════════════════
  REGISTRY_COLS: {
    CUB_ID:           'Cub ID',
    CURRENT_STREAK:   'Current Streak',
    LONGEST_STREAK:   'Longest Streak',
    STREAK_LABEL:     'Streak Label',
    CURRENT_LEAGUE:   'Current League',
    MEDALLION_STATUS: 'Medallion Status',
    FLAG:             'Flag',
    CUMULATIVE_POINTS:'Cumulative Points',
  },

  // ═══════════════════════════════════════════════════════════════
  // COLUMN NAMES — Orientation Tracker Source (LEGACY — external Master tab)
  // Used only by the pre-Phase-2 SyncService enrichment path.
  // ═══════════════════════════════════════════════════════════════
  ORIENTATION_COLS: {
    CUB_ID:          'Cub ID',
    STAGE:           'Stage',
    STAGE_STATUS:    'Stage Status',
    NEXT_STAGE:      'Next Stage',
    COMPLETION_DATE: 'Completion Date',
  },

  // ═══════════════════════════════════════════════════════════════
  // COLUMN NAMES — Reading Circle Source (LEGACY — external All Cubs tab)
  // Used only by the pre-Phase-3 SyncService enrichment path.
  // ═══════════════════════════════════════════════════════════════
  READING_CIRCLE_COLS: {
    CUB_ID:          'Library Card Number',
    CATEGORY:        'Reading Circle Category',
    NO_PRESENT:      'No. Present',
    LAST_ATTENDANCE: 'Last Attendance Date',
  },

  // ═══════════════════════════════════════════════════════════════
  // COLUMN NAMES — Local Reading Circle tab (NEW — Phase 3)
  // Static columns only. Dynamic date columns have no fixed index.
  // ═══════════════════════════════════════════════════════════════
  RC_COLS: {
    CUB_ID:               'Cub ID',
    SELECTED_SESSION:     'Selected Session',
    RC_CATEGORY:          'RC Category',
    WEEKS_ACTIVE:         'Weeks Active',
    NO_PRESENT:           'No. Present',
    LAST_ATTENDANCE_DATE: 'Last Attendance Date',
    // Columns after index 5 (0-based) are dynamic date columns (e.g. '06-Oct-26')
  },
  RC_STATIC_COL_COUNT: 6, // number of fixed cols before dynamic date cols begin

  // ═══════════════════════════════════════════════════════════════
  // COLUMN NAMES — Local Orientation tab (Merged — Phase 2)
  // One row per cub. Tracks overall stage and individual block checklist.
  // ═══════════════════════════════════════════════════════════════
  ORIENTATION_LOCAL_COLS: {
    CUB_ID:              'Cub ID',
    SESSION:             'Session',
    STAGE:               'Stage',
    STAGE_STATUS:        'Stage Status',
    NEXT_STAGE:          'Next Stage',
    COMPLETION_DATE:     'Completion Date',
    INVITED_STATUS:      'Invited Status',
    BOOKED_DATE:         'Booked Date',
    BOOKED_STATUS:       'Booked Status',
    ATTENDED_DATE:       'Attended Date',
    ATTENDED_STATUS:     'Attended Status',
    ATTENDED_FEEDBACK:   'Attended Feedback',
    FW_DATE:             'First Win Date',
    FW_STATUS:           'First Win Status',
    FW_FEEDBACK:         'First Win Feedback',
    RC_SELECTED_DATE:    'RC Selected Date',
    RC_SELECTED_STATUS:  'RC Selected Status',
    RC_SELECTED_FEEDBACK:'RC Selected Feedback',
    LAST_UPDATED_BY:     'Last Updated By',
    LAST_UPDATED:        'Last Updated', // version token for optimistic locking
  },

  // ═══════════════════════════════════════════════════════════════
  // COLUMN NAMES — RC Pending and Orientation Pending tabs (NEW — Phase 4)
  // Identical schema for both pending queues.
  // ═══════════════════════════════════════════════════════════════
  PENDING_SIGNUP_COLS: {
    PENDING_ID:       'Pending ID',
    TIMESTAMP:        'Timestamp',
    FORM_SOURCE:      'Form Source',
    PARENT_NAME:      'Parent Name',
    PARENT_PHONE:     'Parent Phone',
    CUB_NAME:         'Cub Name (from form)',
    LIBRARY_CARD:     'Library Card (from form)',
    SELECTED_SESSION: 'Selected Session',
    GRADE:            'Grade',
    MATCHED_CUB_ID:   'Matched Cub ID',
    MATCH_CONFIDENCE: 'Match Confidence',
    CONFIRMED_BY:     'Confirmed By',
    CONFIRMED_AT:     'Confirmed At',
    STATUS:           'Status',
  },

  // Pending row status values
  PENDING_STATUS: {
    PENDING:   'Pending',
    CONFIRMED: 'Confirmed',
    REJECTED:  'Rejected',
  },

  // Pending row confidence values
  PENDING_CONFIDENCE: {
    HIGH:   'High',    // exact phone match, single cub
    MEDIUM: 'Medium',  // exact phone match, multiple cubs
    LOW:    'Low',     // name fuzzy match only
    NONE:   'None',    // no match found
  },

  // ═══════════════════════════════════════════════════════════════
  // RC SESSIONS — must match the session string stored in
  // Reading Circle.Selected Session exactly (case-sensitive).
  // ═══════════════════════════════════════════════════════════════
  RC_SESSIONS: [
    'Tuesday - 5pm',
    'Tuesday - 6pm',
    'Wednesdays - 5pm',
    'Wednesdays - 6pm',
    'Saturday - 8am',
    'Saturday - 9am',
    'Saturday - 10am',
    'Sunday- 3pm',
    'Sunday- 4pm',
  ],

  // ═══════════════════════════════════════════════════════════════
  // ORIENTATION SESSIONS
  // ═══════════════════════════════════════════════════════════════
  ORIENTATION_SESSIONS: ['Tuesday', 'Sunday'],

  // ═══════════════════════════════════════════════════════════════
  // ORIENTATION STAGE BLOCKS
  // startCol and endCol are 1-based column indices in Orientation tab.
  // ═══════════════════════════════════════════════════════════════
  STAGE_BLOCKS: [
    { key: 'BOOKED',      label: 'Booked',      cols: ['Booked Date',  'Booked Status'],                           dropdowns: { status: ['Completed'] } },
    { key: 'ATTENDED',    label: 'Attended',    cols: ['Attended Date', 'Attended Status', 'Attended Feedback'],   dropdowns: { status: ['Present', 'Absent', 'Rescheduled'] } },
    { key: 'RC_SELECTED', label: 'RC Selected', cols: ['RC Selected Date', 'RC Selected Status', 'RC Selected Feedback'], dropdowns: { status: ['Pending', 'Completed'] } },
    { key: 'FIRST_WIN',   label: 'First Win',   cols: ['First Win Date', 'First Win Status', 'First Win Feedback'],dropdowns: { status: ['Yes', 'No'] } },
  ],

  // Stage ordered list (drives Next Stage computation)
  STAGE_ORDER: ['Booked', 'Attended', 'RC Selected', 'First Win Sent', 'Completed'],

  // ═══════════════════════════════════════════════════════════════
  // ORIENTATION FORM — dynamic date refresh
  // The daily trigger fires at this hour to keep form choice labels current.
  // ═══════════════════════════════════════════════════════════════
  ORIENTATION_DATE_REFRESH_HOUR: 1,  // 1:00 AM

  // ═══════════════════════════════════════════════════════════════
  // SEGMENT FILTER — RC and Orientation pages are Gen. Comm only
  // ═══════════════════════════════════════════════════════════════
  GEN_COMM_SEGMENT: 'Gen. Comm',

  // ═══════════════════════════════════════════════════════════════
  // REGISTRY FIELDS to enrich in Cubs tab
  // ═══════════════════════════════════════════════════════════════
  REGISTRY_FIELDS: [
    'Current Streak',
    'Longest Streak',
    'Streak Label',
    'Current League',
    'Medallion Status',
    'Flag',
    'Cumulative Points',
    'Cumulative Weekly Points',   // Sourced from Score Calendar (last 7 date cols)
    'Last Reading Activity',      // Sourced from Score Calendar
    'Reading Circle Category',    // Sourced from Reading Circle
    'Last Attendance Date',       // Sourced from Reading Circle
    'No. Present',                // Sourced from Reading Circle
    // NOTE: Orientation Stage/Status/Next Stage/Completion Date are NOT listed here.
    // They are sourced exclusively from the Orientation Tracker via orientationMap
    // and written separately in the orientation enrichment block of _syncCubsBulk.
  ],

  // ═══════════════════════════════════════════════════════════════
  // MAPPING — Master col name → Cubs tab col name
  // ═══════════════════════════════════════════════════════════════
  MASTER_TO_CUBS_MAP: {
    'Date':        'Date Onboarded',
    'Cub ID':      'Cub ID',
    'Cub First Name':'Cub First Name',
    'Cub Last Name': 'Cub Last Name',
    'Gender':      'Gender',
    'Grade':       'Grade',
    'Stream':      'Stream',
    'School Name': 'School Name',
    'Sub Start Date':'Sub Start Date',
    'Sub End Date':'Sub End Date',
    'Sub Status':  'Sub Status',
    'Segment':     'Segment',
    'Rep':         'Relationship Owner',
  },

  // ═══════════════════════════════════════════════════════════════
  // SHEET DEFINITIONS — source of truth for setupSheets()
  // ═══════════════════════════════════════════════════════════════
  SHEETS: {
    MASTER: {
      NAME: 'Master',
      HEADERS: [
        'Date', 'Cub ID', 'Cub First Name', 'Cub Last Name', 'Gender',
        'Date of Birth', 'Grade', 'Stream', 'School Code', 'School Name',
        'Sub Start Date', 'Sub End Date', 'Sub Status',
        'Parent First Name', 'Parent Last Name', 'Parent Email',
        'Parent Phone', 'Parent Whatsapp', 'Segment', 'Total Subscriptions',
        'Update History', 'Rep',
      ],
    },
    CONFIG_TAB: {
      NAME: 'Config',
      // A                   B (URLs stacked vertically)   C-G dropdowns       H blank   I-L access list   M blank   N orientation
      // Row 1 = headers. A = label, B = URL (B2=Master source, B3=Registry & Scores).
      // Dropdowns from D onward; access list from J onward.
      HEADERS: [
        'External Source Sheet', 'URL', '', 'Handled By', 'Interaction Type', 'Purpose',
        'Status', 'Action Status', '', 'Name', 'Role', 'Email', 'Password', '', 'Orientation Stages'
      ]
    },
    FAMILIES: {
      NAME: 'Families',
      HEADERS: [
        'Parent First Name', 'Parent Last Name', 'Parent Email',
        'Parent Phone', 'Parent Whatsapp', 'No. Cubs', 'Relationship Owner',
      ],
    },
    CUBS: {
      NAME: 'Cubs',
      HEADERS: [
        'Date Onboarded', 'Cub ID', 'Cub First Name', 'Cub Last Name',
        'Segment', 'Gender', 'Grade', 'Stream', 'School Name',
        'Sub Start Date', 'Sub End Date', 'No. Sub Days', 'Sub Status',
        'Reading Circle Category', 'No. Present', 'Last Attendance Date',
        'Current Streak', 'Longest Streak', 'Streak Label',
        'Current League', 'Medallion Status', 'Flag', 'Cumulative Points',
        'Cumulative Weekly Points', 'Last Reading Activity',
        'Last Engagement Activity', 'Handled By', 'Purpose',
        'Orientation Stage', 'Orientation Stage Status',
        'Orientation Next Stage', 'Orientation Completion Date',
        'Relationship Owner',
      ],
    },
    INTERACTIONS: {
      NAME: 'Interactions',
      HEADERS: [
        'Interaction ID', 'Date', 'Parent First Name', 'Parent Last Name', 'Cub ID',
        'Cub First Name', 'Cub Last Name', 'Handled By', 'Type',
        'Purpose', 'Status', 'Feedback', 'Action Required', 'Action',
        'Action Deadline', 'Action Status', 'Logged By',
      ]
    },
    ACTIONS: {
      NAME: 'Actions',
      HEADERS: [
        'Interaction ID', 'Date', 'Parent First Name', 'Parent Last Name', 'Cub ID',
        'Cub First Name', 'Cub Last Name', 'Handled By', 'Type',
        'Purpose', 'Status', 'Feedback', 'Action Required', 'Action',
        'Action Deadline', 'Action Status', 'Overdue Status', 'Logged By',
      ]
    },
    HANDOVER_NOTES: {
      NAME: 'Handover Notes',
      HEADERS: [
        'Note ID', 'Date', 'Logged By', 'Summary', 'Pending Issues',
      ]
    },
    EMAIL_HISTORY: {
      NAME: 'Email History',
      HEADERS: [
        'Cub ID',
        'Msg 1 Date', 'Msg 1 Type',
        'Msg 2 Date', 'Msg 2 Type',
        'Msg 3 Date', 'Msg 3 Type',
        'Msg 4 Date', 'Msg 4 Type',
        'Msg 5 Date', 'Msg 5 Type',
        'Msg 6 Date', 'Msg 6 Type',
        'Msg 7 Date', 'Msg 7 Type',
      ]
    },
  // ═══════════════════════════════════════════════════════════════
    // Phase 0 additions — kept inside SHEETS so setupSheets() and
    // validateAllSchemas() iterate them correctly.
    // Form response tabs (RC_FORM_RESPONSES, ORIENTATION_FORM_RESPONSES)
    // are NOT listed here — their headers are controlled by Google Forms.
  // ═══════════════════════════════════════════════════════════════
    READING_CIRCLE: {
      NAME: 'Reading Circle',
      // Static headers only. Dynamic date columns are appended by submitRCAttendance.
      HEADERS: [
        'Cub ID', 'Selected Session', 'RC Category',
        'Weeks Active', 'No. Present', 'Last Attendance Date',
      ],
    },
    ORIENTATION: {
      NAME: 'Orientation',
      HEADERS: [
        'Cub ID', 'Session', 'Stage', 'Stage Status', 'Next Stage', 'Completion Date',
        'Invited Status',
        'Booked Date', 'Booked Status',
        'Attended Date', 'Attended Status', 'Attended Feedback',
        'First Win Date', 'First Win Status', 'First Win Feedback',
        'RC Selected Date', 'RC Selected Status', 'RC Selected Feedback',
        'Last Updated By', 'Last Updated',
      ],
    },
    RC_PENDING: {
      NAME: 'RC Pending',
      HEADERS: [
        'Pending ID', 'Timestamp', 'Form Source', 'Parent Name', 'Parent Phone',
        'Cub Name (from form)', 'Library Card (from form)',
        'Selected Session', 'Grade', 'Matched Cub ID',
        'Match Confidence', 'Confirmed By', 'Confirmed At', 'Status',
      ],
    },
    ORIENTATION_PENDING: {
      NAME: 'Orientation Pending',
      HEADERS: [
        'Pending ID', 'Timestamp', 'Form Source', 'Parent Name', 'Parent Phone',
        'Cub Name (from form)', 'Library Card (from form)',
        'Selected Session', 'Grade', 'Matched Cub ID',
        'Match Confidence', 'Confirmed By', 'Confirmed At', 'Status',
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════
  // LOG SETTINGS
  // ═══════════════════════════════════════════════════════════════
  LOG_SHEET_NAME: 'Log',
  LOG_HEADERS: ['Timestamp', 'Status', 'Details', 'Duration (ms)'],
  MAX_LOG_ROWS: 500,
};
