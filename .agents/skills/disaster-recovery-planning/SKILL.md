---
name: disaster-recovery-planning
description: Confirms backup, recovery, and availability posture — RPO/RTO, Point-in-Time Recovery, and Storage backups. Use before a production launch, when handling anything hard to reverse, or when explicitly asked about backups/downtime/data loss risk.
---

# Availability & Disaster Recovery

## When to load this
Before a production launch, before any migration/action that's hard to reverse, or when the founder asks "what happens if X breaks / what if we lose data."

## Procedure

1. **State RPO/RTO in plain language** for the project: how much data could we afford to lose (Recovery Point Objective), how long could we afford to be down (Recovery Time Objective). For most early-stage apps: RPO of minutes-to-a-day, RTO of "restore from backup and redeploy" rather than zero-downtime failover — confirm this matches the founder's actual expectations, don't assume.
2. **Confirm Point-in-Time Recovery is actually enabled** on the Supabase project (it is not the default on lower tiers) — daily backups alone can mean losing up to a day of data.
3. **Remember Storage is separate.** Database backups do not include Supabase Storage (uploaded files). If the app stores anything critical as a file (receipts, contracts, user photos that matter), it needs its own backup/replication plan.
4. **Test a restore, don't just assume the backup works.** A backup that's never been restored from is not a verified backup.
5. **Add a basic health-check endpoint** and note where to check Vercel/Supabase status during an incident, so an outage is diagnosed in minutes rather than discovered from user complaints.
6. **Design for graceful degradation** where realistic — if a non-critical third-party service is down, the core app should keep working rather than hard-failing everywhere.
7. **Write down the runbook** for foreseeable failure modes (DB connection exhaustion, bad deploy, third-party outage) — a few lines each, so a response isn't improvised under pressure.

## Pitfalls
- Assuming daily backups are enough without checking whether Point-in-Time Recovery is actually turned on for this specific project.
- Treating uploaded files as covered by "the database backup."
- No plan at all beyond "Supabase probably handles it" — confirm, don't assume.
