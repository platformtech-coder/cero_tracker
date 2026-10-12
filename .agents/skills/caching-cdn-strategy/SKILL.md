---
name: caching-cdn-strategy
description: Decides and implements caching behavior for a Next.js 16 route or data fetch, including the "use cache" directive, revalidation, and CDN delivery. Use for any new data-fetching route, a page reported as slow, or any change to what gets cached.
---

# Caching & CDN Strategy (Next.js 16)

## Critical context
Next.js 16 removed implicit caching. **Nothing is cached by default** — every request runs dynamically unless explicitly opted in. This is a reversal from earlier Next.js versions; don't rely on older training/tutorials that assume automatic caching.

## Procedure

1. **Classify the content first:**
   - **Public/static** (marketing pages, blog posts, anything identical for every visitor): safe to cache.
   - **Personalized/session-bound** (dashboards, anything behind auth, anything reflecting one user's data): never shared cache.
2. **For public/static content:** opt in explicitly — wrap the data-fetching function with `"use cache"` and a `cacheLife` profile matched to how often it actually changes, or use `fetch(url, { next: { revalidate: N } })`. This gets served from the CDN with no server round-trip.
3. **For personalized content:** use `"use cache: private"` if any caching is needed at all, or leave the route dynamic (`cache: "no-store"`). This is not optional — a session cookie or personal data captured in a shared cache response can be served to a *different* user (see `auth-permissions-setup`).
4. **Tag caches you'll need to invalidate on demand:** `fetch(url, { next: { tags: ["posts"] } })`, then call `revalidateTag("posts")` from the mutation that changes the underlying data — precise invalidation beats waiting out a TTL.
5. **Images** always go through `next/image`, never a raw `<img>` for user-facing content, for automatic CDN-backed optimization.
6. **If a page "feels slow,"** diagnose before reaching for caching: is it actually an uncached fetch that should be cached, or is it fetching too much / not streaming? Wrap slow, non-critical parts in `<Suspense>` so the page shell renders immediately rather than blocking on everything.

## Pitfalls
- Assuming a fetch is cached because "that's how Next.js works" — verify against the actual opted-in directive, don't assume.
- Applying a shared cache to any route that reads `cookies()`/the current user — this is the specific failure mode that leaks data between users.
- Caching data that's supposed to be real-time (cart contents, live counts) just because a page felt slow — fix the real cause instead.
