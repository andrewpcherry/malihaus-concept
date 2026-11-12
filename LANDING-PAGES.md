# Google Ads landing pages: Florida and Ohio

Two paid-search pages for homeowners thinking of selling.

| Page | Route | Variant | Page ID |
| --- | --- | --- | --- |
| Florida | `/sell-your-house/florida/` | `florida` | `sell-your-house-florida-v1` |
| Ohio | `/sell-your-house/ohio/` | `ohio` | `sell-your-house-ohio-v1` |

Both are `noindex, nofollow` and are not in `sitemap.xml`. Nothing else on the
site links to them or was changed. The existing `/get-offer/` funnel and its
GoHighLevel delivery are untouched.

## Files

| File | What it is |
| --- | --- |
| `tools/landing_data.py` | All copy. Shared blocks at the top, one `STATES` entry per page. |
| `tools/build_landing.py` | Shared template. Run `python3 tools/build_landing.py` after any copy or config change. |
| `landing.css` | Shared design system (same colours and fonts as the main site). |
| `landing.js` | Two-step form, validation, attribution capture, events, sticky bar. |
| `landing-config.js` | Every setting a non-developer may need to change. No secrets. |
| `integration/resimpli-intake/worker.js` | Server-side handler that creates the lead in REsimpli. Not deployed. |
| `integration/resimpli-intake/verify.mjs` | Lists the REsimpli IDs and confirms the API reply shape. |
| `tests/landing/` | Automated checks. REsimpli is mocked; no real lead is created. |

## Lead delivery: direct to REsimpli

```
browser form  ->  POST {intakeBase}/lead  ->  worker.js  ->  REsimpli POST /lead/add
```

The site is static (GitHub Pages), so it cannot hold the REsimpli API key.
`worker.js` is a small server-side handler that holds the key and is the only
thing that talks to REsimpli. It is written for Cloudflare Workers but uses
only Web-standard APIs. **It has not been deployed and no account was created.**

The form shows the success screen only when the handler answers
`{ok: true, accepted: true, submissionId: <same id>}`. Anything else (no
endpoint configured, network failure, timeout, REsimpli refusal, a reply that
cannot be read as an acceptance) shows a failure screen with the visitor's
details kept, a retry where a retry is safe, and the phone number.

### To connect it

1. In REsimpli: Settings, API & Webhooks, copy the API key.
2. `RESIMPLI_API_KEY=... node integration/resimpli-intake/verify.mjs` and note
   the pipeline, main status, market and marketing campaign IDs to use for
   Florida and for Ohio.
3. Run it once more with `--test-lead` (see the file header). Confirm the lead
   appears in REsimpli, note where the lead id sits in the reply, delete the lead.
4. Deploy `worker.js` with the settings in `wrangler.toml.example`. The key is
   stored as a secret on the host, never in this repository.
5. Open `{deployed url}/health`. It must answer `{"ok":true,"missing":[]}`.
6. Put the deployed URL in `intakeBase` in `landing-config.js`.
7. Submit one test request from each page and read it back in REsimpli.

### Handler settings

| Setting | Required | Purpose |
| --- | --- | --- |
| `RESIMPLI_API_KEY` (secret) | yes | REsimpli Open API key |
| `RESIMPLI_PIPELINE_ID`, `RESIMPLI_MAIN_STATUS_ID` | yes | Where new leads land |
| `RESIMPLI_MARKET_ID_FLORIDA`, `RESIMPLI_MARKET_ID_OHIO` | yes | Market per page |
| `RESIMPLI_CAMPAIGN_ID_FLORIDA`, `RESIMPLI_CAMPAIGN_ID_OHIO` | yes | Marketing campaign per page |
| `ALLOWED_ORIGINS` | yes | `https://www.malihaus.com` |
| `LEADS_KV` (KV binding) | yes | 24 hour record used to stop duplicate leads |
| `RESIMPLI_TAG_IDS_FLORIDA`, `RESIMPLI_TAG_IDS_OHIO` | no | Tags to apply |
| `RESIMPLI_LEAD_ID_PATH` | no | Where the lead id sits in REsimpli's reply, if not found automatically |
| `RESIMPLI_AUTH_PREFIX` | no | For example `Bearer ` if the key needs a prefix |

### What reaches REsimpli

Name, phone, optional email, the property address, `propertyType: residential`,
the market, campaign, pipeline and status IDs, and a comment holding: landing
page variant, page URL, timestamp, submission id, gclid, gbraid, wbraid, UTM
parameters, campaign and ad group IDs, keyword, match type, and the consent
record (wording shown, version, time, and whether marketing permission was given).

