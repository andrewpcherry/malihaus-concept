/* Unit tests for integration/resimpli-intake/worker.js.
   REsimpli is mocked. No network calls, no real leads.
       node tests/landing/worker.test.mjs                                  */
import assert from 'node:assert/strict';
import { handle } from '../../integration/resimpli-intake/worker.js';

const ORIGIN = 'https://www.malihaus.com';
const LEAD_ID = '65f1a2b3c4d5e6f7a8b9c0d1';

function kv() {
  const m = new Map();
  return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); },
    delete: async (k) => { m.delete(k); } };
}
function env(extra = {}) {
  return { RESIMPLI_API_KEY: 'test-key', RESIMPLI_PIPELINE_ID: 'p1', RESIMPLI_MAIN_STATUS_ID: 's1',
    RESIMPLI_MARKET_ID_FLORIDA: 'mfl', RESIMPLI_MARKET_ID_OHIO: 'moh',
    RESIMPLI_CAMPAIGN_ID_FLORIDA: 'cfl', RESIMPLI_CAMPAIGN_ID_OHIO: 'coh',
    ALLOWED_ORIGINS: ORIGIN, LEADS_KV: kv(), ...extra };
}
function lead(over = {}) {
  return { submissionId: 'sub-00000001', variant: 'ohio', pageId: 'sell-your-house-ohio-v1',
    property: { street: '123 Main St', city: 'Dayton', state: 'OH', zip: '45402' },
    contact: { name: 'Jane Q Seller', phone: '9375550123', email: 'jane@example.invalid' },
    consent: { contact: true, contactText: 'I agree.', marketing: false, marketingText: '', version: 'v', at: '2026-11-12T00:00:00Z' },
    attribution: { gclid: 'G123', utm_campaign: 'oh-search', keyword: 'sell my house fast', matchtype: 'p' },
    page: { url: ORIGIN + '/sell-your-house/ohio/', submittedAt: '2026-11-12T00:00:00Z' },
    hp: '', elapsedMs: 9000, ...over };
}
function post(path, body, origin = ORIGIN) {
  return new Request('https://intake.test' + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
}
function upstream(responder) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return responder(url, init); };
  return { f, calls };
}
const okLead = () => new Response(JSON.stringify({ statusCode: 200, data: { _id: LEAD_ID } }), { status: 200 });
let n = 0;
async function test(name, fn) { await fn(); n += 1; console.log('ok   ' + name); }

