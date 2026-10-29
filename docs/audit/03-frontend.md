# CERO Tracker — Phase 2: Frontend Audit

**Auditor:** Principal Software Architect & Performance Engineer  
**Scope:** Client Components, State Management, Render Lifecycles, Bundle Size, UI/UX & Client Security  
**Repository:** `cero-tracker`  
**Date:** 2026-10-29  

---

## 1. Executive Frontend Assessment

The frontend is built on Next.js 16.4.2 and React 19.3.0 using the App Router. The UI relies on Vanilla CSS Modules and Lucide React icons. However, the application exhibits several critical frontend performance, architectural, and bundle optimization issues:
1. **Pervasive Unvirtualized In-Memory Tables:** Large datasets (Directory Cubs & Families, Reports, Reading Circle rosters) are shipped in full to the client and rendered without DOM virtualization.
2. **Phantom Dependencies & Bundle Bloat:** Major state and table libraries (`@tanstack/react-table`, `@hookform/resolvers`, `react-hook-form`, `clsx`, `@upstash/ratelimit`) are included in `package.json` but never imported, while `@tanstack/react-query` is mounted globally without a single query consumer.
3. **Monolithic Client Files:** Multiple client views exceed 1,000 to 3,300 lines of code, preventing effective route-level code-splitting.
4. **Client-Side Secrets Exposure Risk:** The entire `Profile` row including sensitive admin-configured fields (`plain_password`) is serialized into RSC payloads and transmitted to the browser.

---

## 2. Component Structure, Reuse & Duplication

### Near-Identical Drawer Modals & Form Logic
The application features several slide-out drawers in `src/components/drawers/` and `src/components/ui/`:
- [`src/components/drawers/AssignRCSelectionDrawer.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/drawers/AssignRCSelectionDrawer.tsx)
- [`src/components/drawers/RCChangeSessionDrawer.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/drawers/RCChangeSessionDrawer.tsx)
- [`src/components/drawers/OrientationJourneyDrawer.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/drawers/OrientationJourneyDrawer.tsx)
- [`src/components/drawers/ProcessPendingDrawer.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/drawers/ProcessPendingDrawer.tsx)

