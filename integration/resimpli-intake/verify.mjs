/* One-off checks against the real REsimpli account. Run locally, never in a browser.

   1. List the IDs the intake handler needs:
        RESIMPLI_API_KEY=... node integration/resimpli-intake/verify.mjs

   2. Create ONE clearly labelled test lead and print REsimpli's raw reply, to
      confirm the reply shape and where the lead id sits (delete the lead after):
        RESIMPLI_API_KEY=... RESIMPLI_PIPELINE_ID=... RESIMPLI_MAIN_STATUS_ID=... \
        RESIMPLI_MARKET_ID=... RESIMPLI_CAMPAIGN_ID=... \
        node integration/resimpli-intake/verify.mjs --test-lead

   If calls return 401, try RESIMPLI_AUTH_PREFIX="Bearer " and set the same
   value on the deployed handler.                                              */
const BASE = process.env.RESIMPLI_API_BASE || 'https://api.resimpli.com/api/v6/openapi';
const KEY = process.env.RESIMPLI_API_KEY;
if (!KEY) { console.error('Set RESIMPLI_API_KEY'); process.exit(1); }

async function call(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: (process.env.RESIMPLI_AUTH_PREFIX || '') + KEY },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  console.log('\n=== POST ' + path + ' -> HTTP ' + res.status + '\n' + text.slice(0, 6000));
}

if (process.argv.includes('--test-lead')) {
  await call('/lead/add', {
    contactDetails: { firstName: 'TEST', lastName: 'Website Integration',
      phoneNumbers: [{ phoneNumber: '4075550100', isPrimary: true }] },
    propertyType: 'residential',
    address: '1 Test Street, Tampa, FL 33602',
    marketingCampignId: process.env.RESIMPLI_CAMPAIGN_ID,
    marketId: process.env.RESIMPLI_MARKET_ID,
    pipelineId: process.env.RESIMPLI_PIPELINE_ID,
    mainStatusId: process.env.RESIMPLI_MAIN_STATUS_ID,
    comment: 'TEST lead created by verify.mjs to confirm the website integration. Safe to delete.'
  });
  console.log('\nFind the 24 character lead id in the reply above. If it is not at data._id, ' +
    'data.leadId, data.id, _id, leadId or id, set RESIMPLI_LEAD_ID_PATH on the handler.');
} else {
  await call('/getUserInfo', {});
  await call('/getPipelineList', { moduleType: 1, page: 1, limit: 100 });
  await call('/marketList', {});
  await call('/marketingCampaignList', { campaignType: 1 });
  await call('/tagList', { tagType: 1, page: 1, limit: 100 });
}
