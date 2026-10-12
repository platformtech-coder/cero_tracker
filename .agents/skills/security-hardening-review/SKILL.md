---
name: security-hardening-review
description: A checklist-driven review to run before shipping anything touching payments, personal data, admin actions, or authentication. Use before any production deploy of a security-sensitive feature, not just when explicitly asked to "check security."
---

# Security Hardening Review

## When to load this
Before shipping: payment flows, anything touching personal/identifying data, admin-only actions, auth changes, file uploads, or anything the founder would be upset to see exploited.

## Checklist

- [ ] Every input is validated server-side, not just client-side (see `api-endpoint-design`).
- [ ] Every mutation checks auth + permission server-side, not just via hidden UI (see `auth-permissions-setup`).
- [ ] RLS is enabled and tested on every table involved (see `database-schema-design`).
- [ ] No secrets in the client bundle — grep for the service role key, third-party secret keys, and anything that shouldn't be `NEXT_PUBLIC_*`.
- [ ] No raw SQL built from string concatenation of user input — use the Supabase client / parameterized queries only.
- [ ] Rate limiting is in place on auth endpoints and any endpoint that costs money per call (see `rate-limiting-setup`).
- [ ] File uploads are validated server-side for type and size, and stored in a bucket with correct storage policies — never a public bucket for user-specific files.
- [ ] Webhooks verify their signature before trusting the payload (see `third-party-integration`).
- [ ] Error responses to the client contain no stack traces, raw DB errors, or internal IDs.
- [ ] Nothing sensitive is logged in plaintext (tokens, passwords, full payment details) — see `observability-error-tracking`.
- [ ] If this change affects who can see or do what, it was explicitly confirmed with the founder in plain language first.

## How to use this
Walk the checklist top to bottom against the actual diff being shipped. Anything unchecked either gets fixed or gets explicitly called out to the founder as a known gap and why it's acceptable for now — never silently ship a gap.
