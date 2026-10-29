# CERO Tracker — Phase 0–6 Executive Summary

**System:** CERO Tracker (Perbi Cubs Relationship & Operations Management)  
**Auditor:** Principal Software Architect & Performance Engineer  
**Date:** 2026-10-29  
**Repository State:** `main` branch, Next.js 16.4.2 (Turbopack), React 19.3.0, Supabase PostgreSQL 15  

---

## 1. Overall System Health Scorecard

| Area | Score (1–10) | Status | Key Justification / Driver |
| :--- | :---: | :---: | :--- |
| **Architecture** | **5.5 / 10** | Warning | Dual conflicting auth planes (Supabase vs Jose JWT); lack of multi-table transaction boundaries; monolithic client files. |
| **Frontend** | **5.0 / 10** | Warning | Massive unvirtualized client tables; 8 God components over 1,000 LOC; 7 unused packages; React Query mounted without consumer hooks. |
| **Backend & Logic** | **6.0 / 10** | Warning | Well-designed fuzzy matching algorithm, but non-atomic multi-table mutations, unhandled race conditions, and inconsistent error signatures. |
| **Database** | **6.5 / 10** | Adequate | Highly effective composite indexing and optimized RPCs for reports, but crippled by plaintext password storage and `SELECT *` leaks. |
| **Security** | **3.5 / 10** | **CRITICAL** | Cleartext password storage column in database; passwords serialized to browser RSC payload; hardcoded JWT fallback secret; zero brute-force rate limiting. |
| **Performance** | **6.0 / 10** | Warning | Fast build (43s compile), but unbounded in-memory database filtering and synchronous long-running edge function calls create latency risks. |
| **Code Quality** | **5.0 / 10** | Warning | 445 ESLint warnings; 220 `any` casts; 177 debug `console.log` statements; copy-pasted UI components and crypto routines. |
| **Testing** | **1.0 / 10** | **CRITICAL** | **Zero automated tests configured (0% test coverage)**. No Jest/Vitest, no Playwright, no CI verification pipeline. |
| **Composite Score** | **4.8 / 10** | **Action Required** | System has powerful operational features, but security vulnerabilities and total lack of testing require immediate structured remediation. |

---

## 2. Top 10 Critical Issues (Ranked by Severity)

1. **[CRITICAL] Cleartext Password Storage in Database Table**  
   *Location:* [`supabase/migrations/20261029000001_add_viewer_role_and_plain_password.sql:L18-L19`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261029000001_add_viewer_role_and_plain_password.sql#L18-L19)  
   *Finding:* `plain_password` column added to `public.profiles`. Raw unhashed passwords stored on user creation and update.

2. **[CRITICAL] Plaintext Passwords Serialized to Browser Client Component**  
   *Location:* [`src/app/(auth)/settings/page.tsx:L21, L47`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/settings/page.tsx#L21)  
   *Finding:* `select('*')` on `profiles` includes `plain_password` in the React Server Component payload sent across the network.

3. **[CRITICAL] Hardcoded Static JWT Secret Fallback in System Admin Auth**  
   *Location:* [`src/lib/systemAdminAuth.ts:L8`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/systemAdminAuth.ts#L8)  
   *Finding:* If env vars are missing, JWT signing falls back to `'cero_default_dev_secret_fallback_key_2026'`, enabling token forgery.

4. **[CRITICAL] Total Absence of Automated Test Suite (0% Coverage)**  
   *Location:* [`package.json:L5-L10`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/package.json#L5-L10)  
   *Finding:* No unit, integration, or E2E tests exist. Refactoring or deploying changes carries regression risk.

5. **[HIGH] Unthrottled Credential Brute-Force Endpoint on System Admin**  
   *Location:* [`src/app/api/system-admin/auth/route.ts:L17-L45`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/system-admin/auth/route.ts#L17-L45)  
   *Finding:* `POST /api/system-admin/auth` accepts unlimited login attempts without rate limiting or lockout.

6. **[HIGH] Unbounded `SELECT *` In-Memory Filtering on Interactions**  
   *Location:* [`src/lib/actions/engagements.ts:L33-L60`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/engagements.ts#L33-L60)  
   *Finding:* Pulls all interactions into Node.js server heap and filters via JavaScript `.filter()`, creating an OOM risk as records scale.

7. **[HIGH] High-Severity Memory Exhaustion CVE in Zod Dependency**  
   *Location:* [`package.json:L30`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/package.json#L30) (GHSA-mrhx-c7xc-m3w5)  
   *Finding:* Installed `zod 4.6.5` has an active DoS advisory when validating constrained collections.

8. **[HIGH] Non-Transactional Multi-Table Mutations**  
   *Location:* [`src/lib/actions/engagements.ts:L252-L318`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/engagements.ts#L252-L318), [`src/lib/actions/system-admin.ts:L416-L448`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/system-admin.ts#L416-L448)  
   *Finding:* Multi-table writes (interactions -> actions -> cubs -> families) execute outside database transactions.

9. **[HIGH] Monolithic God Client Components Exceeding 3,000 Lines**  
   *Location:* [`src/app/system-admin/SystemAdminClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/system-admin/SystemAdminClient.tsx) (3,337 LOC), [`ReportsClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/reports/ReportsClient.tsx) (2,162 LOC)  
   *Finding:* Bloated client files impair maintainability, slow compilation, and prevent route-level code splitting.

10. **[HIGH] Synchronous Long-Running Edge Function Ingestion**  
    *Location:* [`src/app/api/sync/trigger/route.ts:L34-L47`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/sync/trigger/route.ts#L34-L47)  
    *Finding:* Web request blocks synchronously on multi-sheet synchronization, risking 504 Gateway Timeouts.

---

## 3. High-Value Quick Wins

The following actions require minimal code changes (<10 lines each) and deliver immediate security and hygiene benefits:

1. **Purge Plaintext Password Storage:** Drop `plain_password` column from Postgres and delete `plain_password: password` writes in `settings.ts`.
2. **Remove Hardcoded Secret Fallback:** Remove `'cero_default_dev_secret_fallback_key_2026'` in `systemAdminAuth.ts:L8`; throw an error if unset.
3. **Prune 7 Dead Dependencies:** `npm uninstall @hookform/resolvers react-hook-form @tanstack/react-table @upstash/ratelimit @upstash/redis clsx` and remove unused `QueryClientProvider`.
4. **Fix High-Severity Zod CVE:** Run `npm update zod` to resolve GHSA-mrhx-c7xc-m3w5.
5. **Strip 177 Debug Logs:** Remove all `console.log` statements from production server actions and API routes.
6. **Project Only Needed Columns on Profiles:** Change `select('*')` in `settings/page.tsx` to `select('id, full_name, role, sheet_rep_name, email')`.
