---
name: feature-architecture-planning
description: Breaks down a plain-language feature or app request into a concrete technical architecture before any code is written. Use for any new feature of real size, a new app, or a request that is vague about how it should work under the hood — not for small copy/style tweaks.
---

# Feature Architecture Planning

## When to load this
Any request like "add X," "build an app that does Y," or "let users do Z" where the founder described the *outcome*, not the mechanism. Load this **before** touching code, as part of the CLARIFY/SPEC steps in AGENTS.md §1.

## Procedure

1. **Restate the request as a user story**, one sentence: who does what, and why. If this can't be written in one sentence, the request is probably two features — split it.
2. **Draw the data model first.** What entities does this need? What already exists that this should attach to, versus what's genuinely new? A wrong data model here is the most expensive mistake to fix later.
3. **Draw the permission boundary.** Who can trigger this, who can see the result, who can undo it. If the answer is "anyone," say that explicitly — it's a decision, not a default.
4. **List every state the UI needs**: empty, loading, success, error, and (if relevant) partial/in-progress. A feature spec that only describes the happy path is incomplete.
5. **Identify what's reversible and what isn't.** Anything irreversible (sending an email, charging a card, deleting data) gets flagged and confirmed explicitly with the founder before building.
6. **Check for an existing pattern.** Search the codebase for a similar feature already built (a similar table, a similar form, a similar service module) and follow its shape rather than inventing a new pattern for no reason. Consistency compounds; novelty has a cost.
7. **Decide scale posture.** Will this see meaningful traffic soon, or is it low-volume for the foreseeable future? This determines whether to reach for `scaling-performance` now or later — don't over-build for traffic that isn't coming, but don't paint into a corner either (AGENTS.md §4).
8. **Write the plan back in plain language** before building: what's being added, what it touches, what the founder should test. This is the artifact the founder actually reads — the code is just the implementation of it.

## Pitfalls
- Building the literal narrow request when the obvious real need is broader (e.g., "add a delete button" without asking whether deletes should be soft or permanent, and who's allowed to do it).
- Skipping this step because the request "sounds simple" — simple-sounding requests are exactly where unstated assumptions cause the most rework.
- Designing the data model around today's UI instead of the underlying real-world entities — UIs change far more often than the concepts they represent.
