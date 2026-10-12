
### 2026-10-07 — Performance Optimisation (Report-Driven)

**Scope:** `DashboardWrite.gs`, `DashboardData.gs`, `Utils.gs`, `FormHandler.gs`  
**No schema changes. No new sheets. No client-side changes.**

**Implemented:**
- **P0-B1** `submitRCAttendance` — replaced full-sheet `setValues(data)` with per-changed-row sparse writes. Lock hold time: 2–3 s → ~300–500 ms. Quota reduced 90%+.
- **B5** `getDashboardData` — Master read now column-limited (5 cols instead of 21). Reads header row first, resolves indices, then fetches only `getRange(2, 1, lastRow-1, maxNeededCol)`. ~75% data reduction.
- **B7** `_bustAllDashboardCaches` — no longer increments `ori_rc_version`. Each Ori/RC write already calls `_bustOriRcCachesOnly()` directly. Non-Ori/RC writes now preserve Ori/RC page caches.
- **updateOrientationBlocks** — changed `_bustAllDashboardCaches()` → `_bustOriRcCachesOnly()`. Only modifies Orientation blocks; does not touch Cubs/Actions/Interactions.
- **W22** `confirmPendingSignup` — two `setValue()` calls for RC session/category on existing row changed to `setValues([[val]])`.
- **B6** `_handleFormSubmit` — builds `phone → [cubId]` Map once via `_buildPhoneIndex_()` before cubs loop. `_autoMatch` accepts optional index for O(1) phone lookup vs O(N) full scan. Fallback to linear scan retained.

**Skipped (disagreed):** P0-B2 (split getDashboardData — client depends on merged payload for RC/email/orientation data in drawers), B3/B4 (same reason), B8 (intentionally uncached for freshness), B9 (current per-cub setValues already batched), E1 (already fixed — splash hidden at line 969).

### 2026-10-07 -- Audit Fixes Phase 3

**Scope:** `App.html`, `DashboardWrite.gs`  
**No schema changes. Behaviour-only fixes.**

- **RC Dashboard Sync:** Fixed issue where changing an RC session or submitting attendance didn't immediately reflect on the main dashboard. The dashboard reads RC Category and attendance stats from the `Cubs` tab, but the write functions only updated the `Reading Circle` tab. Added `_propagateRCToCubs_` and restored full dashboard cache invalidation for these actions so changes instantly sync.
- **RC Attendance "No Cubs" Fix:** `openRCAttendanceDrawer` filtered `window.CUBS` to find cubs for a session, but `window.CUBS` didn't contain the RC session string (only the category). Fixed the drawer to correctly filter from `_rcData.rosterRows` which contains the exact session string, restoring the cubs list for attendance.
- **Orientation Pending Confirmation Defaults:** Adjusted `confirmPendingSignup` logic for Orientation. When confirming a new signup, it now skips the manual "Invited" step and automatically sets `Stage` = Booked, `Stage Status` = Completed, and `Next Stage` = Attended. It also auto-fills the underlying stage blocks (`Invited Status` = Yes, `Booked Status` = Completed, `Booked Date` = now) and propagates this straight to the Master sheet.


**Scope:** `App.html`, `DashboardData.gs`, `DashboardWrite.gs`, `Utils.gs`, `Index.html`  
**No schema changes. No new sheets. Behaviour-only fixes.**

- **Post-save cache bypass (Issues 1 & 5):** `loadOrientationPage()` and `loadReadingCirclePage()` now accept a `force` argument. All callers that follow a successful write — drawer saves, pending confirm/reject — pass `force=true` so the 5-minute SWR guard is skipped and fresh data is always fetched after a mutation.
- **SWR client cache (Issue 1):** Both loaders now implement Stale-While-Revalidate. If cached data exists it is rendered immediately (no Loading flash), then a background fetch fires only if data is older than 5 minutes or `force=true`. 60-second TTL replaced by 5-minute background revalidation.
- **Toast args reversed (Issue 2 in previous session note):** 9 `showToast(message, type)` calls in the RC attendance and change-session drawers had arguments reversed (message first, type second). All corrected to `showToast(type, message)`.
- **Scorecard `dateJoined` → `dateOnboarded` (Issue 7):** The onboarding scorecard was reading `c.dateJoined` which does not exist on cub objects. Corrected to `c.dateOnboarded` which matches the server payload field.
- **`getFormInitData` PARENT_SPREADSHEET_URL crash (Issue 6):** Removed the `SpreadsheetApp.openByUrl(CONFIG.PARENT_SPREADSHEET_URL)` call for a missing constant. Orientation Stages are now read directly from column O of the local Config tab (range `D2:O`, index 11), eliminating the cross-spreadsheet round trip and the runtime error.
- **`updateOrientationStage` wrong-columns write (Issue 10):** The existing-row update path wrote 7 contiguous cells starting at SESSION+1, clobbering Invited Status and Booked Date (the first two block columns). Fixed to read the existing row, mutate only the 7 targeted fields by their exact column index, and write the whole row back.
- **RC roster missing cub names (Issue 8):** `getRCPageData()` now builds a `cubInfoMap` from the Cubs tab (streak + first/last name). Each `rosterRow` gains `cubFirstName` and `cubLastName`. The RC roster table now shows a Name column first. The search filter includes names. Table header colspan bumped from 6 → 7.
- **Targeted Ori/RC cache busting (Issue 4):** Added `_getOriRcCacheVersion()` and `_bustOriRcCachesOnly()` in `Utils.gs`. `getOrientationPageData` and `getRCPageData` now version-key against `ori_rc_version` (separate from `cache_version`). Seven Ori/RC write functions (`updateOrientationStage`, `updateCubJourney`, `submitRCAttendance`, `confirmPendingSignup`, `rejectPendingSignup`, `changeCubRCSession`, `changeCubOrientationSession`) now call `_bustOriRcCachesOnly()` instead of `_bustAllDashboardCaches()`, preserving the expensive dashboard payload on every Orientation/RC interaction.
- **`sessionRows` payload duplication eliminated (Issue 3):** Server no longer serialises `sessionRows` (a filtered subset of `trackerRows`) into the JSON payload. `filterOriSessions()` now derives incomplete cubs client-side. Payload is roughly halved for orientation-heavy datasets.

