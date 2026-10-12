/**
 * @file Auth.gs
 * @description Token-based authentication for the CERO Tracker Web App.
 *
 * Auth flow:
 *  1. User submits email + password via login form.
 *  2. Server validates against this spreadsheet's Config tab (cols J-M).
 *  3. On success, a UUID session token is stored in ScriptCache (6h TTL).
 *  4. Client stores { email, token, role, name } in sessionStorage.
 *  5. Every subsequent API call passes { token } — server validates it.
 *  6. Role: "Admin" sees all data. "Rep" sees only their Relationship Owner rows.
 */

/* eslint-disable no-unused-vars */

  // ═══════════════════════════════════════════════════════════════
// Session Token Helpers
  // ═══════════════════════════════════════════════════════════════



/**
 * Generates and caches a session token for the given email.
 * @param {string} email
 * @returns {string} UUID token
 */
function _generateSessionToken(email) {
  const token = Utilities.getUuid();
  try {
    CacheService.getScriptCache().put('tok_' + token, email, CONFIG.SESSION_TTL_SECONDS);
  } catch (e) {
    console.warn('WARN [_generateSessionToken]: Cache put failed — ' + e.message);
  }
  return token;
}

/**
 * Validates a session token and returns the associated email.
 * @param {string} token
 * @returns {string|null}
 */
function _validateSessionToken(token) {
  if (!token) return null;
  try {
    return CacheService.getScriptCache().get('tok_' + token) || null;
  } catch (e) {
    return null;
  }
}

/**
 * Revokes a session token.
 * @param {string} token
 */
function _revokeSessionToken(token) {
  if (!token) return;
  try { CacheService.getScriptCache().remove('tok_' + token); } catch (e) {}
}

  // ═══════════════════════════════════════════════════════════════
// Public Auth API — called via google.script.run from the browser
  // ═══════════════════════════════════════════════════════════════

/**
 * Reads the Access List from the Config tab of this spreadsheet.
 * Columns: J=Name, K=Role, L=Email, M=Password (0-indexed: 9,10,11,12)
 * @returns {Array<{name, role, email, password}>}
 */
function _getAccessList() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.ACCESS_LIST_TAB);
  if (!sheet) throw new Error('Config tab not found in this spreadsheet.');

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // Read all 4 cols at once for efficiency
  const range = sheet.getRange(2, CONFIG.ACCESS_NAME_COL + 1, lastRow - 1, 4);
  const values = range.getValues();

  return values
    .map(row => ({
      name:     String(row[0]).trim(),
      role:     String(row[1]).trim(),
      email:    String(row[2]).trim().toLowerCase(),
      password: String(row[3]).trim(),
    }))
    .filter(u => u.email && u.email !== '');
}

/**
 * Returns the access list, using a 60-second script cache to avoid
 * re-reading the Config tab on every API call.
 * Cache is invalidated automatically after 60 seconds.
 * @returns {Array<{name, role, email, password}>}
 */
function _getCachedAccessList() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'access_list_v1';
  try {
    const cached = cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    // Cache miss or parse error — fall through to sheet read
  }

  const list = _getAccessList();

  try {
    cache.put(cacheKey, JSON.stringify(list), 60); // 60-second TTL
  } catch (e) {
    console.warn('WARN [_getCachedAccessList]: Cache put failed — ' + e.message);
  }

  return list;
}

/**
 * Validates credentials and returns a session payload.
 * Rate-limited: 5 failed attempts within 5 minutes locks the account for 5 minutes.
 * Attempt counters are stored in ScriptProperties and cleared on successful login.
 * @param {string} email
 * @param {string} password
 * @returns {string} JSON string
 */
