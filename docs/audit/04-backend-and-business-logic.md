# CERO Tracker — Phase 3: Backend & Business Logic Audit

**Auditor:** Principal Software Architect & Performance Engineer  
**Scope:** Server Actions, API Routes, Core Business Rules, Transactions, Auth & Authorization, Error Handling  
**Repository:** `cero-tracker`  
**Date:** 2026-10-29  

---

## 1. Executive Backend Assessment

The backend architecture is primarily powered by Next.js Server Actions (`src/lib/actions/`), augmented by 4 specialized Route Handlers in `src/app/api/` and 1 Deno Edge Function in `supabase/functions/`. While data querying has been significantly accelerated through specialized PL/pgSQL stored procedures, critical deficiencies exist in transactional safety, error handling consistency, background job decoupling, and authentication validation.

---

## 2. API Routes & Endpoint Inventory

| Endpoint | Method | Protection Level | Auth Mechanism | Rate Limiting | Status / Flaws |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [`/api/sync/trigger`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/sync/trigger/route.ts#L7) | `POST`, `GET` | Protected (Admin) | Supabase Auth (`auth.getUser()`) + profile role check | **None** | Calls Edge Function synchronously via service role key |
| [`/api/webhooks/forms`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/webhooks/forms/route.ts#L288) | `POST`, `GET` | Protected (Shared Secret) | Header `x-webhook-secret` vs `WEBHOOK_SECRET` | **None** | Vulnerable to timing attack; plain string comparison |
| [`/api/cron/rebuild-forms`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/cron/rebuild-forms/route.ts#L7) | `GET`, `POST` | Protected (Shared Secret) | Bearer token / header vs `CRON_SECRET` | **None** | Synchronous rebuild of Google Forms dropdowns |
| [`/api/system-admin/auth`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/system-admin/auth/route.ts#L17) | `POST`, `GET`, `DELETE` | Public POST / Protected GET | Custom `jose` JWT session cookie | **None** | **CRITICAL: Zero brute force protection** |

---

## 3. Core Business Rules & Workflows

### 1. Cub & Family Data Ingestion & Enrichment
- **Source of Truth:** External Google Sheets (`Directory`, `Reading Data`, `Score Calendar`).
- **Data Invariant:** Each cub has a unique `cub_id` (format `C` + 14 digits). A parent may have multiple cubs.
- **Aggregation Rule:** `families` rows are dynamically aggregated on `(parent_phone, parent_email)`.
- **Edge Case / Race Condition:** When two cubs share the same parent phone but have slightly different email spellings or trailing spaces, duplicate family records are created. Migration `20261016102000_backfill_family_arrays.sql` attempted to reconcile this, but sync upserts in Edge Function ([index.ts:L310-L330](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/functions/sync-master-cubs/index.ts#L310-L330)) can still cause duplicate primary keys or constraint conflicts under concurrent sheet edits.

### 2. Interaction & Action Follow-Up Pipeline
- **Rule:** Representatives log calls, WhatsApp messages, or meetings with parents.
- **Status Options:** Managed dynamically in `config_dropdowns` (e.g. `Reached`, `Not Reached`, `Invalid Number`).
- **Action Requirement:** If `action_required === 'Yes'`, a dependent task row is inserted into `actions` with an assigned deadline.
- **Architectural Gap:** Non-atomic write pipeline ([engagements.ts:L252-L318](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/engagements.ts#L252-L318)) lacks a database transaction. A database timeout during the action insert leaves the interaction logged but the action missing, with no error rolled back.

### 3. Contact Edit Request & Approval Workflow
- **Rule:** Field representatives cannot directly alter master cub phone numbers, emails, or names in the database.
- **Workflow:** Rep submits a proposal via `submitContactEditRequest()` -> Admin reviews pending requests on `/system-admin` -> Upon approval, database is updated AND write-back is issued to the master Google Sheet row.
- **Missing Idempotency & Concurrency Flaw:** If two admins click "Approve" simultaneously on the same pending request, both actions execute the remote Google Sheet write-back ([edit-requests.ts:L210-L245](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/edit-requests.ts#L210-L245)), causing redundant Google API calls and potential race conditions in Google Sheet cell updates.

### 4. Fuzzy Matching on External Form Signups
- **Logic:** [`src/app/api/webhooks/forms/route.ts:L61-L260`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/webhooks/forms/route.ts#L61-L260)
- **Algorithm:** Combines phone normalization with multi-factor token Levenshtein distance:
  1. Phone exact match lookup in `master_cubs`.
  2. If parent phone matches multiple cubs (siblings), computes name similarity against each child.
  3. Enforces an 80% (0.80) threshold to prevent sibling cross-assignment.
  4. Fallback search searches `master_cubs` by first and last name with an 80% threshold and 15% separation margin from second-best match.
- **Assessment:** Well-engineered fuzzy matching algorithm. However, line 242 uses string concatenation for the SQL `.or()` query:
  ```ts
  .or(`cub_first_name.ilike.%${firstName}%,cub_last_name.ilike.%${lastName}%`)
  ```
  If `firstName` contains commas or closing parentheses, it breaks PostgREST filter grammar (PostgREST syntax injection).

---

## 4. Authentication, Authorization & Privilege Escalation Risks

### 1. Hardcoded Secret Fallback in JWT Signing
- **Location:** [`src/lib/systemAdminAuth.ts:L8`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/systemAdminAuth.ts#L8)
- **Evidence:**
  ```ts
  const secret = process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'cero_default_dev_secret_fallback_key_2026';
  ```
- **Vulnerability:** If `JWT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are absent from the execution environment, the server signs and verifies system admin tokens using the static fallback string. Anyone possessing this string can forge valid super admin JWT cookies.

### 2. Unprotected System Admin Login Endpoint
- **Location:** [`src/app/api/system-admin/auth/route.ts:L17-L45`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/system-admin/auth/route.ts#L17-L45)
- **Evidence:** Endpoint receives raw JSON `{ email, password }`, calls `verifySystemAdminCredentials`, and sets the admin cookie.
- **Vulnerability:** No rate limiting, account lockout, or CAPTCHA. An attacker can run automated credential brute-force attacks against `/api/system-admin/auth`.

### 3. Plaintext Password Storage in Database Table
- **Location:** [`supabase/migrations/20261029000001_add_viewer_role_and_plain_password.sql:L18-L19`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261029000001_add_viewer_role_and_plain_password.sql#L18-L19), [`src/lib/actions/settings.ts:L181`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/settings.ts#L181)
- **Evidence:** Passwords passed to `createUser` and `updateUserProfile` are stored in plaintext in the `plain_password` column of `public.profiles`.
- **Impact:** Compromises user security, violates OWASP and data privacy regulations, and exposes credentials to anyone with read access to the database or settings view.

---

## 5. Error Handling & Observability

### 1. Inconsistent Error Formats across Server Actions
Server actions return contradictory error structures:
- Some return `{ error: string }` ([settings.ts:L170](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/settings.ts#L170), [engagements.ts:L247](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/engagements.ts#L247)).
- Others throw raw JavaScript `Error` exceptions ([engagements.ts:L13](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/engagements.ts#L13), [directory.ts:L11](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/directory.ts#L11)).
- Others return `{ success: boolean, error?: string }` ([system-admin.ts:L411](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/system-admin.ts#L411), [update-profile.ts:L31](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/update-profile.ts#L31)).
This inconsistency prevents the frontend from implementing a unified error boundary or error interceptor.

### 2. Swallowed Exceptions & Silent Failures
- **Location:** [`src/lib/actions/system-admin.ts:L458`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/system-admin.ts#L458)
- **Evidence:**
  ```ts
  try {
    await supabase.from('audit_log').insert({ ... });
  } catch { /* ignore audit insert failure if audit_log was cleared */ }
  ```
- Empty catch blocks hide audit log write failures during critical data cleanup operations.

### 3. Missing Structured Logging & Sentry Integration
The application has no structured logger (such as Pino) or Sentry integration. Instead, 177 ad-hoc `console.log` statements are scattered across server actions and route handlers, leaking internal object structures into production server stdout.

---

## 6. Backend Performance & Synchronous Blocking Work

### 1. Synchronous Edge Function Execution from Web Request
- **Location:** [`src/app/api/sync/trigger/route.ts:L34-L47`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/sync/trigger/route.ts#L34-L47)
- **Evidence:** `POST /api/sync/trigger` waits synchronously for `fetch(functionUrl)` to finish syncing thousands of sheet rows.
- **Impact:** If the sync takes more than 15–30 seconds, Vercel serverless gateway terminates the HTTP connection with a 504 Gateway Timeout, leaving the client believing the sync failed while the edge function continues running.
- **Fix:** Return HTTP 202 Accepted immediately and execute the sync asynchronously or poll `sync_state`.

### 2. In-Memory Post-Query Filtering on Unbounded Tables
- **Location:** [`src/lib/actions/engagements.ts:L53-L58`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/engagements.ts#L53-L58)
- **Evidence:** If `ownedCubIds.length > 150`, the code runs `await query` (pulling the entire `interactions` table) and runs `allInteractions.filter(...)` in Node.js.
- **Impact:** As interactions accumulate, this query will exhaust server memory and trigger OOM crashes on serverless instances.
- **Fix:** Enforce all filtering inside PostgreSQL using proper SQL joins or indexed `IN` subqueries.

---

## 7. Backend Findings & Recommendations

[BE-01] Non-Transactional Multi-Table Mutations | Severity: High | Effort: M  
Location: [`src/lib/actions/engagements.ts:L252-L318`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/engagements.ts#L252-L318)  
Evidence: Interaction logging inserts rows into `interactions`, `actions`, and updates `cubs` and `families` sequentially without a transaction.  
Impact: Partial write failures leave orphan actions and broken data relationships.  
Fix: Implement a stored procedure `log_interaction_atomic()` executing within a single `BEGIN ... COMMIT` block.

[BE-02] PostgREST Filter Grammar Injection via Unescaped User Input | Severity: Medium | Effort: S  
Location: [`src/app/api/webhooks/forms/route.ts:L242`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/webhooks/forms/route.ts#L242)  
Evidence: String concatenation inside `.or()` clause without stripping PostgREST reserved characters (`,`, `(`, `)`).  
Impact: Malformed webhook names break query syntax or cause unexpected query behavior.  
Fix: Sanitize input strings or use parameterized RPC search procedures.

[BE-03] Timing-Attack Vulnerability on Webhook Secret Verification | Severity: Medium | Effort: S  
Location: [`src/app/api/webhooks/forms/route.ts:L291`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/webhooks/forms/route.ts#L291)  
Evidence: Standard equality operator `secret !== process.env.WEBHOOK_SECRET` used for webhook authentication.  
Impact: Vulnerable to timing analysis attacks to deduce the shared secret byte-by-byte.  
Fix: Replace with `crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(process.env.WEBHOOK_SECRET))`.

[BE-04] Inconsistent Error Handling Strategy Across Actions | Severity: Medium | Effort: M  
Location: [`src/lib/actions/`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions)  
Evidence: Mixed usage of throw vs `{ error: string }` vs `{ success: boolean, error?: string }`.  
Impact: Prevents reliable error handling and unified toast notifications on the client.  
Fix: Standardize on an `ActionResult<T>` discriminant union pattern (`{ success: true, data: T } | { success: false, error: string }`).
