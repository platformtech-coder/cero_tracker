// ============================================================
// Forms Configuration — Shared Types & Constants
// (No "use server" — safe to import in both client and server)
// ============================================================

export interface SessionConfig {
  day: string;       // e.g. "Tuesday"
  startTime: string; // e.g. "7:00 pm"
  endTime: string;   // e.g. "8:00 pm"
}

export interface GradeMappingEntry {
  grade: string;       // "1" through "8"
  session: string;     // e.g. "Tuesday 5:00 pm – 5:45 pm"
  sessionDay?: string; // backwards compatibility e.g. "Tuesday"
}

export interface FormsConfig {
  // Orientation
  oriFormId: string;
  oriSessionItemId: string;
  oriSessions: SessionConfig[];
  // Reading Circle
  rcFormId: string;
  rcSessionsLower: SessionConfig[];
  rcSessionsUpper: SessionConfig[];
  rcCategoryLower: string;
  rcCategoryUpper: string;
  rcGradeMapping: GradeMappingEntry[];
  // Internal item IDs (advanced)
  rcLowerItemIds: string[];
  rcUpperItemIds: string[];
}

// ─── Pre-filled Item IDs from the Google Forms API ──────────
// Source: hex itemIds from the Forms API response.
export const KNOWN_ORI_SESSION_ITEM_ID = '465ce0fd';
export const KNOWN_RC_LOWER_ITEM_IDS = ['2156dbee', '3700cf24', '658ae11a', '47c03c70'];
export const KNOWN_RC_UPPER_ITEM_IDS = ['1839d05e', '635c4669', '3eb82f08', '708eb097'];

// ─── Default Session Values ───────────────────────────────────
export const DEFAULT_ORI_SESSIONS: SessionConfig[] = [
  { day: 'Tuesday', startTime: '7:00 pm', endTime: '8:00 pm' },
  { day: 'Sunday',  startTime: '5:00 pm', endTime: '6:00 pm' },
];

export const DEFAULT_RC_SESSIONS_LOWER: SessionConfig[] = [
  { day: 'Tuesday',   startTime: '5:00 pm', endTime: '5:45 pm' },
  { day: 'Wednesday', startTime: '5:00 pm', endTime: '5:45 pm' },
  { day: 'Saturday',  startTime: '8:00 am', endTime: '8:45 am' },
  { day: 'Saturday',  startTime: '9:00 am', endTime: '9:45 am' },
  { day: 'Sunday',    startTime: '3:00 pm', endTime: '3:45 pm' },
];

export const DEFAULT_RC_SESSIONS_UPPER: SessionConfig[] = [
  { day: 'Tuesday',   startTime: '6:00 pm', endTime: '6:45 pm' },
  { day: 'Wednesday', startTime: '6:00 pm', endTime: '6:45 pm' },
  { day: 'Saturday',  startTime: '10:00 am', endTime: '10:45 am' },
  { day: 'Sunday',    startTime: '4:00 pm',  endTime: '4:45 pm' },
];

export const DEFAULT_RC_SESSION_OPTIONS: string[] = [
  'Saturday 8:00 am – 8:45 am',
  'Saturday 9:00 am – 9:45 am',
  'Saturday 10:00 am – 10:45 am',
  'Tuesday 5:00 pm – 5:45 pm',
  'Tuesday 6:00 pm – 6:45 pm',
  'Wednesday 5:00 pm – 5:45 pm',
  'Wednesday 6:00 pm – 6:45 pm',
  'Sunday 3:00 pm – 3:45 pm',
  'Sunday 4:00 pm – 4:45 pm',
];

export const DEFAULT_FORMS_CONFIG: FormsConfig = {
  oriFormId:        '1euyObOz6KNG3QgzdUG5otCxjfgV-0fZ9iCo3GFKKSXU',
  oriSessionItemId: KNOWN_ORI_SESSION_ITEM_ID,
  oriSessions:      DEFAULT_ORI_SESSIONS,
  rcFormId:         '1NQPCb59uhpmo72BMxb9EHbxpAXqlmLlstyICTa8DJls',
  rcSessionsLower:  DEFAULT_RC_SESSIONS_LOWER,
  rcSessionsUpper:  DEFAULT_RC_SESSIONS_UPPER,
  rcCategoryLower:  'Word Astronauts',
  rcCategoryUpper:  'Word Miners',
  rcGradeMapping:   [],
  rcLowerItemIds:   KNOWN_RC_LOWER_ITEM_IDS,
  rcUpperItemIds:   KNOWN_RC_UPPER_ITEM_IDS,
};
