---
name: scaling-performance
description: Diagnoses and designs for load, throughput, and performance bottlenecks in a Next.js + Supabase app, including background jobs and database scaling limits. Use when anticipating a traffic spike, when something is slow, or when designing a feature that will see heavy write or read volume.
---

# Load Balancing & Scaling

## When to load this
Before a known traffic spike (launch, campaign), when something is measurably slow, or when a new feature will see meaningful read/write volume.

## What's already handled for you
Vercel's compute layer (Fluid compute) automatically load-balances and scales instances, with cross-zone/region failover — this generally does not need manual tuning at the traffic levels these apps see. The job is to write code that scales *within* that model, and to know where the real ceilings are.

## Procedure — diagnose in this order (roughly the order these actually bite in practice)

1. **Connection pool exhaustion.** Confirm serverless code uses the Supabase pooler (Supavisor, transaction mode), never the direct connection string. This is the single most common cause of "worked in dev, died under real traffic."
2. **N+1 queries and missing indexes.** Look for loops that issue one query per item instead of a single batched query; add indexes on anything filtered, joined, or sorted on at real volume.
3. **RLS policy cost.** A policy re-evaluating an auth check per row instead of once per statement is a common hidden bottleneck — see `database-schema-design` for the fix.
4. **Module-level shared state.** Because Fluid compute can serve multiple concurrent requests from one instance, any module-level singleton (a cache, a connection pool object) must be safe to share across concurrent requests — not assume one-request-per-instance.
5. **Move slow work out of the request path.** Anything taking more than a couple seconds (bulk email, report generation, image processing, large syncs) belongs in a background job (Supabase Edge Function, a queue like Upstash QStash, or a cron-triggered handler), not inline in a user-facing request.
6. **Know the real ceiling.** Postgres read scaling has headroom (pooling, read replicas on paid tiers); write throughput on a single primary is the actual limit for a Supabase-based app, with no managed multi-region write/sharding option. Don't promise unlimited scale — for the traffic levels most of these apps will see this isn't a near-term concern, but say so honestly rather than overstating it.
7. **Load test before a known spike**, don't discover the ceiling live during a launch.

## Pitfalls
- Reaching for more infrastructure (queues, caches, replicas) before checking for the boring, common causes above (pooling, indexes, N+1).
- Assuming Vercel's automatic scaling means the database scales too — it doesn't, independently.
