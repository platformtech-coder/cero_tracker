---
name: auth-permissions-setup
description: Implements login/signup flows, protected routes, role-based access, and session handling using Supabase Auth in Next.js. Use for any task involving authentication, authorization, protected pages, or "who can see/do this."
---

# Auth & Permissions Setup (Supabase Auth + Next.js)

## When to load this
Any login/signup flow, any route or action that should be restricted to certain users, any feature involving roles (admin, member, owner, etc.).

## The three required layers (see AGENTS.md §3 for why all three are mandatory)

1. **`proxy.ts`** (Next.js 16 — this replaced `middleware.ts`; the exported function is `proxy()`, not `middleware()`). Its job is narrow: refresh the session cookie every request, redirect unauthenticated users off protected routes, redirect authenticated users off auth pages. It must return the Supabase helper's response object unmodified (don't construct a fresh `NextResponse.next()`) or session refresh cookies get dropped.
2. **Server Action / Route Handler checks.** Every mutation independently verifies: is there a user, and is this specific user allowed to do this specific thing. Never assume the proxy already handled it — Server Actions can be invoked directly, bypassing page routing.
3. **RLS policies** on every table the action touches (see `database-schema-design`) — the backstop if the first two layers have a bug.

## Procedure

1. Confirm which of three shapes this is: public, "any logged-in user," or role-restricted. Ask the founder if it's not obvious from the request.
2. For role-restricted features, check (or create) the `memberships`/`roles` table — don't hardcode role checks against email addresses or scattered booleans.
3. Implement the `proxy.ts` redirect rule for the new route if it's a page that should be gated.
4. Implement the Server Action/Route Handler check — fetch the current user, look up their role/permission, reject before doing anything else in the function body.
5. Add or update the RLS policy so the database enforces the same rule independently.
6. Test as three different users: unauthenticated, authenticated-but-unauthorized, authenticated-and-authorized. All three paths must behave correctly, not just the success path.

## Pitfalls
- The Supabase **service role key** bypasses RLS entirely — server-side only, never in `NEXT_PUBLIC_*`, reserved for genuinely privileged admin/background operations.
- Serving a personalized/authenticated response through a shared cache (ISR, CDN, `"use cache"` without `private`) can leak one user's session/cookie into another user's response — see `caching-cdn-strategy`. Anything behind auth is dynamic or `"use cache: private"`, never shared.
- Checking permission in the UI only ("we hide the button") without a matching server-side check — hidden buttons don't stop direct requests.
