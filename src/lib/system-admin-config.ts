// Named sheet/form config keys — shared between client and server
export const SHEET_KEYS = {
  directory:     { id: 'sheet_directory_id',       tab: 'sheet_directory_tab',       label: 'Directory',       desc: 'Source of truth for all cubs / subscribers' },
  readingData:   { id: 'sheet_reading_data_id',    tab: 'sheet_reading_data_tab',    label: 'Reading Data',    desc: 'Cumulative reading points per cub' },
  scoreCalendar: { id: 'sheet_score_calendar_id',  tab: 'sheet_score_calendar_tab',  label: 'Score Calendar',  desc: 'Weekly reading scores / calculations (shares sheet with Reading Data)' },
  emailHistory:  { id: 'sheet_email_history_id',   tab: 'sheet_email_history_tab',   label: 'Email History',   desc: 'History of all emails sent to cubs' },
} as const;

export const FORM_KEYS = {
  orientation:   { url: 'form_orientation_url',    label: 'Orientation Form',        desc: 'Google Form for new cubs applying for orientation' },
  readingCircle: { url: 'form_reading_circle_url', label: 'Reading Circle Form',     desc: 'Google Form for cubs registering for the reading circle' },
} as const;
