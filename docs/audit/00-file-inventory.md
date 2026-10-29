# CERO Tracker — Phase 0: File Inventory & Reconnaissance

**Repository:** `cero-tracker`  
**Framework:** Next.js 16.4.2 (Turbopack, App Router)  
**Language:** TypeScript 5, React 19.3.0  
**Backend:** Supabase (PostgreSQL 15, Auth, Row Level Security, Edge Functions)  
**External Services:** Google Sheets API v4, Google Forms API  
**Total Identified Files:** 217  
**Files Audited (READ):** 211  
**Files Skipped:** 6 (lockfiles, generated caches, binary media)  
**Timestamp:** 2026-10-29

---

## 1. System Reconnaissance Summary

| Dimension | Value / Technology | Evidence / File Location |
| :--- | :--- | :--- |
| **Framework** | Next.js 16.4.2 (App Router, Turbopack enabled) | [`package.json`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/package.json#L25) |
| **Language** | TypeScript 5 (Strict Mode, `tsc --noEmit` passing) | [`tsconfig.json`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/tsconfig.json#L1-L24) |
| **UI Library** | React 19.3.0, React DOM 19.3.0 | [`package.json`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/package.json#L26-L27) |
| **Icons & Design** | Lucide React 1.53.0, Vanilla CSS Modules | [`package.json`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/package.json#L24) |
| **State Management** | Zustand 5.0.15 (1 store), React `useState`, `useTransition` | [`src/lib/store.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/store.ts#L1-L56) |
| **Database & Auth** | Supabase SSR 0.12.7, Supabase JS 2.117.3 | [`package.json`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/package.json#L13-L14) |
| **Migrations** | 38 SQL migrations, 18 tables, 40 RPC functions | [`supabase/migrations/`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations) |
| **Deployment & Host** | Vercel (Configuration present) | [`vercel.json`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/vercel.json#L1-L8) |
| **Package Manager** | npm (package-lock.json v3 format) | [`package-lock.json`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/package-lock.json) |
| **Build Tooling** | Turbopack (`next build`, 43s compile, 20 routes) | Build output log |
| **Linter** | ESLint 9 (Flat Config: `eslint.config.mjs`, 445 warnings) | [`eslint.config.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/eslint.config.mjs#L1-L35) |
| **Test Suite** | **None configured** (0 tests, no jest/vitest/playwright) | [`package.json`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/package.json#L5-L10) |
| **Rate Limiting** | Upstash Redis installed but **unused** | [`package.json`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/package.json#L17-L18) |

---

## 2. Command Execution & Health Checks

1. **Type Check (`npx tsc --noEmit`):**
   - **Exit Code:** 0
   - **Result:** Passed cleanly with zero TypeScript compiler errors.
2. **Production Build (`npm run build`):**
   - **Exit Code:** 0
   - **Turbopack Compile:** 43s
   - **TypeScript Verification:** 44s
   - **Static & Dynamic Route Generation:** 20 routes generated successfully in 6.8s.
3. **Linter (`npm run lint`):**
   - **Exit Code:** 0
   - **Result:** 445 problems (0 errors, 445 warnings).
   - **Primary Causes:** 220 instances of `@typescript-eslint/no-explicit-any`, unused function parameters, and `prefer-const`.
4. **Dependency Audit (`npm audit`):**
   - **Exit Code:** 1
   - **Result:** 2 vulnerabilities identified:
     - **HIGH:** `zod <4.6.6` — [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) (Zod memory exhaustion DoS when validating oversized constrained collections).
     - **MODERATE:** `qs 6.7.0 - 6.16.0` — [GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw) (DoS via non-callable own toString).
5. **Test Suite & Coverage:**
   - **Status:** **UNCONFIGURED**.
   - **Reason:** `package.json` defines no test script. No test runner (`jest`, `vitest`, `playwright`, `cypress`) is installed. Only 15 manual test scripts exist in `scratch/` and `scripts/`. Coverage report is unconfigured.

---

## 3. Dependency Inventory

### Production Dependencies (`dependencies`)
| Package | Version in Manifest | Actual Resolved | Category / Purpose | Audit / Usage Status |
| :--- | :--- | :--- | :--- | :--- |
| `@hookform/resolvers` | ^5.9.1 | 5.9.1 | Form validation resolver | **UNUSED** (0 imports in code) |
| `@supabase/ssr` | ^0.12.7 | 0.12.7 | Supabase SSR cookie & session handler | Active (3 imports) |
| `@supabase/supabase-js` | ^2.117.3 | 2.117.3 | Supabase PostgreSQL & Auth SDK | Active (26 imports) |
| `@tanstack/react-query` | ^5.104.1 | 5.104.1 | Asynchronous server-state management | **DEAD IMPORT** (Provider mounted in `providers.tsx`, 0 query hooks used) |
| `@tanstack/react-table` | ^9.2.6 | 9.2.6 | Headless table state | **UNUSED** (0 imports in code) |
| `@upstash/ratelimit` | ^2.2.0 | 2.2.0 | Upstash Redis API rate limiter | **UNUSED** (0 imports in code, endpoints unthrottled) |
| `@upstash/redis` | ^1.39.0 | 1.39.0 | Serverless Redis client | **UNUSED** (0 imports in code) |
| `clsx` | ^2.1.1 | 2.1.1 | Classname concatenation | **UNUSED** (0 imports in code) |
| `date-fns` | ^4.4.0 | 4.4.0 | Date formatting utilities | Active (3 imports) |
| `dotenv` | ^18.0.6 | 18.0.6 | Local environment variable loader | Active (scripts & tests) |
| `googleapis` | ^185.0.0 | 185.0.0 | Google Forms & Sheets official API | Active (6 imports in forms & scripts) |
| `jose` | ^6.2.12 | 6.2.12 | JWT signing and verification | Active (`systemAdminAuth.ts`) |
| `lucide-react` | ^1.53.0 | 1.53.0 | UI Vector icon library | Active (33 component imports) |
| `next` | 16.4.2 | 16.4.2 | Fullstack React framework (Turbopack) | Core |
| `react` | 19.3.0 | 19.3.0 | Modern UI framework | Core |
| `react-dom` | 19.3.0 | 19.3.0 | React DOM renderer | Core |
| `react-hook-form` | ^7.89.0 | 7.89.0 | Headless form state management | **UNUSED** (0 imports in code) |
| `sonner` | ^2.0.8 | 2.0.8 | Toast notification system | Active (21 component imports) |
| `zod` | ^4.6.5 | 4.6.5 | Runtime schema validation | Active (5 imports) — **HIGH CVE** |
| `zustand` | ^5.0.15 | 5.0.15 | Micro client state store | Active (1 store in `store.ts`) |

### Development Dependencies (`devDependencies`)
| Package | Version | Purpose |
| :--- | :--- | :--- |
| `@types/node` | ^20 | Node.js runtime type definitions |
| `@types/react` | ^19 | React 19 type definitions |
| `@types/react-dom` | ^19 | React DOM 19 type definitions |
| `eslint` | ^9 | JavaScript/TypeScript linter (Flat Config) |
| `eslint-config-next` | 16.4.0 | Next.js core web vitals and TypeScript lint rules |
| `typescript` | ^5 | TypeScript compiler and language service |

---

## 4. Complete Source File Inventory (217 Files)

Every file in the repository (excluding vendored `node_modules/`, `.git/`, `.next/`, and `docs/audit/`) has been audited:

| # | Path | LOC | Status | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| 1 | [`.agents/skills/api-endpoint-design/SKILL.md`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/.agents/skills/api-endpoint-design/SKILL.md) | 27 | `READ` | Agentic workflow customization / skill documentation |
| 2 | [`.agents/skills/auth-permissions-setup/SKILL.md`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/.agents/skills/auth-permissions-setup/SKILL.md) | 30 | `READ` | Agentic workflow customization / skill documentation |
| 3 | [`.agents/skills/caching-cdn-strategy/SKILL.md`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/.agents/skills/caching-cdn-strategy/SKILL.md) | 26 | `READ` | Agentic workflow customization / skill documentation |
| 4 | [`.agents/skills/cloud-infra-deployment/SKILL.md`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/.agents/skills/cloud-infra-deployment/SKILL.md) | 24 | `READ` | Agentic workflow customization / skill documentation |
| 5 | [`.agents/skills/database-schema-design/SKILL.md`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/.agents/skills/database-schema-design/SKILL.md) | 29 | `READ` | Agentic workflow customization / skill documentation |
| 6 | [`.agents/skills/disaster-recovery-planning/SKILL.md`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/.agents/skills/disaster-recovery-planning/SKILL.md) | 25 | `READ` | Agentic workflow customization / skill documentation |
| 7 | [`.agents/skills/feature-architecture-planning/SKILL.md`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/.agents/skills/feature-architecture-planning/SKILL.md) | 26 | `READ` | Agentic workflow customization / skill documentation |
| 8 | [`.agents/skills/observability-error-tracking/SKILL.md`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/.agents/skills/observability-error-tracking/SKILL.md) | 24 | `READ` | Agentic workflow customization / skill documentation |
| 9 | [`.agents/skills/rate-limiting-setup/SKILL.md`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/.agents/skills/rate-limiting-setup/SKILL.md) | 28 | `READ` | Agentic workflow customization / skill documentation |
| 10 | [`.agents/skills/scaling-performance/SKILL.md`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/.agents/skills/scaling-performance/SKILL.md) | 27 | `READ` | Agentic workflow customization / skill documentation |
| 11 | [`.agents/skills/security-hardening-review/SKILL.md`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/.agents/skills/security-hardening-review/SKILL.md) | 27 | `READ` | Agentic workflow customization / skill documentation |
| 12 | [`.agents/skills/third-party-integration/SKILL.md`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/.agents/skills/third-party-integration/SKILL.md) | 27 | `READ` | Agentic workflow customization / skill documentation |
| 13 | [`.agents/skills/ui-ux-component-design/SKILL.md`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/.agents/skills/ui-ux-component-design/SKILL.md) | 25 | `READ` | Agentic workflow customization / skill documentation |
| 14 | [`.env.example`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/.env.example) | 28 | `READ` | Project configuration / root documentation |
| 15 | [`.env.local`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/.env.local) | 22 | `READ` | Project configuration / root documentation |
| 16 | [`.gitignore`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/.gitignore) | 58 | `READ` | Project configuration / root documentation |
| 17 | [`AGENTS.md`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/AGENTS.md) | 10 | `READ` | Project configuration / root documentation |
| 18 | [`cer-dashboard-sheet-sync-db2f7ed47184.json`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/cer-dashboard-sheet-sync-db2f7ed47184.json) | 14 | `READ` | Project configuration / root documentation |
| 19 | [`eslint.config.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/eslint.config.mjs) | 35 | `READ` | Project configuration / root documentation |
| 20 | [`implementation.md`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/implementation.md) | 957 | `READ` | Project configuration / root documentation |
| 21 | [`next-env.d.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/next-env.d.ts) | 8 | `READ` | Project configuration / root documentation |
| 22 | [`next.config.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/next.config.ts) | 16 | `READ` | Project configuration / root documentation |
| 23 | [`package-lock.json`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/package-lock.json) | 6500 | `SKIPPED (Generated/build/lock file)` | Project configuration / root documentation |
| 24 | [`package.json`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/package.json) | 42 | `READ` | Project configuration / root documentation |
| 25 | [`public/file.svg`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/public/file.svg) | 1 | `READ` | Static public asset |
| 26 | [`public/globe.svg`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/public/globe.svg) | 1 | `READ` | Static public asset |
| 27 | [`public/logo.png`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/public/logo.png) | 0 | `SKIPPED (Binary asset file)` | Static public asset |
| 28 | [`public/next.svg`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/public/next.svg) | 1 | `READ` | Static public asset |
| 29 | [`public/vercel.svg`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/public/vercel.svg) | 1 | `READ` | Static public asset |
| 30 | [`public/window.svg`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/public/window.svg) | 1 | `READ` | Static public asset |
| 31 | [`reading_circle_migration_analysis.md`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/reading_circle_migration_analysis.md) | 103 | `READ` | Project configuration / root documentation |
| 32 | [`README.md`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/README.md) | 37 | `READ` | Project configuration / root documentation |
| 33 | [`scratch/analyze-migration.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/analyze-migration.mjs) | 354 | `READ` | Ad-hoc local experiment/debugging script |
| 34 | [`scratch/check-db-presence.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/check-db-presence.mjs) | 69 | `READ` | Ad-hoc local experiment/debugging script |
| 35 | [`scratch/check-extra-cubs.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/check-extra-cubs.mjs) | 42 | `READ` | Ad-hoc local experiment/debugging script |
| 36 | [`scratch/check-headers.js`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/check-headers.js) | 42 | `READ` | Ad-hoc local experiment/debugging script |
| 37 | [`scratch/check-master-cubs.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/check-master-cubs.mjs) | 30 | `READ` | Ad-hoc local experiment/debugging script |
| 38 | [`scratch/find-jannel.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/find-jannel.mjs) | 22 | `READ` | Ad-hoc local experiment/debugging script |
| 39 | [`scratch/find-missing-orientation.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/find-missing-orientation.mjs) | 37 | `READ` | Ad-hoc local experiment/debugging script |
| 40 | [`scratch/inspect-all-date-cols.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/inspect-all-date-cols.mjs) | 34 | `READ` | Ad-hoc local experiment/debugging script |
| 41 | [`scratch/inspect-ethan.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/inspect-ethan.mjs) | 23 | `READ` | Ad-hoc local experiment/debugging script |
| 42 | [`scratch/migration-dryrun.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/migration-dryrun.mjs) | 255 | `READ` | Ad-hoc local experiment/debugging script |
| 43 | [`scratch/test-batch-get.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/test-batch-get.mjs) | 42 | `READ` | Ad-hoc local experiment/debugging script |
| 44 | [`scratch/test-debug-dir.js`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/test-debug-dir.js) | 16 | `READ` | Ad-hoc local experiment/debugging script |
| 45 | [`scratch/test-env-login.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/test-env-login.mjs) | 42 | `READ` | Ad-hoc local experiment/debugging script |
| 46 | [`scratch/test-env-parse.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/test-env-parse.mjs) | 24 | `READ` | Ad-hoc local experiment/debugging script |
| 47 | [`scratch/test-escape.js`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/test-escape.js) | 29 | `READ` | Ad-hoc local experiment/debugging script |
| 48 | [`scratch/test-exact-candidate.js`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/test-exact-candidate.js) | 36 | `READ` | Ad-hoc local experiment/debugging script |
| 49 | [`scratch/test-full-migration-logic.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/test-full-migration-logic.mjs) | 257 | `READ` | Ad-hoc local experiment/debugging script |
| 50 | [`scratch/test-interpolation.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/test-interpolation.mjs) | 146 | `READ` | Ad-hoc local experiment/debugging script |
| 51 | [`scratch/test-next-env.js`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/test-next-env.js) | 33 | `READ` | Ad-hoc local experiment/debugging script |
| 52 | [`scratch/test-perbicubs-login.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/test-perbicubs-login.mjs) | 49 | `READ` | Ad-hoc local experiment/debugging script |
| 53 | [`scratch/test-reps.js`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/test-reps.js) | 26 | `READ` | Ad-hoc local experiment/debugging script |
| 54 | [`scratch/test-sa-access.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/test-sa-access.mjs) | 25 | `READ` | Ad-hoc local experiment/debugging script |
| 55 | [`scratch/test-sheets.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/test-sheets.mjs) | 29 | `READ` | Ad-hoc local experiment/debugging script |
| 56 | [`scratch/test-supabase.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scratch/test-supabase.mjs) | 20 | `READ` | Ad-hoc local experiment/debugging script |
| 57 | [`scripts/apply-rls.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scripts/apply-rls.sql) | 101 | `READ` | CLI/maintenance script: apply-rls.sql |
| 58 | [`scripts/check-db.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scripts/check-db.mjs) | 12 | `READ` | CLI/maintenance script: check-db.mjs |
| 59 | [`scripts/check-owners.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scripts/check-owners.mjs) | 21 | `READ` | CLI/maintenance script: check-owners.mjs |
| 60 | [`scripts/check-profiles.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scripts/check-profiles.mjs) | 18 | `READ` | CLI/maintenance script: check-profiles.mjs |
| 61 | [`scripts/check-query.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scripts/check-query.mjs) | 33 | `READ` | CLI/maintenance script: check-query.mjs |
| 62 | [`scripts/create-admin.js`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scripts/create-admin.js) | 67 | `READ` | CLI/maintenance script: create-admin.js |
| 63 | [`scripts/gen-apply-rls.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scripts/gen-apply-rls.mjs) | 51 | `READ` | CLI/maintenance script: gen-apply-rls.mjs |
| 64 | [`scripts/google-forms-webhook.js`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scripts/google-forms-webhook.js) | 310 | `READ` | CLI/maintenance script: google-forms-webhook.js |
| 65 | [`scripts/test-sheet.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scripts/test-sheet.mjs) | 17 | `READ` | CLI/maintenance script: test-sheet.mjs |
| 66 | [`scripts/update-policies.mjs`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/scripts/update-policies.mjs) | 9 | `READ` | CLI/maintenance script: update-policies.mjs |
| 67 | [`src/app/(auth)/_placeholder.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/_placeholder.tsx) | 21 | `READ` | Authenticated page/view: (auth) |
| 68 | [`src/app/(auth)/actions.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/actions.ts) | 14 | `READ` | Authenticated page/view: (auth) |
| 69 | [`src/app/(auth)/dashboard/DashboardClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/dashboard/DashboardClient.tsx) | 335 | `READ` | Authenticated page/view: dashboard |
| 70 | [`src/app/(auth)/dashboard/loading.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/dashboard/loading.tsx) | 6 | `READ` | Authenticated page/view: dashboard |
| 71 | [`src/app/(auth)/dashboard/page.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/dashboard/page.tsx) | 55 | `READ` | Authenticated page/view: dashboard |
| 72 | [`src/app/(auth)/directory/DirectoryClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/directory/DirectoryClient.tsx) | 1125 | `READ` | Authenticated page/view: directory |
| 73 | [`src/app/(auth)/directory/loading.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/directory/loading.tsx) | 6 | `READ` | Authenticated page/view: directory |
| 74 | [`src/app/(auth)/directory/page.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/directory/page.tsx) | 55 | `READ` | Authenticated page/view: directory |
| 75 | [`src/app/(auth)/engagements/engagements.module.css`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/engagements/engagements.module.css) | 346 | `READ` | Authenticated page/view: engagements |
| 76 | [`src/app/(auth)/engagements/EngagementsClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/engagements/EngagementsClient.tsx) | 1217 | `READ` | Authenticated page/view: engagements |
| 77 | [`src/app/(auth)/engagements/loading.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/engagements/loading.tsx) | 6 | `READ` | Authenticated page/view: engagements |
| 78 | [`src/app/(auth)/engagements/page.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/engagements/page.tsx) | 54 | `READ` | Authenticated page/view: engagements |
| 79 | [`src/app/(auth)/handover/HandoverClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/handover/HandoverClient.tsx) | 481 | `READ` | Authenticated page/view: handover |
| 80 | [`src/app/(auth)/handover/loading.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/handover/loading.tsx) | 6 | `READ` | Authenticated page/view: handover |
| 81 | [`src/app/(auth)/handover/page.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/handover/page.tsx) | 35 | `READ` | Authenticated page/view: handover |
| 82 | [`src/app/(auth)/layout.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/layout.tsx) | 60 | `READ` | Authenticated page/view: (auth) |
| 83 | [`src/app/(auth)/orientation/loading.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/orientation/loading.tsx) | 6 | `READ` | Authenticated page/view: orientation |
| 84 | [`src/app/(auth)/orientation/OrientationClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/orientation/OrientationClient.tsx) | 1964 | `READ` | Authenticated page/view: orientation |
| 85 | [`src/app/(auth)/orientation/page.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/orientation/page.tsx) | 51 | `READ` | Authenticated page/view: orientation |
| 86 | [`src/app/(auth)/reading-circle/loading.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/reading-circle/loading.tsx) | 6 | `READ` | Authenticated page/view: reading-circle |
| 87 | [`src/app/(auth)/reading-circle/page.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/reading-circle/page.tsx) | 52 | `READ` | Authenticated page/view: reading-circle |
| 88 | [`src/app/(auth)/reading-circle/ReadingCircleClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/reading-circle/ReadingCircleClient.tsx) | 1009 | `READ` | Authenticated page/view: reading-circle |
| 89 | [`src/app/(auth)/reports/loading.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/reports/loading.tsx) | 6 | `READ` | Authenticated page/view: reports |
| 90 | [`src/app/(auth)/reports/page.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/reports/page.tsx) | 128 | `READ` | Authenticated page/view: reports |
| 91 | [`src/app/(auth)/reports/ReportsClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/reports/ReportsClient.tsx) | 2162 | `READ` | Authenticated page/view: reports |
| 92 | [`src/app/(auth)/settings/loading.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/settings/loading.tsx) | 6 | `READ` | Authenticated page/view: settings |
| 93 | [`src/app/(auth)/settings/page.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/settings/page.tsx) | 53 | `READ` | Authenticated page/view: settings |
| 94 | [`src/app/(auth)/settings/SettingsClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/settings/SettingsClient.tsx) | 1122 | `READ` | Authenticated page/view: settings |
| 95 | [`src/app/(auth)/shift-actions/loading.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/shift-actions/loading.tsx) | 6 | `READ` | Authenticated page/view: shift-actions |
| 96 | [`src/app/(auth)/shift-actions/page.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/shift-actions/page.tsx) | 35 | `READ` | Authenticated page/view: shift-actions |
| 97 | [`src/app/(auth)/shift-actions/ShiftClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/shift-actions/ShiftClient.tsx) | 149 | `READ` | Authenticated page/view: shift-actions |
| 98 | [`src/app/api/cron/rebuild-forms/route.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/cron/rebuild-forms/route.ts) | 37 | `READ` | API route handler for /api/cron/rebuild-forms |
| 99 | [`src/app/api/sync/trigger/route.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/sync/trigger/route.ts) | 84 | `READ` | API route handler for /api/sync/trigger |
| 100 | [`src/app/api/system-admin/auth/route.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/system-admin/auth/route.ts) | 51 | `READ` | API route handler for /api/system-admin/auth |
| 101 | [`src/app/api/webhooks/forms/route.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/webhooks/forms/route.ts) | 401 | `READ` | API route handler for /api/webhooks/forms |
| 102 | [`src/app/globals.css`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/globals.css) | 109 | `READ` | Application route/layout component: globals.css |
| 103 | [`src/app/icon.png`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/icon.png) | 0 | `SKIPPED (Binary asset file)` | Application route/layout component: icon.png |
| 104 | [`src/app/layout.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/layout.tsx) | 31 | `READ` | Application route/layout component: layout.tsx |
| 105 | [`src/app/login/actions.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/login/actions.ts) | 53 | `READ` | Application route/layout component: login/actions.ts |
| 106 | [`src/app/login/page.module.css`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/login/page.module.css) | 146 | `READ` | Application route/layout component: login/page.module.css |
| 107 | [`src/app/login/page.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/login/page.tsx) | 103 | `READ` | Application route/layout component: login/page.tsx |
| 108 | [`src/app/page.module.css`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/page.module.css) | 151 | `READ` | Application route/layout component: page.module.css |
| 109 | [`src/app/page.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/page.tsx) | 26 | `READ` | Application route/layout component: page.tsx |
| 110 | [`src/app/providers.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/providers.tsx) | 26 | `READ` | Application route/layout component: providers.tsx |
| 111 | [`src/app/system-admin/ApprovalsTab.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/system-admin/ApprovalsTab.tsx) | 578 | `READ` | Application route/layout component: system-admin/ApprovalsTab.tsx |
| 112 | [`src/app/system-admin/ArchivedCubsTab.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/system-admin/ArchivedCubsTab.tsx) | 692 | `READ` | Application route/layout component: system-admin/ArchivedCubsTab.tsx |
| 113 | [`src/app/system-admin/layout.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/system-admin/layout.tsx) | 79 | `READ` | Application route/layout component: system-admin/layout.tsx |
| 114 | [`src/app/system-admin/login/page.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/system-admin/login/page.tsx) | 97 | `READ` | Application route/layout component: system-admin/login/page.tsx |
| 115 | [`src/app/system-admin/page.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/system-admin/page.tsx) | 35 | `READ` | Application route/layout component: system-admin/page.tsx |
| 116 | [`src/app/system-admin/SystemAdminClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/system-admin/SystemAdminClient.tsx) | 3337 | `READ` | Application route/layout component: system-admin/SystemAdminClient.tsx |
| 117 | [`src/components/drawers/AssignRCSelectionDrawer.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/drawers/AssignRCSelectionDrawer.tsx) | 290 | `READ` | Slide-out drawer modal UI component: AssignRCSelectionDrawer |
| 118 | [`src/components/drawers/CubProfileDrawer.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/drawers/CubProfileDrawer.tsx) | 915 | `READ` | Slide-out drawer modal UI component: CubProfileDrawer |
| 119 | [`src/components/drawers/InteractionDrawer.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/drawers/InteractionDrawer.tsx) | 286 | `READ` | Slide-out drawer modal UI component: InteractionDrawer |
| 120 | [`src/components/drawers/OrientationJourneyDrawer.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/drawers/OrientationJourneyDrawer.tsx) | 748 | `READ` | Slide-out drawer modal UI component: OrientationJourneyDrawer |
| 121 | [`src/components/drawers/ProcessPendingDrawer.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/drawers/ProcessPendingDrawer.tsx) | 673 | `READ` | Slide-out drawer modal UI component: ProcessPendingDrawer |
| 122 | [`src/components/drawers/RCAttendanceDrawer.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/drawers/RCAttendanceDrawer.tsx) | 387 | `READ` | Slide-out drawer modal UI component: RCAttendanceDrawer |
| 123 | [`src/components/drawers/RCChangeSessionDrawer.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/drawers/RCChangeSessionDrawer.tsx) | 391 | `READ` | Slide-out drawer modal UI component: RCChangeSessionDrawer |
| 124 | [`src/components/layout/AppShell.module.css`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/layout/AppShell.module.css) | 112 | `READ` | Layout shell / navigation component: AppShell.module |
| 125 | [`src/components/layout/AppShell.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/layout/AppShell.tsx) | 134 | `READ` | Layout shell / navigation component: AppShell |
| 126 | [`src/components/layout/Sidebar.module.css`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/layout/Sidebar.module.css) | 168 | `READ` | Layout shell / navigation component: Sidebar.module |
| 127 | [`src/components/layout/Sidebar.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/layout/Sidebar.tsx) | 167 | `READ` | Layout shell / navigation component: Sidebar |
| 128 | [`src/components/ui/AdvancedFilterDrawer.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/ui/AdvancedFilterDrawer.tsx) | 311 | `READ` | UI component: AdvancedFilterDrawer |
| 129 | [`src/components/ui/ConfirmModal.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/ui/ConfirmModal.tsx) | 348 | `READ` | UI component: ConfirmModal |
| 130 | [`src/components/ui/dashboard.module.css`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/ui/dashboard.module.css) | 472 | `READ` | UI component: dashboard.module |
| 131 | [`src/components/ui/DirectoryCubFilter.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/ui/DirectoryCubFilter.tsx) | 641 | `READ` | UI component: DirectoryCubFilter |
| 132 | [`src/components/ui/DirectoryFamilyFilter.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/ui/DirectoryFamilyFilter.tsx) | 442 | `READ` | UI component: DirectoryFamilyFilter |
| 133 | [`src/components/ui/LogInteractionDrawer.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/ui/LogInteractionDrawer.tsx) | 716 | `READ` | UI component: LogInteractionDrawer |
| 134 | [`src/components/ui/NotificationBell.module.css`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/ui/NotificationBell.module.css) | 499 | `READ` | UI component: NotificationBell.module |
| 135 | [`src/components/ui/NotificationBell.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/ui/NotificationBell.tsx) | 467 | `READ` | UI component: NotificationBell |
| 136 | [`src/components/ui/OrientationFilterDrawer.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/ui/OrientationFilterDrawer.tsx) | 437 | `READ` | UI component: OrientationFilterDrawer |
| 137 | [`src/components/ui/RepFilterBar.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/ui/RepFilterBar.tsx) | 61 | `READ` | UI component: RepFilterBar |
| 138 | [`src/components/ui/Skeleton.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/ui/Skeleton.tsx) | 1204 | `READ` | UI component: Skeleton |
| 139 | [`src/hooks/useRealtimeSync.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/hooks/useRealtimeSync.ts) | 93 | `READ` | Project configuration / root documentation |
| 140 | [`src/hooks/useTableSort.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/hooks/useTableSort.ts) | 175 | `READ` | Project configuration / root documentation |
| 141 | [`src/lib/actions/dashboard.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/dashboard.ts) | 313 | `READ` | Server Action module for dashboard |
| 142 | [`src/lib/actions/directory.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/directory.ts) | 378 | `READ` | Server Action module for directory |
| 143 | [`src/lib/actions/edit-requests.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/edit-requests.ts) | 603 | `READ` | Server Action module for edit-requests |
| 144 | [`src/lib/actions/engagements.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/engagements.ts) | 748 | `READ` | Server Action module for engagements |
| 145 | [`src/lib/actions/forms.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/forms.ts) | 266 | `READ` | Server Action module for forms |
| 146 | [`src/lib/actions/handover.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/handover.ts) | 150 | `READ` | Server Action module for handover |
| 147 | [`src/lib/actions/orientation.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/orientation.ts) | 519 | `READ` | Server Action module for orientation |
| 148 | [`src/lib/actions/pending-signups.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/pending-signups.ts) | 164 | `READ` | Server Action module for pending-signups |
| 149 | [`src/lib/actions/perbicubs-api.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/perbicubs-api.ts) | 303 | `READ` | Server Action module for perbicubs-api |
| 150 | [`src/lib/actions/rc-migration.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/rc-migration.ts) | 440 | `READ` | Server Action module for rc-migration |
| 151 | [`src/lib/actions/reading-circle.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/reading-circle.ts) | 467 | `READ` | Server Action module for reading-circle |
| 152 | [`src/lib/actions/reports.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/reports.ts) | 534 | `READ` | Server Action module for reports |
| 153 | [`src/lib/actions/settings.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/settings.ts) | 296 | `READ` | Server Action module for settings |
| 154 | [`src/lib/actions/shift.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/shift.ts) | 64 | `READ` | Server Action module for shift |
| 155 | [`src/lib/actions/system-admin.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/system-admin.ts) | 870 | `READ` | Server Action module for system-admin |
| 156 | [`src/lib/actions/update-profile.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/update-profile.ts) | 555 | `READ` | Server Action module for update-profile |
| 157 | [`src/lib/constants/forms.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/constants/forms.ts) | 87 | `READ` | Project configuration / root documentation |
| 158 | [`src/lib/store.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/store.ts) | 56 | `READ` | Project configuration / root documentation |
| 159 | [`src/lib/supabase/admin.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/supabase/admin.ts) | 18 | `READ` | Supabase client/server connection & auth helper |
| 160 | [`src/lib/supabase/client.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/supabase/client.ts) | 16 | `READ` | Supabase client/server connection & auth helper |
| 161 | [`src/lib/supabase/getProfile.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/supabase/getProfile.ts) | 42 | `READ` | Supabase client/server connection & auth helper |
| 162 | [`src/lib/supabase/proxy.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/supabase/proxy.ts) | 66 | `READ` | Supabase client/server connection & auth helper |
| 163 | [`src/lib/supabase/server.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/supabase/server.ts) | 31 | `READ` | Supabase client/server connection & auth helper |
| 164 | [`src/lib/system-admin-config.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/system-admin-config.ts) | 9 | `READ` | Project configuration / root documentation |
| 165 | [`src/lib/systemAdminAuth.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/systemAdminAuth.ts) | 112 | `READ` | Project configuration / root documentation |
| 166 | [`src/lib/types.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/types.ts) | 266 | `READ` | Core TypeScript domain models, database row types & enums |
| 167 | [`src/lib/utils/contact.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/utils/contact.ts) | 26 | `READ` | Utility functions for contact |
| 168 | [`src/lib/utils/date.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/utils/date.ts) | 43 | `READ` | Utility functions for date |
| 169 | [`src/lib/utils/enrichSignups.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/utils/enrichSignups.ts) | 57 | `READ` | Utility functions for enrichSignups |
| 170 | [`src/lib/utils/orientation.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/utils/orientation.ts) | 169 | `READ` | Utility functions for orientation |
| 171 | [`src/lib/utils/rc.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/utils/rc.ts) | 135 | `READ` | Utility functions for rc |
| 172 | [`src/proxy.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/proxy.ts) | 20 | `READ` | Project configuration / root documentation |
| 173 | [`supabase/.temp/cli-latest`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/.temp/cli-latest) | 0 | `SKIPPED (Generated/build/lock file)` | Project configuration / root documentation |
| 174 | [`supabase/.temp/linked-project.json`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/.temp/linked-project.json) | 0 | `SKIPPED (Generated/build/lock file)` | Project configuration / root documentation |
| 175 | [`supabase/functions/sync-master-cubs/index.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/functions/sync-master-cubs/index.ts) | 666 | `READ` | Supabase Edge Function: sync-master-cubs |
| 176 | [`supabase/migrations/20261008000000_initial_schema.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261008000000_initial_schema.sql) | 544 | `READ` | SQL database migration schema/RPC: 20261008000000_initial_schema |
| 177 | [`supabase/migrations/20261008000001_fix_rls_policies.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261008000001_fix_rls_policies.sql) | 150 | `READ` | SQL database migration schema/RPC: 20261008000001_fix_rls_policies |
| 178 | [`supabase/migrations/20261008000002_pg_cron_schedule.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261008000002_pg_cron_schedule.sql) | 34 | `READ` | SQL database migration schema/RPC: 20261008000002_pg_cron_schedule |
| 179 | [`supabase/migrations/20261009000001_app_config_and_fix_sync_state.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261009000001_app_config_and_fix_sync_state.sql) | 17 | `READ` | SQL database migration schema/RPC: 20261009000001_app_config_and_fix_sync_state |
| 180 | [`supabase/migrations/20261010152550_fix_rls_sheet_rep_name.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261010152550_fix_rls_sheet_rep_name.sql) | 107 | `READ` | SQL database migration schema/RPC: 20261010152550_fix_rls_sheet_rep_name |
| 181 | [`supabase/migrations/20261011124500_fix_rls_and_integrity.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261011124500_fix_rls_and_integrity.sql) | 221 | `READ` | SQL database migration schema/RPC: 20261011124500_fix_rls_and_integrity |
| 182 | [`supabase/migrations/20261011153000_allow_pending_booked_status.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261011153000_allow_pending_booked_status.sql) | 4 | `READ` | SQL database migration schema/RPC: 20261011153000_allow_pending_booked_status |
| 183 | [`supabase/migrations/20261011162000_orientation_enrollment_and_onboarding.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261011162000_orientation_enrollment_and_onboarding.sql) | 199 | `READ` | SQL database migration schema/RPC: 20261011162000_orientation_enrollment_and_onboarding |
| 184 | [`supabase/migrations/20261012120000_orientation_rc_integrity.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261012120000_orientation_rc_integrity.sql) | 302 | `READ` | SQL database migration schema/RPC: 20261012120000_orientation_rc_integrity |
| 185 | [`supabase/migrations/20261012174500_get_dashboard_stats_rpc.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261012174500_get_dashboard_stats_rpc.sql) | 79 | `READ` | SQL database migration schema/RPC: 20261012174500_get_dashboard_stats_rpc |
| 186 | [`supabase/migrations/20261013120000_orientation_rc_team_access.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261013120000_orientation_rc_team_access.sql) | 88 | `READ` | SQL database migration schema/RPC: 20261013120000_orientation_rc_team_access |
| 187 | [`supabase/migrations/20261013140000_realtime_rc_attendance.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261013140000_realtime_rc_attendance.sql) | 13 | `READ` | SQL database migration schema/RPC: 20261013140000_realtime_rc_attendance |
| 188 | [`supabase/migrations/20261013160000_fix_dashboard_stats_cancelled_actions.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261013160000_fix_dashboard_stats_cancelled_actions.sql) | 84 | `READ` | SQL database migration schema/RPC: 20261013160000_fix_dashboard_stats_cancelled_actions |
| 189 | [`supabase/migrations/20261014043000_action_status_options.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261014043000_action_status_options.sql) | 7 | `READ` | SQL database migration schema/RPC: 20261014043000_action_status_options |
| 190 | [`supabase/migrations/20261014110000_rep_actions_access.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261014110000_rep_actions_access.sql) | 23 | `READ` | SQL database migration schema/RPC: 20261014110000_rep_actions_access |
| 191 | [`supabase/migrations/20261014155000_sync_write_isolation_and_indexes.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261014155000_sync_write_isolation_and_indexes.sql) | 82 | `READ` | SQL database migration schema/RPC: 20261014155000_sync_write_isolation_and_indexes |
| 192 | [`supabase/migrations/20261014163000_pending_signups_delete_policy.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261014163000_pending_signups_delete_policy.sql) | 8 | `READ` | SQL database migration schema/RPC: 20261014163000_pending_signups_delete_policy |
| 193 | [`supabase/migrations/20261015030000_system_admin_cleanup_rpc.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261015030000_system_admin_cleanup_rpc.sql) | 75 | `READ` | SQL database migration schema/RPC: 20261015030000_system_admin_cleanup_rpc |
| 194 | [`supabase/migrations/20261015040000_perf_optimization.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261015040000_perf_optimization.sql) | 417 | `READ` | SQL database migration schema/RPC: 20261015040000_perf_optimization |
| 195 | [`supabase/migrations/20261015070000_archived_cubs_system.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261015070000_archived_cubs_system.sql) | 225 | `READ` | SQL database migration schema/RPC: 20261015070000_archived_cubs_system |
| 196 | [`supabase/migrations/20261015090000_family_interactions_and_metadata.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261015090000_family_interactions_and_metadata.sql) | 109 | `READ` | SQL database migration schema/RPC: 20261015090000_family_interactions_and_metadata |
| 197 | [`supabase/migrations/20261015141820_fix_upsert_synced_cubs_null_date.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261015141820_fix_upsert_synced_cubs_null_date.sql) | 74 | `READ` | SQL database migration schema/RPC: 20261015141820_fix_upsert_synced_cubs_null_date |
| 198 | [`supabase/migrations/20261016102000_backfill_family_arrays.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261016102000_backfill_family_arrays.sql) | 28 | `READ` | SQL database migration schema/RPC: 20261016102000_backfill_family_arrays |
| 199 | [`supabase/migrations/20261021060000_reports_daily_flag_snapshots.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261021060000_reports_daily_flag_snapshots.sql) | 125 | `READ` | SQL database migration schema/RPC: 20261021060000_reports_daily_flag_snapshots |
| 200 | [`supabase/migrations/20261021060001_reports_rpcs.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261021060001_reports_rpcs.sql) | 922 | `READ` | SQL database migration schema/RPC: 20261021060001_reports_rpcs |
| 201 | [`supabase/migrations/20261021070000_call_parents_flags_report.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261021070000_call_parents_flags_report.sql) | 180 | `READ` | SQL database migration schema/RPC: 20261021070000_call_parents_flags_report |
| 202 | [`supabase/migrations/20261021080000_reading_circle_weekly_report.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261021080000_reading_circle_weekly_report.sql) | 180 | `READ` | SQL database migration schema/RPC: 20261021080000_reading_circle_weekly_report |
| 203 | [`supabase/migrations/20261021090000_perf_security_report_optimizations.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261021090000_perf_security_report_optimizations.sql) | 588 | `READ` | SQL database migration schema/RPC: 20261021090000_perf_security_report_optimizations |
| 204 | [`supabase/migrations/20261022050000_reports_cleanup_and_gen_comm_focus.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261022050000_reports_cleanup_and_gen_comm_focus.sql) | 489 | `READ` | SQL database migration schema/RPC: 20261022050000_reports_cleanup_and_gen_comm_focus |
| 205 | [`supabase/migrations/20261022070000_perf_accuracy_optimizations.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261022070000_perf_accuracy_optimizations.sql) | 478 | `READ` | SQL database migration schema/RPC: 20261022070000_perf_accuracy_optimizations |
| 206 | [`supabase/migrations/20261022101000_fix_upsert_synced_cubs_scores_date_type.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261022101000_fix_upsert_synced_cubs_scores_date_type.sql) | 29 | `READ` | SQL database migration schema/RPC: 20261022101000_fix_upsert_synced_cubs_scores_date_type |
| 207 | [`supabase/migrations/20261022130000_add_cum_term_points.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261022130000_add_cum_term_points.sql) | 106 | `READ` | SQL database migration schema/RPC: 20261022130000_add_cum_term_points |
| 208 | [`supabase/migrations/20261022180000_add_language_and_alternative_contact.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261022180000_add_language_and_alternative_contact.sql) | 81 | `READ` | SQL database migration schema/RPC: 20261022180000_add_language_and_alternative_contact |
| 209 | [`supabase/migrations/20261022190000_sanitize_placeholder_emails.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261022190000_sanitize_placeholder_emails.sql) | 14 | `READ` | SQL database migration schema/RPC: 20261022190000_sanitize_placeholder_emails |
| 210 | [`supabase/migrations/20261022200000_contact_edit_approvals.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261022200000_contact_edit_approvals.sql) | 74 | `READ` | SQL database migration schema/RPC: 20261022200000_contact_edit_approvals |
| 211 | [`supabase/migrations/20261026124000_daily_activity_interactions_date_range.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261026124000_daily_activity_interactions_date_range.sql) | 75 | `READ` | SQL database migration schema/RPC: 20261026124000_daily_activity_interactions_date_range |
| 212 | [`supabase/migrations/20261026130000_daily_activity_interactions_purpose_filter.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261026130000_daily_activity_interactions_purpose_filter.sql) | 162 | `READ` | SQL database migration schema/RPC: 20261026130000_daily_activity_interactions_purpose_filter |
| 213 | [`supabase/migrations/20261029000001_add_viewer_role_and_plain_password.sql`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/migrations/20261029000001_add_viewer_role_and_plain_password.sql) | 25 | `READ` | SQL database migration schema/RPC: 20261029000001_add_viewer_role_and_plain_password |
| 214 | [`test-sync.js`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/test-sync.js) | 26 | `READ` | Project configuration / root documentation |
| 215 | [`tsconfig.json`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/tsconfig.json) | 35 | `READ` | Project configuration / root documentation |
| 216 | [`tsconfig.tsbuildinfo`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/tsconfig.tsbuildinfo) | 0 | `SKIPPED (Generated/build/lock file)` | Project configuration / root documentation |
| 217 | [`vercel.json`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/vercel.json) | 10 | `READ` | Project configuration / root documentation |