The three optional questions shown after a successful request are added as one
activity note on the same lead (`/activity/add`). They never create a second
lead and never fire a conversion.

### Duplicate protection

- Browser: one request in flight at a time; the button is disabled while sending.
- Every form session has one submission id. The handler never sends the same id
  to REsimpli twice, so retrying is safe.
- The same phone number and address within 24 hours under a new id is
  acknowledged to the visitor but creates no new lead and no conversion.
- A filled trap field, a form completed in under 1.5 seconds, more than 12
  requests an hour from one address, or another website's origin are refused.

### Not verified (no API key was available)

- The JSON REsimpli returns from `/lead/add`. The handler fails closed: without
  a recognisable lead id in the reply it reports "unconfirmed", never success.
  Step 3 above settles this.
- Whether the API key needs a prefix in the `Authorization` header.
- How REsimpli parses a one-line address, and whether creating a lead through
  the API starts any REsimpli automation or drip.

## Measurement

Set in `landing-config.js`. All are empty, so nothing loads and nothing is
claimed to be connected.

| Setting | Effect |
| --- | --- |
| `gtmId` | Loads that Google Tag Manager container. |
| `googleAdsId` + `googleAdsLeadLabel` | Used only when `gtmId` is empty. Loads gtag and sends one Google Ads conversion per accepted lead. |
| `respectGlobalPrivacyControl` | `true`: no tag loads for browsers sending the Global Privacy Control signal. |

Events pushed to `window.dataLayer` (every event also carries `lp_variant` and `lp_id`):

| Event | When | Extra fields | Use as |
| --- | --- | --- | --- |
| `form_start` | First keystroke or change in the form, once | | Interaction |
| `form_step_completed` | Step 1 passes validation; step 2 passes validation | `step`, `step_name` | Interaction |
| `lead_submitted` | Only after the handler confirms REsimpli accepted a new lead, once | `submission_id` | **The conversion** |
| `phone_click` | Any call link is tapped | `link_location` | Interaction only |
| `cta_click` | A "Request My Offer" link is tapped | `link_location` | Interaction |
| `lead_submit_failed` | A send did not succeed | `reason` | Diagnostics |
| `lead_details_added` | Optional questions saved | | Interaction |

No name, phone, email, address or free text is ever put in `dataLayer`, a gtag
call, the URL or browser storage. `submission_id` is a random id.

Attribution is read from the landing URL. Suggested Google Ads final URL suffix:

```
utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&campaignid={campaignid}&adgroupid={adgroupid}&keyword={keyword}&matchtype={matchtype}&device={device}&network={network}&creative={creative}
```

`gclid`, `gbraid` and `wbraid` are added by Google when auto-tagging is on.
Call conversions and CRM-qualified leads are configured separately.

## Tests

```
node tests/landing/worker.test.mjs
node tests/landing/browser.test.mjs
AXE_PATH=/path/to/axe.min.js SHOTS=/tmp/previews node tests/landing/browser.test.mjs
```

Needs Node 20 or later and Playwright. Covers 375, 390 and 1440 pixel widths.

## Before these pages take paid traffic

1. Connect and verify REsimpli delivery (above).
2. **Privacy Policy and Terms.** The links on `www.malihaus.com` return 404.
   These pages link to the working policies on `getoffer.malihaus.com`, which
   were written for that page and describe GoHighLevel, Zapier and OpenAI
   measurement, not Google Ads or direct REsimpli delivery. They need updating
   by the business before launch. Change `privacyUrl` and `termsUrl` after.
3. **Legal name.** The footer uses the line published on getoffer.malihaus.com,
   "MaliHaus is a brand of Real Estate RE Marketing Inc." The Google Ads
   agreement names MaliHaus Capital LLC. Confirm which is correct for these
   pages and set `legalLine`.
4. **Consent wording** is copied from getoffer.malihaus.com (version
   2026-10-06). Confirm it is approved for these pages, and that REsimpli
   follow-up respects a "no marketing permission" answer.
5. Confirm these statements, which are carried over from the live site:
   direct purchases close at a title company; MaliHaus may buy with its own
   funds; an inspection comes before a direct purchase; repairs under contract
   only with written approval; the national investor network.
6. Confirm the market lists with the client.
7. Images are illustrative (generated for the main site in September 2026) and
   are captioned as such. Swap for real photographs if available: same file
   names, no code change.
8. Add the GTM or Google Ads IDs.
9. Testimonials are deliberately absent. To add checked, attributable reviews
   about property sales, fill `TESTIMONIALS` in `tools/landing_data.py`.
