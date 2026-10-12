---
name: api-endpoint-design
description: Designs Next.js Server Actions and Route Handlers, including input validation, error shape, and business logic layering. Use when adding any new mutation, form submission, or backend endpoint.
---

# API & Backend Logic Design

## When to load this
Any new Server Action, Route Handler, or public API endpoint.

## Procedure

1. **Choose the right primitive:**
   - Server Action → form/mutation triggered from within the app's own UI.
   - Route Handler → anything that must be a real HTTP endpoint (webhooks, third-party callbacks, a public API, non-Next.js clients).
2. **Validate at the boundary.** Define a Zod schema for the input and `parse()` it before touching the payload — never trust client-sent data, including data the UI already validates.
3. **Keep the handler thin.** Order: auth check (see `auth-permissions-setup`) → validate input → call a function in `lib/services/` → shape the response. Business logic lives in the service function, not inline in the handler, so it's reusable and testable.
4. **Use a consistent error shape** across the whole app (e.g., `{ error: { code, message } }`) so the frontend handles failures predictably.
5. **Never leak internals in the response** — no stack traces, raw DB errors, or internal IDs to the client. Log the real detail server-side (see `observability-error-tracking`); return a safe generic message.
6. **Idempotency for anything that mutates**, especially if it could be double-submitted (double-click, retried request, retried webhook) — a unique constraint or an idempotency key, not "the UI disables the button."
7. **Rate-limit anything public, auth-related, or expensive** — see `rate-limiting-setup` before considering the endpoint done.

## Pitfalls
- Trusting a value from the client because "the form already requires it."
- Putting business logic directly in a Route Handler, making it impossible to reuse from a background job or another entry point later.
- Returning a raw database or third-party error message straight to the client.
