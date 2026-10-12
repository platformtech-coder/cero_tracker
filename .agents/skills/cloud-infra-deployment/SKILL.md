---
name: cloud-infra-deployment
description: Handles environment and deployment configuration for Vercel and Supabase, including environment variables, project setup, and separating staging from production. Use when setting up a new project, a new environment, or changing deployment/env-var configuration.
---

# Cloud Infrastructure & Deployment

## When to load this
Setting up a new project, adding a new environment, changing environment variables, or any deployment-config change.

## Procedure

1. **Three environments, always:** local (Supabase CLI local dev), staging/preview (Vercel Preview Deployments), production. Prefer a genuinely separate Supabase project for staging over a "staging flag" in the same production project — a bad staging migration should never be able to touch real user data.
2. **Config lives in the repo where possible** (`vercel.json`, `.env.example` documenting required variables without real values) rather than only in a dashboard, so environments are reproducible and reviewable.
3. **Environment variables:** confirm which are server-only secrets vs. genuinely safe to expose as `NEXT_PUBLIC_*` before adding a new one — default to server-only unless there's a specific reason it must reach the client.
4. **Region alignment:** deploy compute close to where the Supabase database lives — a region mismatch silently adds latency to every single query.
5. **Serverless connections:** confirm any new database client points at the Supabase connection pooler (Supavisor, transaction mode), never the direct connection string — see `scaling-performance` for why this matters.
6. **Don't add new infrastructure services speculatively.** The default stack (Vercel + Supabase + Upstash + Sentry) covers the large majority of needs — adding a new piece of infrastructure needs a concrete, current reason, not "might need it later."

## Pitfalls
- One Supabase project shared between staging and production.
- A new secret added to `NEXT_PUBLIC_*` "to make it easier to access on the client" without checking whether it actually needs to be public.
- Compute and database deployed in different regions with no reason.