**Code Duplication Pattern:**
1. **Session & Stage Dropdown Builders:** [AssignRCSelectionDrawer.tsx:L45-L78](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/drawers/AssignRCSelectionDrawer.tsx#L45-L78) and [RCChangeSessionDrawer.tsx:L38-L69](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/drawers/RCChangeSessionDrawer.tsx#L38-L69) duplicate identical session categorization (Lower vs Upper primary grade mapping) and state setters.
2. **Contact Sanitization Logic:** Phone normalization and formatting logic is copy-pasted across [CubProfileDrawer.tsx:L120-L150](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/drawers/CubProfileDrawer.tsx#L120-L150) and [DirectoryClient.tsx:L180-L210](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/directory/DirectoryClient.tsx#L180-L210) rather than strictly importing `sanitizePhone` from [`src/lib/utils/contact.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/utils/contact.ts#L1-L35).
3. **Table Pagination Controls:** Exact copy-pasted pagination rendering appears across [DirectoryClient.tsx:L38-L56](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/directory/DirectoryClient.tsx#L38-L56), [EngagementsClient.tsx:L45-L65](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/engagements/EngagementsClient.tsx#L45-L65), and [ReadingCircleClient.tsx:L40-L60](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/reading-circle/ReadingCircleClient.tsx#L40-L60) with identical HTML structures and inline math.

---

## 3. State Management & Data Lifecycle

### Global vs Local State Evaluation
- **Zustand Usage:** Global state is limited to a single store [`src/lib/store.ts`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/lib/store.ts#L1-L56) controlling the Log Interaction drawer visibility (`useInteractionStore`).
- **Over-Reliance on Giant `useState` Trees:** In components like [`SystemAdminClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/system-admin/SystemAdminClient.tsx#L3-L38) and [`ReportsClient.tsx`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/reports/ReportsClient.tsx#L3-L40), over 35 distinct `useState` hooks are declared at the root of the component.
- **Stale Data Risks:** Client components store server-fetched data in local state (`useState(initialCubs)`). When a background sync runs or another user logs an interaction, the client view remains stale until a manual page refresh or route change occurs.

---

## 4. Rendering Performance & DOM Bottlenecks

### 1. Large Unvirtualized Lists & Heavy Render Trees
- **Location:** [`DirectoryClient.tsx:L350-L580`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/directory/DirectoryClient.tsx#L350-L580)
- **Evidence:** When browsing the Cubs or Families directory, the component sorts and filters arrays of several thousand records in memory on every keystroke in the search bar.
- **Impact:** Frame drops and keystroke lag during search typing on mid-tier hardware.
- **Fix:** Introduce virtual scrolling (or server-side pagination with debounced query parameters) and wrap multi-field search filtering in `useTransition` or `useDeferredValue`.

### 2. Monolithic Skeleton Component (`Skeleton.tsx`)
- **Location:** [`src/components/ui/Skeleton.tsx:L1-L1204`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/ui/Skeleton.tsx#L1-L1204)
- **Evidence:** 1,204 lines containing over 20 separate layout-specific skeleton mockups. All of these mockups are compiled into a single shared file imported widely across the app shell.
- **Impact:** Increases bundle footprint for pages that only need one small skeleton card.
- **Fix:** Split into atomic skeleton components alongside their respective domain views (e.g. `DirectorySkeleton.tsx`, `ReportsSkeleton.tsx`).

---

## 5. Bundle & Dependency Health Analysis

```
Package Manifest Dependencies Breakdown:
Total dependencies in package.json: 21
Actively used in production code: 14
Unused / Dead weight: 7 (33.3% of dependencies!)
```

| Unused Dependency | Size Impact in node_modules | Reason for Removal |
| :--- | :--- | :--- |
| `@hookform/resolvers` | ~250 KB | 0 imports. Form validation uses raw `useState` and manual validation. |
| `react-hook-form` | ~450 KB | 0 imports. Forms are constructed using uncontrolled inputs or native `useState`. |
| `@tanstack/react-table` | ~800 KB | 0 imports. Tables use manual `<table>` and custom `useTableSort` hook. |
| `@upstash/ratelimit` | ~180 KB | 0 imports. Endpoints have no Redis rate limiting configured. |
| `@upstash/redis` | ~220 KB | 0 imports. Redis client is never initialized in application code. |
| `clsx` | ~15 KB | 0 imports. Template literals (`${a} ${b}`) are used throughout. |
| `@tanstack/react-query` | ~1.2 MB | Mounted in `providers.tsx` ([L3-L12](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/providers.tsx#L3-L12)), but 0 queries/mutations exist in the app! |

---

## 6. Client-Side Security & Data Exposure

### Sensitive Fields in React Server Component Payload
- **Location:** [`src/app/(auth)/settings/page.tsx:L19-L50`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/settings/page.tsx#L19-L50)
- **Evidence:**
  ```tsx
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  // ...
  return <SettingsClient profile={profile as Profile} profiles={profiles} ... />;
  ```
- **Impact:** The wildcard `select('*')` pulls all columns from `public.profiles`, which includes the newly introduced `plain_password` column. This sensitive plain password is serialized into the HTML page source and client hydration JSON payload, viewable by anyone inspecting the browser network tab or page source.
- **Fix:** Restrict the query to an explicit projection: `.select('id, full_name, role, sheet_rep_name, email')`. Never select `plain_password` or `*`.

---

## 7. Frontend Findings & Recommendations

[FE-01] Dead Weight Dependencies in Production Manifest | Severity: Medium | Effort: S  
Location: [`package.json:L12-L31`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/package.json#L12-L31)  
Evidence: `@tanstack/react-table`, `react-hook-form`, `@hookform/resolvers`, `@upstash/ratelimit`, `@upstash/redis`, and `clsx` have zero imports across the entire repository.  
Impact: Bloats dependency tree, increases install times, and exposes the project to unused supply chain vulnerabilities.  
Fix: Remove unused packages via `npm uninstall` and prune `providers.tsx` of unused QueryClientProvider.

[FE-02] Monolithic 1,204-Line Skeleton Loader File | Severity: Low | Effort: S  
Location: [`src/components/ui/Skeleton.tsx:L1-L1204`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/components/ui/Skeleton.tsx#L1-L1204)  
Evidence: All application skeleton mockups are accumulated in a single file with dozens of icon imports.  
Impact: Heavy initial parsing overhead and unnecessary coupling of UI loading states.  
Fix: Decompose into modular skeleton components located next to their respective pages.

[FE-03] Client-Side Data Ingestion Without Virtualization | Severity: High | Effort: M  
Location: [`src/app/(auth)/directory/DirectoryClient.tsx:L36-L75`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/directory/DirectoryClient.tsx#L36-L75)  
Evidence: Thousands of records loaded into client state and rendered via standard HTML `<tr>` elements with in-memory filtering.  
Impact: High memory consumption on low-end client machines; UI thread blocking during rapid filter manipulation.  
Fix: Implement windowed rendering with dynamic DOM node recycling or server-paginated data fetching.

[FE-04] Duplicated Pagination and Drawer Sub-Components | Severity: Low | Effort: S  
Location: [`src/app/(auth)/directory/DirectoryClient.tsx:L38-L56`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/directory/DirectoryClient.tsx#L38-L56), [`src/app/(auth)/engagements/EngagementsClient.tsx:L45-L65`](file:///c:/Users/Kay_Expert/Desktop/Kay_Xpert/Work/Perbicubs/Apps/cero-tracker/src/app/(auth)/engagements/EngagementsClient.tsx#L45-L65)  
Evidence: Identical `Pagination` and `SubStatusBadge` components copy-pasted across 3 separate client route files.  
Impact: Violation of DRY principle; changes to pagination styling or accessibility tags require editing multiple files.  
Fix: Extract into canonical `src/components/ui/Pagination.tsx` and `src/components/ui/StatusBadge.tsx`.