await test('accepted lead maps to the documented REsimpli fields', async () => {
  const e = env(); const up = upstream(okLead);
  const res = await handle(post('/lead', lead()), e, { fetch: up.f });
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(json, { ok: true, accepted: true, submissionId: 'sub-00000001', duplicate: false });
  assert.equal(up.calls.length, 1);
  const c = up.calls[0];
  assert.equal(c.url, 'https://api.resimpli.com/api/v6/openapi/lead/add');
  assert.equal(c.init.headers.Authorization, 'test-key');
  assert.deepEqual(c.body.contactDetails, { firstName: 'Jane', lastName: 'Q Seller',
    phoneNumbers: [{ phoneNumber: '9375550123', isPrimary: true }],
    emails: [{ email: 'jane@example.invalid', isPrimary: true }] });
  assert.equal(c.body.propertyType, 'residential');
  assert.equal(c.body.address, '123 Main St, Dayton, OH 45402');
  assert.equal(c.body.marketingCampignId, 'coh');
  assert.equal(c.body.marketId, 'moh');
  assert.equal(c.body.pipelineId, 'p1');
  assert.equal(c.body.mainStatusId, 's1');
  for (const s of ['variant: ohio', 'gclid: G123', 'keyword: sell my house fast', 'matchtype: p',
    'Submission ID: sub-00000001', 'Marketing calls and texts: NO']) assert.ok(c.body.comment.includes(s), s);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

await test('florida variant uses the florida ids and optional tags', async () => {
  const e = env({ RESIMPLI_TAG_IDS_FLORIDA: 't1, t2' }); const up = upstream(okLead);
  await handle(post('/lead', lead({ variant: 'florida' })), e, { fetch: up.f });
  assert.equal(up.calls[0].body.marketId, 'mfl');
  assert.equal(up.calls[0].body.marketingCampignId, 'cfl');
  assert.deepEqual(up.calls[0].body.tagIds, ['t1', 't2']);
});

await test('same submission id is never sent twice', async () => {
  const e = env(); const up = upstream(okLead);
  await handle(post('/lead', lead()), e, { fetch: up.f });
  const res = await handle(post('/lead', lead()), e, { fetch: up.f });
  const json = await res.json();
  assert.equal(up.calls.length, 1);
  assert.equal(json.accepted, true); assert.equal(json.replayed, true); assert.equal(json.duplicate, false);
});

await test('same phone and address under a new id is a duplicate, not a second lead', async () => {
  const e = env(); const up = upstream(okLead);
  await handle(post('/lead', lead()), e, { fetch: up.f });
  const res = await handle(post('/lead', lead({ submissionId: 'sub-00000002' })), e, { fetch: up.f });
  const json = await res.json();
  assert.equal(up.calls.length, 1);
  assert.equal(json.accepted, true); assert.equal(json.duplicate, true);
});

await test('REsimpli 4xx is a refusal and can be retried with the same id', async () => {
  const e = env(); let fail = true;
  const up = upstream(() => (fail ? new Response('{"message":"bad"}', { status: 400 }) : okLead()));
  const res = await handle(post('/lead', lead()), e, { fetch: up.f });
  assert.equal(res.status, 502); assert.equal((await res.json()).ok, false);
  fail = false;
  const again = await handle(post('/lead', lead()), e, { fetch: up.f });
  assert.equal(again.status, 200); assert.equal(up.calls.length, 2);
});

await test('HTTP 200 carrying a failure marker is not accepted', async () => {
  const e = env();
  const up = upstream(() => new Response(JSON.stringify({ statusCode: 400, message: 'Market not found' }), { status: 200 }));
  const res = await handle(post('/lead', lead()), e, { fetch: up.f });
  assert.equal(res.status, 502);
});

await test('2xx without a recognisable lead id fails closed and is not re-sent', async () => {
  const e = env(); const up = upstream(() => new Response('{"message":"ok"}', { status: 200 }));
  const res = await handle(post('/lead', lead()), e, { fetch: up.f });
  assert.equal(res.status, 504); assert.equal((await res.json()).error, 'unconfirmed');
  const again = await handle(post('/lead', lead()), e, { fetch: up.f });
  assert.equal(again.status, 409); assert.equal(up.calls.length, 1);
});

await test('network failure is unconfirmed, never success', async () => {
  const e = env(); const up = upstream(() => { throw new Error('down'); });
  const res = await handle(post('/lead', lead()), e, { fetch: up.f });
  assert.equal(res.status, 504); assert.equal((await res.json()).ok, false);
});

await test('invalid input is refused before REsimpli is called', async () => {
  const e = env(); const up = upstream(okLead);
  for (const bad of [
    { contact: { name: 'Jane', phone: '123', email: '' } },
    { property: { street: 'Main', city: 'Dayton', state: 'OH', zip: '45402' } },
    { consent: { contact: false } }, { variant: 'texas' }, { hp: 'http://spam' }, { elapsedMs: 300 }]) {
    const res = await handle(post('/lead', lead({ submissionId: 'sub-bad-' + Math.random().toString(36).slice(2, 10), ...bad })), e, { fetch: up.f });
    assert.equal(res.status, 422, JSON.stringify(bad));
  }
  assert.equal(up.calls.length, 0);
});

await test('missing settings answer not_configured and list the names only', async () => {
  const e = env({ RESIMPLI_API_KEY: '', RESIMPLI_MARKET_ID_OHIO: '' }); const up = upstream(okLead);
  const res = await handle(post('/lead', lead()), e, { fetch: up.f });
  const json = await res.json();
  assert.equal(res.status, 503); assert.equal(json.error, 'not_configured');
  assert.deepEqual(json.missing, ['RESIMPLI_API_KEY', 'RESIMPLI_MARKET_ID_OHIO']);
  assert.equal(up.calls.length, 0);
});

await test('other origins are refused', async () => {
  const e = env(); const up = upstream(okLead);
  const res = await handle(post('/lead', lead(), 'https://evil.example'), e, { fetch: up.f });
  assert.equal(res.status, 403); assert.equal(up.calls.length, 0);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
});

await test('follow-up answers become one activity note on the same lead', async () => {
  const e = env(); const up = upstream((url) => (url.endsWith('/lead/add') ? okLead() : new Response('{"statusCode":200}', { status: 200 })));
  await handle(post('/lead', lead()), e, { fetch: up.f });
  const res = await handle(post('/followup', { submissionId: 'sub-00000001', answers: { condition: 'Needs major repairs', timeline: 'No fixed date' } }), e, { fetch: up.f });
  assert.equal(res.status, 200);
  const c = up.calls[1];
  assert.equal(c.url, 'https://api.resimpli.com/api/v6/openapi/activity/add');
  assert.equal(c.body.moduleId, 1); assert.equal(c.body.subModuleId, LEAD_ID);
  assert.ok(c.body.comment.includes('Condition: Needs major repairs'));
  const again = await handle(post('/followup', { submissionId: 'sub-00000001', answers: { condition: 'Not sure' } }), e, { fetch: up.f });
  assert.equal((await again.json()).replayed, true);
  assert.equal(up.calls.length, 2);
  assert.equal(up.calls.filter((x) => x.url.endsWith('/lead/add')).length, 1);
});

await test('follow-up for an unknown submission or free text is refused', async () => {
  const e = env(); const up = upstream(okLead);
  assert.equal((await handle(post('/followup', { submissionId: 'sub-unknown-1', answers: { condition: 'Not sure' } }), e, { fetch: up.f })).status, 404);
  assert.equal((await handle(post('/followup', { submissionId: 'sub-unknown-1', answers: { condition: 'my own text' } }), e, { fetch: up.f })).status, 422);
  assert.equal(up.calls.length, 0);
});

await test('health reports names only', async () => {
  const res = await handle(new Request('https://intake.test/health'), env({ RESIMPLI_API_KEY: '' }));
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { ok: false, missing: ['RESIMPLI_API_KEY'] });
});

console.log('\n' + n + ' worker tests passed');
