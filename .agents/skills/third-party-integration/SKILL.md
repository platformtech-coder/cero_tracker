---
name: third-party-integration
description: Adds a new external service, SDK, or webhook integration (payments, email, SMS, AI APIs, etc.) with a proper wrapper, secret handling, and failure behavior. Use whenever a task requires calling an external API or receiving a webhook.
---

# Third-Party Integration

## When to load this
Adding any new external service — payment processor, email/SMS provider, AI API, analytics, or receiving a webhook from one.

## Procedure

1. **Confirm the service choice and cost with the founder first** if it's paid or if there's a reasonable existing alternative already in the stack — this is a recurring cost and operational dependency, not just a code change.
2. **Build a thin wrapper module in `lib/integrations/<service>.ts`.** The rest of the app calls the wrapper, never the vendor SDK directly — this means swapping providers later touches one file.
3. **Secrets follow standard rules:** server-side only, in environment variables, never in `NEXT_PUBLIC_*` unless the provider explicitly designed that specific key to be public (e.g., a Stripe *publishable* key).
4. **For outbound calls:** define what happens on timeout/failure explicitly — retry with backoff, queue for later, or surface a clear error to the user. Never let a third-party outage silently crash the whole request or fail without a trace.
5. **For inbound webhooks:**
   - Verify the signature the provider gives before trusting the payload — treat an unverified webhook as a potential attack.
   - Make the handler idempotent — webhooks get retried by design; running the same event twice must not double-charge, double-send, or double-create anything (a unique constraint on the event ID is the usual fix).
   - Respond quickly and do slow follow-up work asynchronously if needed, rather than making the provider's retry logic trigger from a slow handler.
6. **Rate-limit and validate webhook endpoints** like any other public endpoint (see `rate-limiting-setup`, `api-endpoint-design`).

## Pitfalls
- Calling the vendor SDK directly from multiple places in the app instead of through one wrapper.
- Trusting a webhook payload without verifying its signature.
- A webhook handler that isn't safe to run twice on the same event.
