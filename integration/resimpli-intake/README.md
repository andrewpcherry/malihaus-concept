# MaliHaus PPC intake

The Florida page sends to a durable private ingress, which forwards to the dedicated two-step Zapier workflow. Zapier uses its existing private REsimpli connection, verifies the saved CRM activity, then posts a scoped receipt to the ingress. A webhook acknowledgement alone never counts as a lead.

`worker.js` replaces the unmerged branch's legacy `/lead` and `/followup` implementation. Those paths are not enabled. REsimpli API credentials are never present in this repository, browser code or Worker. Public delivery defaults OFF in both Wrangler configurations and in `zapier-worker.mjs`.

## Contracts and holds

- POST `/api/intake`: validates the original enquiry, contact permission, separate measurement choices and attribution. A SQLite Durable Object atomically claims its event and property. Raw payloads and scoped tokens are encrypted with a 32-byte storage key.
- POST `/api/intake/status`: scoped random read token; returns a verified CRM/activity receipt or an honest pending/review state.
- POST `/api/intake/execution`: atomically grants a content-bound execution permit once. A later Zapier run is forced into read-only reconciliation, even when a CRM lookup has not yet caught up. The permit never expires or automatically resets.
- POST `/api/intake/callback`: scoped callback token and matching enquiry content digest. Verified receipts cannot be replaced. A later verified readback may resolve an uncertain receipt.
- POST `/api/intake/reconcile`: private QA authorization plus the original read token. It queues only a read-only check using the encrypted original payload. It never repeats a provider write. Currently limited to reserved synthetic QA.
- GET `/health`: configuration names and hold flags only.

Identical enquiries within 24 hours share a claim. A changed enquiry for a property with an uncertain delivery is held for review. Restarts never resend an incomplete claim automatically. New enquiries must be recent; a private read-only reconciliation retains access to an older stored original enquiry. Ambiguous property/contact matches, incomplete history, rejected writes and lost acknowledgements stop safely without a conversion or automatic retry. Existing leads receive an appended note; their owner, stage and marketing campaign are not reset.

## Private deployment

Use the existing authorized account. Run Wrangler 4.163.0 with the supplied config. Configure `ZAPIER_INTAKE_HOOK`, `INTAKE_STORAGE_KEY` (32 random bytes, base64) and `QA_AUTH_TOKEN` using private secrets input outside the checkout. Do not put them into commands, public files, screenshots or commits. The public endpoint alone does not expose the Zapier receiver or API connection.

In the dedicated Zap, enable the Zapier SDK and select the existing REsimpli connection as `resimpli`. Map native Catch Hook **Step Output** to Code input `payload`; Zapier's field mapper serializes it. Install `zapier-worker.mjs`. Its callback origin must equal the verified deployment origin. The source deliberately rejects real delivery until separately accepted and enabled. Extended runtime is one minute, up to two additional Zapier tasks per execution.

QA requires both the private server-side token and the exact reserved contact/property/attribution allowlist. The separate `PRODUCTION_QA_ENABLED` Worker flag and `productionQaEnabled` Zapier option default OFF. When explicitly enabled for controlled notification acceptance, they admit only the reserved QA131 property and synthetic identity into the existing PPC campaign; measurement consent and Google export remain OFF. Both gates must be returned OFF after the check. QA scenario controls operate only on these reserved synthetic enquiries. They are not exposed in public browser configuration. Keep all Google exports off. Do not point public intake at this endpoint or enable ads as part of a test.

## Checks

```
node --test tests/landing/worker.test.mjs tests/landing/ppc-core.test.cjs tests/landing/ppc-store.test.cjs
npx --yes wrangler@4.163.0 deploy --dry-run --config integration/resimpli-intake/wrangler.toml
```

Node tests exercise real SQLite transactions with injected provider responses. They do not establish deployed Cloudflare compatibility or live REsimpli acceptance; those need controlled readback. Existing `verify.mjs` belongs to the original direct-API implementation and must not be used for this private Zapier route.