### 2026-10-07 -- Audit Fixes Phase 1


**Scope:** `DashboardWrite.gs`, `Menus.gs`, `App.html`, `DashboardData.gs`

- **Dead Code / Bug Fix:** Removed `resyncAllOrientationStages()` from `DashboardWrite.gs` and its UI trigger from `Menus.gs`. The logic was dangerously inverted (mapping First Win to Completed) and the function is no longer needed in the modern data flow.
- **Dashboard Caching Bug:** Added 60-second TTL guards to `loadOrientationPage()` and `loadReadingCirclePage()` in `App.html`. They now reuse fresh `_oriData` and `_rcData` instead of eagerly nulling it out and triggering a full server refetch on every tab click.
- **RC Streaks Fix:** `getRCPageData()` now builds a streak map from the Cubs tab and joins it into the `rosterRows` payload so the frontend streak stat actually works instead of showing 0.
- **Concurrent Locks (Issue 5):** Optimized `_propagateOriStagesToMaster_` to build the modified row array and write it back with a single `setValues` call instead of doing 4 separate `setValue` calls. This significantly reduces the time the lock is held.
- **RC Attendance Flush (Issue 11):** Added `SpreadsheetApp.flush()` to `submitRCAttendance` right after appending a new date column to prevent race conditions where Google Sheets wouldn't pad the data array fast enough for the immediate re-read.
- **Scorecards Fix (Issue 9):** `renderDashboard()` in `App.html` now properly populates `scorecard-onboarding-count` (cubs onboarded in last 7 days) and `scorecard-retention-rate` (active / total percentage) which previously showed double dashes forever.

### 2026-10-07 -- Reading Circle Dashboard Flows Fixed

**Scope:** `App.html`, `Index.html`  
**No schema changes. No new sheets. Behaviour-only fixes.**

- **UI Entry Points:** Added `Change Session` and `Mark Attendance` buttons to the RC Roster toolbar in `Index.html` so both drawers are reachable from the dashboard.
- **window.CUBS:** After `loadData()` resolves, `cubsList` is now assigned to `window.CUBS` and `readingCircleList` records are merged into each cub as `cub.readingCircle` so `loadRCAttendanceCubs()` can filter by session.
- **window.CONFIG:** Server-side constants (`rcSessions`, `orientationSessions`, `stageBlocks`) returned in `res.constants` are now written to `window.CONFIG` on the client so the session dropdowns in both drawers populate correctly.
- **sessionToken -> session.token:** `submitRCAttendanceBatch()` and `submitRCChangeSession()` were passing the undefined variable `sessionToken`; fixed to use the global `session.token`.
- **Variable shadowing:** `submitRCAttendanceBatch()` declared `const session = ...` which shadowed the outer auth session; renamed to `const rcSession`.
- **Field name mismatch:** `loadRCAttendanceCubs()` referenced `c.firstName`/`c.lastName` (non-existent on cub objects); corrected to `c.cubFirstName`/`c.cubLastName`.
- **Session filter bug:** `loadRCAttendanceCubs()` compared `c.readingCircle.selectedSession === session` (the auth object); fixed to compare against `rcSession` (the dropdown value).
- **Empty session guard:** Added early-return toast if no session is selected before loading the cub list.
- **loadDashboardData -> loadData:** Post-save refresh calls in both RC functions pointed to a non-existent `loadDashboardData()`; corrected to `loadData()`.
