---
name: observability-error-tracking
description: Sets up or extends error tracking, structured logging, and alerting using Sentry and structured log practices. Use when setting up a new project's monitoring, adding logging to a new feature, or investigating a reported bug.
---

# Error Tracking & Logging

## When to load this
Setting up monitoring on a new project, adding a significant new feature (should it log anything?), or investigating a bug the founder reported.

## Procedure

1. **Sentry (or equivalent) wired client and server side**, with source maps enabled so stack traces point at real source, not minified output.
2. **Log with structure, not `console.log` scattered ad hoc.** Every log line should carry enough context to actually debug later — user ID, request ID, route — and never include secrets, tokens, or full personal-data payloads.
3. **Use log levels meaningfully:** `error` for things needing attention, `warn` for degraded-but-working, `info` for real business events (signup, payment, key state changes) — not everything at the same level, which trains everyone to ignore the log.
4. **Client-facing errors stay generic**; the real detail goes to the log/Sentry, not the response body (see `api-endpoint-design`).
5. **Alert on what matters**: payment failures, an auth failure spike, elevated 5xx rate — not everything, which causes alert fatigue.
6. **When investigating a reported bug**, find the root cause and check whether the same class of mistake exists elsewhere in the codebase — fix the pattern, not just the one instance, if it's systemic.

## Pitfalls
- Logging a full request body or user object that happens to contain a password, token, or sensitive personal data.
- Alerting on every error equally, so real incidents get lost in noise.
- Returning a raw exception message to the client "to help debugging" — that's an information leak (see `security-hardening-review`).
