# CERO Tracker — Phase 5: Code Quality & Cleanup Manifest

**Auditor:** Principal Software Architect & Performance Engineer  
**Scope:** Dead Code, Unused Imports, Duplication, Comments, Cyclomatic Complexity, Type Safety & Leftovers  
**Repository:** `cero-tracker`  
**Date:** 2026-10-29  

---

## 1. Dead Dependencies in Package Manifest

Every item listed below has been verified by full-codebase pattern search, string-based dynamic import inspection, and build evaluation.

| Package | Manifest Version | Dynamic Usage Ruled Out By | Confidence | Safety / Removal Risk |
| :--- | :--- | :--- | :--- | :--- |
| `@hookform/resolvers` | ^5.9.1 | Grepped all `src/`, `scripts/`, `scratch/`. Zero imports or string references. | **HIGH** | **SAFE** (Zero behavior change) |
| `react-hook-form` | ^7.89.0 | Grepped all source files. No `useForm` or form hooks. All forms use `useState`. | **HIGH** | **SAFE** (Zero behavior change) |
| `@tanstack/react-table` | ^9.2.6 | Grepped all source files. Tables constructed with native `<table>` and `useTableSort`. | **HIGH** | **SAFE** (Zero behavior change) |
| `@upstash/ratelimit` | ^2.2.0 | Grepped all source files. Endpoints contain zero rate-limiting logic. | **HIGH** | **SAFE** (Zero behavior change) |
| `@upstash/redis` | ^1.39.0 | Grepped all source files. Redis connection is never initialized. | **HIGH** | **SAFE** (Zero behavior change) |
| `clsx` | ^2.1.1 | Grepped all source files. Zero imports. Template literals used for classes. | **HIGH** | **SAFE** (Zero behavior change) |
| `@tanstack/react-query` | ^5.104.1 | Mounted in [`src/app/providers.tsx:L3`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/providers.tsx#L3). Grepped for `useQuery`, `useMutation`. Zero consumer hooks found. | **HIGH** | **SAFE** (Remove provider and package) |

---

## 2. Dead Code & Unused Exports

- [ ] **[DEAD-01] Unused QueryClientProvider in App Shell**
  - **Location:** [`src/app/providers.tsx:L3-L12`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/providers.tsx#L3-L12)
  - **Evidence:** Instantiates `new QueryClient()` and wraps children in `QueryClientProvider`. No component in the entire tree invokes React Query.
  - **Confidence:** HIGH. Dynamic usage ruled out via search for `useQueryClient`, `useQuery`, `useMutation`.
  - **Risk:** Zero risk. Pruning removes React Query context overhead from the React tree.

- [ ] **[DEAD-02] Deprecated Type Aliases in Reports Module**
  - **Location:** [`src/lib/actions/reports.ts:L84-L85`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/reports.ts#L84-L85)
  - **Evidence:** `export type CoreParentSummaryRow = CallParentsSummaryRow;` and `export type CoreParentDetailRow = CallParentsFamilyDetailRow;` marked as deprecated compatibility aliases.
  - **Confidence:** HIGH. Grepped entire repo; neither alias is imported anywhere in the application.
  - **Risk:** Zero risk.

- [ ] **[DEAD-03] Unused MonitoredTable Type in System Admin Action**
  - **Location:** [`src/lib/actions/system-admin.ts:L48`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/system-admin.ts#L48)
  - **Evidence:** ESLint warning: `'MonitoredTable' is defined but never used.`
  - **Confidence:** HIGH. Unused TypeScript type definition.
  - **Risk:** Zero risk.

- [ ] **[DEAD-04] Abandoned Root Test Script**
  - **Location:** [`test-sync.js:L1-L26`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/test-sync.js#L1-L26)
  - **Evidence:** 26-line scratch script in repository root used for manual HTTP testing during early development.
  - **Confidence:** HIGH. Ignored by git in `.gitignore:L49`.
  - **Risk:** Safe to clean up.

---

## 3. Duplicated Code Patterns & Canonical Homes

| Duplicated Logic / Pattern | Locations Found | Canonical Home Proposal |
| :--- | :--- | :--- |
| **Google Service Account JWT Creation** | [`update-profile.ts:L41-L65`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/update-profile.ts#L41-L65)<br>[`sync-master-cubs/index.ts:L28-L71`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/supabase/functions/sync-master-cubs/index.ts#L28-L71) | Extract to `src/lib/utils/google-auth.ts` using the official `googleapis` client already installed. |
| **Pagination Bar UI** | [`DirectoryClient.tsx:L38-L56`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/directory/DirectoryClient.tsx#L38-L56)<br>[`EngagementsClient.tsx:L45-L65`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/engagements/EngagementsClient.tsx#L45-L65)<br>[`ReadingCircleClient.tsx:L40-L60`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/reading-circle/ReadingCircleClient.tsx#L40-L60) | Create single shared component: `src/components/ui/Pagination.tsx`. |
| **Subscription Status Badge** | [`DirectoryClient.tsx:L58-L67`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/directory/DirectoryClient.tsx#L58-L67)<br>[`EngagementsClient.tsx:L68-L77`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/engagements/EngagementsClient.tsx#L68-L77) | Create single shared component: `src/components/ui/StatusBadge.tsx`. |
| **Admin Context Multi-Auth Check** | [`edit-requests.ts:L15-L45`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/edit-requests.ts#L15-L45)<br>[`forms.ts:L37-L51`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/forms.ts#L37-L51) | Unify into `src/lib/auth/getAdminSession.ts` returning a standard typed session. |
| **Contact Phone Normalization** | [`contact.ts:L1-L35`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/utils/contact.ts#L1-L35)<br>[`webhooks/forms/route.ts:L25-L33`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/webhooks/forms/route.ts#L25-L33)<br>[`update-profile.ts:L8`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/update-profile.ts#L8) | Enforce [`src/lib/utils/contact.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/utils/contact.ts) as the sole canonical utility. |

---

## 4. Complexity & File Size Hotspots

### Files Over 400 Lines (Top 10)
| File | Total LOC | Primary Functional Roles | Decomposition Recommendation |
| :--- | :--- | :--- | :--- |
| [`src/app/system-admin/SystemAdminClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/system-admin/SystemAdminClient.tsx) | **3,337** | 8 administrative tabs, sync modal, DB clear tools | Split into `components/admin/tabs/*` |
| [`src/app/(auth)/reports/ReportsClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/reports/ReportsClient.tsx) | **2,162** | 6 distinct reports, CSV engines, date pickers | Split into `components/reports/*` |
| [`src/app/(auth)/orientation/OrientationClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/orientation/OrientationClient.tsx) | **1,964** | Funnel views, booking drawer, stage filters | Split into separate tab sub-components |
| [`src/app/(auth)/engagements/EngagementsClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/engagements/EngagementsClient.tsx) | **1,217** | Timeline, action boards, modals | Decompose board vs timeline into files |
| [`src/components/ui/Skeleton.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/ui/Skeleton.tsx) | **1,204** | 20+ specialized loading skeletons | Co-locate individual skeletons with pages |
| [`src/app/(auth)/directory/DirectoryClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/directory/DirectoryClient.tsx) | **1,125** | Cubs tab, Families tab, pagination | Separate `CubsTab.tsx` & `FamiliesTab.tsx` |
| [`src/app/(auth)/settings/SettingsClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/settings/SettingsClient.tsx) | **1,122** | User accounts, dropdowns, forms config | Split into dedicated settings tabs |
| [`src/app/(auth)/reading-circle/ReadingCircleClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/reading-circle/ReadingCircleClient.tsx) | **1,009** | Rosters, weekly attendance, session switches | Decompose into roster view & attendance view |
| [`src/components/drawers/CubProfileDrawer.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/drawers/CubProfileDrawer.tsx) | **915** | Profile overview, edit form, activity history | Split presentation card from edit request form |
| [`src/lib/actions/system-admin.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/system-admin.ts) | **870** | Purge queries, metrics, log parsers, sync state | Split into `admin-metrics.ts` & `admin-ops.ts` |

### Functions Over 50 Lines (79 Functions Identified)
Major examples requiring refactoring:
- `SystemAdminClient` ([SystemAdminClient.tsx:L80-L3330](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/system-admin/SystemAdminClient.tsx#L80-L3330)): ~3,250 lines!
- `ReportsClient` ([ReportsClient.tsx:L85-L2150](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/reports/ReportsClient.tsx#L85-L2150)): ~2,060 lines!
- `autoMatch` ([src/app/api/webhooks/forms/route.ts:L180-L265](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/webhooks/forms/route.ts#L180-L265)): 85 lines.
- `clearTable` ([src/lib/actions/system-admin.ts:L390-L468](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/system-admin.ts#L390-L468)): 78 lines.
- `searchCubs` ([src/lib/actions/engagements.ts:L115-L194](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/engagements.ts#L115-L194)): 79 lines.

---

## 5. Type Safety & `any` Usage (220 Identified Instances)

The codebase has 220 instances of explicit or implicit `any` types. This severely weakens TypeScript's static analysis guarantees and accounts for the majority of the 445 ESLint warnings.

**Key Hotspots:**
1. [`src/lib/actions/update-profile.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/update-profile.ts): 25 `any` casts when mapping Google Sheets responses and PostgREST payloads.
2. [`src/lib/actions/system-admin.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/system-admin.ts): 19 `any` casts on database results and metrics shapes.
3. [`src/lib/actions/reading-circle.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/reading-circle.ts): 13 `any` casts during attendance aggregation.
4. [`src/lib/types.ts:L255-L256`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/types.ts#L255-L256): Generic types declared as `Record<string, any>`.

---

## 6. Leftovers: Debugging Artifacts & Console Logs

- **177 `console.log` statements** reside in production code paths:
  - Example: [`src/lib/actions/directory.ts:L25`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/directory.ts#L25) logs rep filters.
  - Example: [`src/app/api/webhooks/forms/route.ts:L345`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/webhooks/forms/route.ts#L345) logs full webhook payloads into server logs.
  - Example: [`src/lib/actions/update-profile.ts:L150`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/update-profile.ts#L150) logs Google Sheet cell update responses.
- **Remediation:** Remove all debug `console.log` statements in Batch 1. Replace critical operational logs with a structured logger.

---

## 7. Comments Analysis: Remove vs Keep

### Remove-Candidates (Stale, Obvious, Commented-Out Code)
1. **Commented-out code blocks:**
   - Example: [`src/app/system-admin/SystemAdminClient.tsx:L124-L135`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/system-admin/SystemAdminClient.tsx#L124-L135) commented-out test handler functions.
   - Example: [`src/lib/actions/directory.ts:L83`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/directory.ts#L83) commented-out field mapping notes.
2. **Obvious / Redundant Comments:**
   - `// Count rows before delete` ([system-admin.ts:L405](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/system-admin.ts#L405)).
   - `// Get the user ID of the rep` ([engagements.ts:L46](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/actions/engagements.ts#L46)).

### Keep-Candidates (Documenting "Why" & Domain Constraints)
1. [`src/lib/supabase/proxy.ts:L30-L32`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/supabase/proxy.ts#L30-L32): Critical Next.js / Supabase SSR rule warning against writing logic between `createServerClient` and `auth.getUser()`.
2. [`src/app/api/webhooks/forms/route.ts:L80-L89`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/api/webhooks/forms/route.ts#L80-L89): JSDoc explaining the multi-factor fuzzy matching token algorithm and why the 80% threshold is mathematically required to prevent sibling cross-assignment.
3. [`src/lib/supabase/getProfile.ts:L23-L33`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/supabase/getProfile.ts#L23-L33): Explanation of React `cache()` per-request deduplication behavior.

---

## 8. Testing Coverage Audit

| Component / Layer | Unit Tests | Integration Tests | E2E Tests | Coverage Estimate |
| :--- | :--- | :--- | :--- | :--- |
| **Authentication & Proxy** | 0 | 0 | 0 | **0%** |
| **Server Actions (CRM Mutations)** | 0 | 0 | 0 | **0%** |
| **Fuzzy Matching Webhook** | 0 (Only manual scratch script) | 0 | 0 | **0%** |
| **Database Transactions & RPCs** | 0 | 0 | 0 | **0%** |
| **Client UI & Form Validation** | 0 | 0 | 0 | **0%** |
| **Total Repository Coverage** | **0%** | **0%** | **0%** | **0%** |

**Testing Gap Impact:**
Because zero automated tests exist, any refactor carries regression risks. Vitest and React Testing Library must be introduced in early remediation before touching complex business logic.