function login(email, password) {
  try {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const normalizedPassword = (password || '').trim();

    if (!normalizedEmail || !normalizedPassword) {
      return JSON.stringify({ success: false, error: 'Please provide both email and password.' });
    }

    // ── Rate-limit check ──────────────────────────────────────────────────────
    // Key format: fail_<email>  Value: JSON { count, windowStart }
    const MAX_FAILS = 5;
    const LOCKOUT_SECONDS = 300; // 5 minutes
    const props = PropertiesService.getScriptProperties();
    const failKey = 'fail_' + normalizedEmail;
    const now = Math.floor(Date.now() / 1000);

    let failState = { count: 0, windowStart: now };
    try {
      const stored = props.getProperty(failKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Reset window if it's older than the lockout period
        if (now - parsed.windowStart < LOCKOUT_SECONDS) {
          failState = parsed;
        }
      }
    } catch (e) { /* corrupt data — start fresh */ }

    if (failState.count >= MAX_FAILS) {
      const remainingSecs = LOCKOUT_SECONDS - (now - failState.windowStart);
      const remainingMins = Math.ceil(remainingSecs / 60);
      return JSON.stringify({ success: false, error: `Too many failed attempts. Please try again in ${remainingMins} minute${remainingMins !== 1 ? 's' : ''}.` });
    }
  // ═══════════════════════════════════════════════════════════════

    // Use direct sheet read on login (not cached) so credential changes take effect immediately
    const accessList = _getAccessList();
    const user = accessList.find(u => u.email === normalizedEmail);

    if (!user) {
      // Don't reveal whether the email exists — same error for unknown email vs bad password
      _incrementLoginFailCount_(props, failKey, failState, now);
      return JSON.stringify({ success: false, error: 'Invalid email or password.' });
    }

    if (user.password !== normalizedPassword) {
      _incrementLoginFailCount_(props, failKey, failState, now);
      return JSON.stringify({ success: false, error: 'Invalid email or password.' });
    }

    // Success — clear the fail counter for this email
    try { props.deleteProperty(failKey); } catch (e) {}

    const token = _generateSessionToken(normalizedEmail);

    return JSON.stringify({
      success: true,
      token: token,
      email: normalizedEmail,
      name: user.name,
      role: user.role,
    });

  } catch (err) {
    console.error('ERROR [login]: ' + err.message);
    return JSON.stringify({ success: false, error: 'Login failed: ' + err.message });
  }
}

/**
 * Increments the failed login counter for an email.
 * @param {GoogleAppsScript.Properties.Properties} props
 * @param {string} failKey
 * @param {{ count: number, windowStart: number }} failState
 * @param {number} now - Current epoch seconds
 */
function _incrementLoginFailCount_(props, failKey, failState, now) {
  try {
    failState.count += 1;
    if (failState.count === 1) failState.windowStart = now; // Start new window on first fail
    props.setProperty(failKey, JSON.stringify(failState));
  } catch (e) {
    console.warn('WARN [_incrementLoginFailCount_]: ' + e.message);
  }
}

/**
 * Validates a session token and returns the current user's session.
 * @param {string} token
 * @returns {string} JSON string
 */
function validateSession(token) {
  try {
    const email = _validateSessionToken(token);
    if (!email) {
      return JSON.stringify({ valid: false });
    }

    const accessList = _getCachedAccessList(); // Use cached list for speed
    const user = accessList.find(u => u.email === email);

    if (!user) {
      _revokeSessionToken(token);
      return JSON.stringify({ valid: false });
    }

    return JSON.stringify({
      valid: true,
      token: token,
      email: email,
      name: user.name,
      role: user.role,
    });
  } catch (err) {
    return JSON.stringify({ valid: false });
  }
}

/**
 * Logs out the user by revoking their session token.
 * @param {string} token
 */
function logout(token) {
  _revokeSessionToken(token);
  return JSON.stringify({ success: true });
}

/**
 * Internal: Resolves and validates a session from a token.
 * Throws if the session is invalid or expired.
 * Uses the cached access list to avoid a sheet read on every API call.
 * @param {string} token
 * @returns {{ email: string, name: string, role: string }}
 */
function _requireSession(token) {
  const email = _validateSessionToken(token);
  if (!email) throw new Error('Session expired. Please log in again.');

  const accessList = _getCachedAccessList(); // Cached — avoids sheet read on every write
  const user = accessList.find(u => u.email === email);
  if (!user) throw new Error('User not found. Please log in again.');

  return { email: user.email, name: user.name, role: user.role };
}
