---
name: rate-limiting-setup
description: Adds rate limiting to a Next.js endpoint using Upstash Redis. Use for any new public endpoint, authentication endpoint, or endpoint that calls a paid third-party API.
---

# Rate Limiting Setup

## When to load this
Any new public-facing endpoint, any auth endpoint (login, signup, password reset, magic link), any endpoint that triggers a cost (AI calls, email sends, SMS, other paid API calls).

## Procedure

1. **Pick the identifier**: IP address for anonymous/public endpoints, user ID for authenticated ones — user ID is harder to spoof and fairer once someone's logged in.
2. **Pick the tier based on sensitivity**, don't reuse one global limit for everything:
   - General public traffic: generous (e.g., 100 req/min per IP).
   - Authenticated API usage: moderate, per-user.
   - Auth endpoints specifically: tight (e.g., 5 attempts / 15 min per IP) — this is the tier that actually stops credential stuffing and signup abuse.
   - Paid/expensive calls: tight, per-user, sized to the actual cost budget.
3. **Implement with `@upstash/ratelimit` + Upstash Redis**, enforced as early as possible — in `proxy.ts` for broad protection, or at the top of the specific Route Handler/Server Action for endpoint-specific limits — so abusive traffic never reaches business logic or the database.
4. **Use the sliding window algorithm** by default (smoother than fixed window, avoids burst-at-boundary abuse); token bucket if bursty-but-bounded traffic is expected and acceptable.
5. **Return a real `429`** with `Retry-After` and rate-limit headers, not a silent failure or a generic 500 — so both real clients and the founder debugging can see what happened.
6. **Confirm the limit against a realistic legitimate-use estimate** before shipping — too tight breaks real users, too loose doesn't protect anything.

## Pitfalls
- One global rate limit applied everywhere instead of tiered by endpoint sensitivity.
- Rate limiting implemented but not actually placed in front of the expensive work it's meant to protect (e.g., limiting the route but not the underlying paid API call it triggers).
- Treating rate limiting as sufficient defense on its own — it pairs with auth checks and RLS (see `security-hardening-review`), it doesn't replace them.
