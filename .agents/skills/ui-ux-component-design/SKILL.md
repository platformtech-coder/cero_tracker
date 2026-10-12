---
name: ui-ux-component-design
description: Designs new UI screens, components, and forms with proper states, mobile-first layout, and accessibility. Use for any new user-facing screen or component, not just when explicitly asked about design.
---

# UI/UX Component Design

## When to load this
Any new screen, form, or interactive component.

## Procedure

1. **Design all four states before writing markup:** loading, empty, error, populated. If any of these wasn't described in the request, decide it explicitly rather than leaving it to whatever the framework does by default.
2. **Mobile-first.** Build and check the narrow viewport first — most real users of a small app are on a phone, not a wide desktop monitor.
3. **Stream slow parts.** Wrap anything dependent on a slower fetch in `<Suspense>` so the page shell appears immediately and the slow part fills in — this matters more now that Next.js 16 caches nothing by default (see `caching-cdn-strategy`).
4. **Accessibility as a default:** semantic HTML elements (not `<div>` for everything clickable), labeled form fields, sufficient color contrast, and keyboard reachability for anything interactive. Cheap now, expensive to retrofit.
5. **Reuse design tokens** (spacing, color, type scale) already defined in the project rather than one-off values — check for an existing design system/theme file before inventing new values.
6. **Optimistic UI only where failure is rare and recoverable** (e.g., toggling a checkbox) — pair it with a visible rollback state for the failure case, never silently pretend an action succeeded.
7. **Confirm destructive actions** (delete, remove, cancel) with a real confirmation step, not a bare button — matches the "irreversible actions get confirmed" rule in AGENTS.md §17.

## Pitfalls
- Shipping only the populated/happy-path state and leaving loading/empty/error to accident.
- Building desktop-first and treating mobile as an afterthought.
- Introducing a new spacing/color value instead of using the existing token set, causing visual drift over time.
