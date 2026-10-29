# CERO Tracker — Security Audit Report

**Auditor:** Principal Software Architect & Performance Engineer  
**Scope:** Authentication Planes, Authorization Enforcement, Secrets Management, OWASP Top 10, Dependency CVEs  
**Repository:** `cero-tracker`  
**Date:** 2026-10-29  

---

## 1. Security Posture Summary

A rigorous security review of the codebase revealed several critical vulnerabilities requiring immediate remediation. The most severe issue is the recent introduction of a **plaintext password storage column** on `public.profiles`, accompanied by server action read/write routines and client serialization. In addition, an administrative authentication endpoint completely lacks rate limiting, and JWT signing utilizes a static fallback secret if environment variables are not supplied.

---

## 2. Vulnerability & Threat Matrix

| ID | Title | Severity | Location | OWASP Category |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Plaintext User Password Storage in Database Table | **CRITICAL** | [`supabase/migrations/20261029000001_add_viewer_role_and_plain_password.sql:L18-L19`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261029000001_add_viewer_role_and_plain_password.sql#L18-L19) | A02:2021 Cryptographic Failures |
| **SEC-02** | Plaintext Passwords Leaked to Frontend RSC Payload | **CRITICAL** | [`src/app/(auth)/settings/page.tsx:L21-L47`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/settings/page.tsx#L21-L47) | A01:2021 Broken Access Control |
| **SEC-03** | Hardcoded JWT Secret Fallback in System Admin Auth | **CRITICAL** | [`src/lib/systemAdminAuth.ts:L8`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/systemAdminAuth.ts#L8) | A07:2021 Identification & Auth |
| **SEC-04** | Unthrottled System Admin Credential Brute-Force Endpoint | **HIGH** | [`src/app/api/system-admin/auth/route.ts:L17-L45`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/system-admin/auth/route.ts#L17-L45) | A07:2021 Identification & Auth |
| **SEC-05** | High Severity CVE in Zod Dependency (`<4.6.6`) | **HIGH** | [`package.json:L30`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/package.json#L30) (GHSA-mrhx-c7xc-m3w5) | A06:2021 Vulnerable Components |
| **SEC-06** | Timing Attack in Webhook Secret Validation | **MEDIUM** | [`src/app/api/webhooks/forms/route.ts:L291`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/webhooks/forms/route.ts#L291) | A02:2021 Cryptographic Failures |
| **SEC-07** | PostgREST Filter Grammar Injection in Webhook Search | **MEDIUM** | [`src/app/api/webhooks/forms/route.ts:L242`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/webhooks/forms/route.ts#L242) | A03:2021 Injection |

---

## 3. Deep Dive: Vulnerability Evidence & Remediation

### [SEC-01 & SEC-02] Plaintext Password Storage and Client-Side Exposure
- **Severity:** **CRITICAL**
- **Effort:** **S**
- **Location:** 
  - [`supabase/migrations/20261029000001_add_viewer_role_and_plain_password.sql:L18-L19`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261029000001_add_viewer_role_and_plain_password.sql#L18-L19)
  - [`src/lib/actions/settings.ts:L181, L263, L288`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/settings.ts#L181)
  - [`src/app/(auth)/settings/page.tsx:L21, L47`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/settings/page.tsx#L21)
- **Evidence:**
  1. Migration `20261029000001_add_viewer_role_and_plain_password.sql` executes:
     ```sql
     ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plain_password TEXT DEFAULT NULL;
     ```
  2. `settings.ts` stores raw plaintext passwords on user creation and update:
     ```ts
     plain_password: password
     ```
  3. `settings/page.tsx` selects `*` on profiles and sends it directly to the browser client component:
     ```tsx
     const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
     return <SettingsClient profile={profile as Profile} ... />;
     ```
- **Impact:** Complete compromise of user credentials. Any user or attacker inspecting network traffic or RSC payloads can harvest cleartext user passwords.
- **Fix:**
  1. Immediately drop the `plain_password` column from PostgreSQL:
     ```sql
     ALTER TABLE public.profiles DROP COLUMN IF EXISTS plain_password;
     ```
  2. Remove `plain_password` from `settings.ts` and delete the `getUserPlainPassword` action.
  3. Change all `profiles` queries to explicit column projections.

---

### [SEC-03] Hardcoded Static JWT Secret Fallback
- **Severity:** **CRITICAL**
- **Effort:** **S**
- **Location:** [`src/lib/systemAdminAuth.ts:L8-L10`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/systemAdminAuth.ts#L8-L10)
- **Evidence:**
  ```ts
  function getJwtSecret(): Uint8Array {
    const secret = process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'cero_default_dev_secret_fallback_key_2026';
    return new TextEncoder().encode(secret);
  }
  ```
- **Impact:** If `JWT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are absent or misconfigured, the fallback secret is utilized to sign and verify system administrator tokens. An attacker can generate their own valid JWT with `role: 'super_admin'` and gain complete administrative access to wipe tables and trigger syncs.
- **Fix:** Throw an explicit configuration error if the secret environment variable is missing:
  ```ts
  function getJwtSecret(): Uint8Array {
    const secret = process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) throw new Error('JWT secret configuration missing.');
    return new TextEncoder().encode(secret);
  }
  ```

---

### [SEC-04] Unthrottled System Admin Credential Brute-Force Endpoint
- **Severity:** **HIGH**
- **Effort:** **S**
- **Location:** [`src/app/api/system-admin/auth/route.ts:L17-L45`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/system-admin/auth/route.ts#L17-L45)
- **Evidence:** The `POST` handler takes raw `{ email, password }` and tests it against `verifySystemAdminCredentials` without any IP rate limiting or request throttling.
- **Impact:** Susceptible to distributed brute-force dictionary attacks.
- **Fix:** Wire up the already-installed `@upstash/ratelimit` or implement IP-based sliding window rate-limiting middleware returning HTTP 429 Too Many Requests after 5 failed attempts.

---

### [SEC-05] High Severity Memory Exhaustion CVE in Zod
- **Severity:** **HIGH**
- **Effort:** **S**
- **Location:** [`package.json:L30`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/package.json#L30)
- **Evidence:** `"zod": "^4.6.5"` installed. `npm audit` flags GHSA-mrhx-c7xc-m3w5 (Zod memory exhaustion while validating oversized constrained collections).
- **Fix:** Upgrade Zod to `^4.6.6` or `^3.24.2` via `npm update zod`.

---

### [SEC-06] Timing Attack in Webhook Secret Validation
- **Severity:** **MEDIUM**
- **Effort:** **S**
- **Location:** [`src/app/api/webhooks/forms/route.ts:L291`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/webhooks/forms/route.ts#L291)
- **Evidence:**
  ```ts
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
  ```
- **Fix:** Use constant-time equality check:
  ```ts
  import crypto from 'crypto';
  const expected = Buffer.from(process.env.WEBHOOK_SECRET || '');
  const actual = Buffer.from(secret || '');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) { ... }
  ```
