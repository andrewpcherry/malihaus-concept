/* Browser tests for the two landing pages.

   Serves the repo locally, runs the real intake handler in-process with
   REsimpli MOCKED, and drives Chromium at 375, 390 and 1440 wide.
   No real lead is created and nothing is sent to REsimpli or Google.

       node tests/landing/browser.test.mjs
       AXE_PATH=/path/to/axe.min.js node tests/landing/browser.test.mjs   (adds axe checks)
       SHOTS=/some/dir node tests/landing/browser.test.mjs                 (saves previews)
*/
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { handle } from '../../integration/resimpli-intake/worker.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
const LEAD_ID = '65f1a2b3c4d5e6f7a8b9c0d1';
const PII = ['Jane', 'Seller', '4075550123', '407-555-0123', '(407) 555', 'jane.seller', '742 Evergreen', '33602'];

/* ---------------- local servers ---------------- */
const site = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(REPO, p);
  if (!file.startsWith(REPO) || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => site.listen(0, '127.0.0.1', r));
const SITE = 'http://127.0.0.1:' + site.address().port;

const crm = { mode: 'ok', calls: [] };
function freshKv() {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); }, delete: async (k) => { m.delete(k); } };
}
let env;
function resetIntake() {
  crm.mode = 'ok'; crm.calls = [];
  env = { RESIMPLI_API_KEY: 'test-key', RESIMPLI_PIPELINE_ID: 'p1', RESIMPLI_MAIN_STATUS_ID: 's1',
    RESIMPLI_MARKET_ID_FLORIDA: 'mfl', RESIMPLI_MARKET_ID_OHIO: 'moh', RESIMPLI_CAMPAIGN_ID_FLORIDA: 'cfl',
    RESIMPLI_CAMPAIGN_ID_OHIO: 'coh', ALLOWED_ORIGINS: SITE, LEADS_KV: freshKv() };
}
resetIntake();
async function mockResimpli(url, init) {
  crm.calls.push({ url: String(url), body: JSON.parse(init.body) });
  if (crm.mode === 'slow') await new Promise((r) => setTimeout(r, 700));
  if (crm.mode === 'refuse') return new Response('{"message":"refused"}', { status: 400 });
  if (crm.mode === 'noid') return new Response('{"message":"ok"}', { status: 200 });
  return new Response(JSON.stringify({ statusCode: 200, data: { _id: LEAD_ID } }), { status: 200 });
}
const intake = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const request = new Request('http://127.0.0.1' + req.url, { method: req.method, headers: req.headers,
    body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : Buffer.concat(chunks) });
  const out = await handle(request, env, { fetch: mockResimpli });
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(await out.text());
});
await new Promise((r) => intake.listen(0, '127.0.0.1', r));
const INTAKE = 'http://127.0.0.1:' + intake.address().port;
const leadCalls = () => crm.calls.filter((c) => c.url.endsWith('/lead/add'));

/* ---------------- helpers ---------------- */
const browser = await chromium.launch();
let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed += 1; console.log('ok   ' + name); }
  catch (err) { failures.push(name); console.log('FAIL ' + name + '\n     ' + String(err.message).split('\n').join('\n     ')); }
}
async function open(variant, width, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 720 : 900 },
    deviceScaleFactor: opts.scale || 1, hasTouch: width < 600 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|ERR_ABORTED/.test(m.text())) errors.push(m.text()); });
  const overrides = { intakeBase: INTAKE, ...(opts.overrides || {}) };
  await page.addInitScript((o) => { window.MH_LANDING_OVERRIDES = o; }, overrides);
  if (opts.init) await page.addInitScript(opts.init);
  await page.route(/googletagmanager\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.goto(SITE + '/sell-your-house/' + variant + '/' + (opts.query || ''), { waitUntil: 'networkidle' });
  return { page, ctx, errors };
}
const events = (page, name) => page.evaluate((n) => window.dataLayer.filter((e) => e && e.event === n), name);
async function step1(page, over = {}) {
  await page.fill('#street', over.street ?? '742 Evergreen Terrace');
  await page.fill('#city', over.city ?? 'Tampa');
  await page.fill('#zip', over.zip ?? '33602');
  await page.click('#lp-continue');
}
async function step2(page, over = {}) {
  await page.fill('#name', over.name ?? 'Jane Seller');
  await page.fill('#phone', over.phone ?? '(407) 555-0123');
  await page.fill('#email', over.email ?? 'jane.seller@example.invalid');
  if (over.consent !== false) await page.check('#consent');
}
const settle = (page) => page.waitForTimeout(1700);   /* the server refuses forms finished in under 1.5 s */

/* ---------------- layout, at every width, both pages ---------------- */
const PAGES = { florida: 'Sell Your Florida House As-Is', ohio: 'Sell Your Ohio House As-Is' };
for (const [variant, h1] of Object.entries(PAGES)) {
  for (const width of [375, 390, 1440]) {
    await test(`${variant} ${width}px: layout, header, tap targets, sticky bar`, async () => {
      const { page, ctx, errors } = await open(variant, width);
      assert.equal(await page.textContent('h1'), h1);
      assert.equal(await page.getAttribute('body', 'data-lp-variant'), variant);
      assert.equal(await page.getAttribute('meta[name=robots]', 'content'), 'noindex, nofollow');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, 'horizontal overflow');

      /* minimal header: logo, one call link, one CTA, nothing else */
      const headerLinks = await page.$$eval('.lp-header a', (as) => as.map((a) => a.getAttribute('href')));
      assert.deepEqual(headerLinks, ['tel:+14079173347', '#offer-form']);
      assert.equal(await page.textContent('.lp-header .lp-btn'), 'Request My Offer');
      const outside = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href'))
        .filter((h) => !h.startsWith('tel:') && !h.startsWith('#')));
      assert.equal(outside.length, 2 + 2, 'only privacy and terms links leave the page: ' + outside.join(' '));

      /* first form field is above the fold */
      const box = await page.locator('#street').boundingBox();
      assert.ok(box.y + box.height < page.viewportSize().height, 'street field below the fold at y=' + box.y);

      /* tap targets */
      const small = await page.$$eval('a, button, input:not([type=checkbox]), select, summary', (els) => els
        .filter((el) => el.offsetParent !== null && !el.closest('.lp-hp') && !el.classList.contains('lp-skip'))
        .map((el) => { const r = el.getBoundingClientRect(); return { t: (el.textContent || el.id).trim().slice(0, 30), h: Math.round(r.height), w: Math.round(r.width) }; })
        .filter((r) => r.h < 44 || r.w < 44));
      assert.deepEqual(small, [], 'targets under 44px');

      /* body copy is comfortably large */
      const size = await page.$eval('.lp-sub', (el) => parseFloat(getComputedStyle(el).fontSize));
      assert.ok(size >= 17, 'sub copy ' + size + 'px');
      const inputSize = await page.$eval('#street', (el) => parseFloat(getComputedStyle(el).fontSize));
      assert.ok(inputSize >= 16, 'inputs under 16px zoom on iOS');

      /* sticky bar */
      const bar = page.locator('#lp-bar');
      assert.equal(await bar.isVisible(), false, 'bar must be hidden while the form is on screen');
      await page.locator('#lp-faq-h').scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      if (width < 960) {
        assert.equal(await bar.isVisible(), true, 'bar should show once the form is off screen');
        assert.deepEqual(await bar.locator('a').allTextContents(), ['Request My Offer', 'Call']);
        await bar.locator('a[data-cta]').click();
        await page.waitForTimeout(900);
        assert.equal(await bar.isVisible(), false, 'bar must hide again at the form');
        /* nothing fixed may sit on top of the consent text or the submit button */
        await step1(page);
        for (const sel of ['#consent', '#lp-submit', '#marketing']) {
          await page.locator(sel).scrollIntoViewIfNeeded();
          await page.waitForTimeout(150);
          const covered = await page.$eval(sel, (el) => {
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return !(top === el || el.contains(top) || (top && top.contains(el)) || (top && top.closest('label') === el.closest('label')));
          });
          assert.equal(covered, false, sel + ' is covered');
        }
        await page.locator('#lp-final').scrollIntoViewIfNeeded();
        await page.waitForTimeout(250);
        assert.equal(await bar.isVisible(), false, 'bar must hide at the final call to action');
      } else {
        assert.equal(await bar.isVisible(), false, 'no sticky bar on desktop');
      }
      assert.deepEqual(errors, [], 'console errors');
      await ctx.close();
    });
  }
}

/* ---------------- content accuracy ---------------- */
await test('copy: no forbidden claims, correct markets on each page, no cross-state imagery', async () => {
  const banned = [/guarantee[ds]? (offer|closing|price)/i, /24 hours/i, /highest price/i, /full market value/i,
    /we buy every/i, /no fees/i, /no commission/i, /closing costs/i, /\d+ (years|homes|houses|deals)/i,
    /foreclosure/i, /testimonial/i, /4\.8/, /stars/i, /cash offer in/i, /\d+ days/i];
  const fl = fs.readFileSync(path.join(REPO, 'sell-your-house/florida/index.html'), 'utf8');
  const oh = fs.readFileSync(path.join(REPO, 'sell-your-house/ohio/index.html'), 'utf8');
  for (const [name, html] of [['florida', fl], ['ohio', oh]]) {
    const text = html.replace(/<[^>]+>/g, ' ');
    for (const b of banned) assert.equal(b.test(text), false, name + ' contains ' + b);
    assert.ok(text.includes('not an instant valuation'));
    assert.ok(text.includes('does not commit you to selling'));
    assert.ok(text.includes('MaliHaus does not buy every property'));
    assert.equal(/—|–/.test(text), false, name + ' contains a dash used as punctuation');
  }
  for (const m of ['Broward County', 'Palm Beach County', 'Duval County (Jacksonville)', 'Hillsborough County (Tampa)',
    'Orange County (Orlando)', 'Seminole County', 'Pasco County', 'Polk County']) assert.ok(fl.includes(m), m);
  for (const m of ['Cleveland', 'Akron', 'Dayton and Montgomery County']) assert.ok(oh.includes(m), m);
  assert.equal(/Cleveland|Akron|Dayton|-oh-/.test(fl), false, 'Ohio content on the Florida page');
  assert.equal(/Broward|Tampa|Orlando|-fl-|palm/i.test(oh.replace(/Boca Raton, (FL|Florida)/g, '')), false, 'Florida content on the Ohio page');
  assert.ok(oh.includes('does not have an office in Ohio'));
});

/* ---------------- the form ---------------- */
await test('step 1 validation: clear errors, focus moves, nothing is lost between steps', async () => {
  resetIntake();
  const { page, ctx } = await open('florida', 375);
  await page.click('#lp-continue');
  assert.equal(await page.isVisible('#lp-step-2'), false);
  assert.equal(await page.getAttribute('#street', 'aria-invalid'), 'true');
  assert.match(await page.textContent('#street-err'), /street number and street name/);
  assert.match(await page.textContent('#lp-form-error'), /3 highlighted fields/);
  assert.equal(await page.getAttribute('#lp-form-error', 'role'), 'alert');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'street');
  assert.equal(await page.inputValue('#state'), 'FL');
  assert.equal((await events(page, 'form_start')).length, 0, 'form_start before any input');

  await step1(page, { zip: '336' });
  assert.match(await page.textContent('#zip-err'), /5 digit ZIP/);
  assert.equal(await page.getAttribute('#street', 'aria-invalid'), null);
  await page.fill('#zip', '33602');
  assert.equal(await page.isVisible('#zip-err'), false, 'error clears when corrected');
  await page.press('#zip', 'Enter');
  assert.equal(await page.isVisible('#lp-step-2'), true, 'Enter continues');
  assert.match(await page.textContent('#lp-progress'), /Step 2 of 2/);
  assert.match(await page.textContent('#lp-address-summary'), /742 Evergreen Terrace, Tampa, FL 33602/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'name');
  assert.equal((await events(page, 'form_start')).length, 1);
  assert.deepEqual((await events(page, 'form_step_completed')).map((e) => e.step), [1]);

  await page.fill('#name', 'Jane Seller');
  await page.fill('#phone', '407 555 0123');
  await page.click('#lp-back');
  assert.equal(await page.isVisible('#lp-step-1'), true);
  assert.equal(await page.inputValue('#street'), '742 Evergreen Terrace');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'street');
  await page.click('#lp-continue');
  assert.equal(await page.inputValue('#name'), 'Jane Seller');
  assert.equal(await page.inputValue('#phone'), '407 555 0123');
  await ctx.close();
});

await test('field attributes: labels, autofill and mobile keyboards', async () => {
  const { page, ctx } = await open('ohio', 390);
  const want = { street: ['address-line1', null, 'text'], city: ['address-level2', null, 'text'],
    state: ['address-level1', null, null], zip: ['postal-code', 'numeric', 'text'], name: ['name', null, 'text'],
    phone: ['tel', 'tel', 'tel'], email: ['email', 'email', 'email'] };
  for (const [id, [ac, im, type]] of Object.entries(want)) {
    assert.equal(await page.getAttribute('#' + id, 'autocomplete'), ac, id);
    assert.equal(await page.getAttribute('#' + id, 'inputmode'), im, id);
    if (type) assert.equal(await page.getAttribute('#' + id, 'type'), type, id);
    assert.ok((await page.textContent(`label[for=${id}]`)).trim().length > 2, id + ' label');
  }
  assert.equal(await page.inputValue('#state'), 'OH');
  assert.match(await page.textContent('label[for=email]'), /optional/);
  await ctx.close();
});

await test('step 2 validation and consent: nothing ticked by default, marketing stays separate', async () => {
  resetIntake();
  const { page, ctx } = await open('ohio', 390);
  await step1(page, { street: '55 Oak Ave', city: 'Dayton', zip: '45402' });
  assert.equal(await page.isChecked('#consent'), false);
  assert.equal(await page.isChecked('#marketing'), false);
  assert.match(await page.textContent('label[for=consent]'), /I agree to the Terms & Conditions and Privacy Policy\. I request a response about my property enquiry/);
  assert.match(await page.textContent('label[for=marketing]'), /Optional marketing permission\..*Consent is not a condition of purchasing/);
  assert.match(await page.textContent('#lp-step-2 .lp-note'), /Someone from the MaliHaus team will contact you/);
  await page.fill('#name', 'J');
  await page.fill('#phone', '555-0123');
  await page.fill('#email', 'not-an-email');
  await settle(page);
  await page.click('#lp-submit');
  for (const id of ['name', 'phone', 'email', 'consent']) assert.equal(await page.getAttribute('#' + id, 'aria-invalid'), 'true', id);
  assert.match(await page.textContent('#phone-err'), /10 digit US phone number/);
  assert.match(await page.textContent('#consent-err'), /Tick this box/);
  assert.equal(leadCalls().length, 0);
  assert.equal(await page.isVisible('#lp-success'), false);
  /* optional email may be left empty; marketing may stay unticked */
  await step2(page, { email: '' });
  await page.click('#lp-submit');
  await page.waitForSelector('#lp-success:not([hidden])');
  const body = leadCalls()[0].body;
  assert.equal(body.contactDetails.emails, undefined);
  assert.match(body.comment, /Marketing calls and texts: NO/);
  assert.equal(body.marketId, 'moh');
  await ctx.close();
});

await test('success only after the server accepts; double click sends one lead; events fire once, without personal data', async () => {
  resetIntake(); crm.mode = 'slow';
  const q = '?gclid=TESTGCLID&gbraid=GB1&wbraid=WB1&utm_source=google&utm_medium=cpc&utm_campaign=fl-search&campaignid=111&adgroupid=222&keyword=sell%20my%20house%20fast&matchtype=e';
  const { page, ctx, errors } = await open('florida', 390, { query: q });
  await step1(page);
  await step2(page);
  await page.check('#marketing');
  await settle(page);
  await page.dblclick('#lp-submit');
  await page.waitForTimeout(150);
  assert.equal(await page.isVisible('#lp-success'), false, 'success shown before the server answered');
  assert.equal(await page.isDisabled('#lp-submit'), true);
  assert.match(await page.textContent('#lp-submit'), /Sending your request/);
  assert.equal((await events(page, 'lead_submitted')).length, 0, 'lead_submitted before acceptance');
  await page.waitForSelector('#lp-success:not([hidden])');
  assert.match(await page.textContent('#lp-success-title'), /Thank you, Jane\. We have your request\./);
  assert.match(await page.textContent('#lp-success'), /Someone from the MaliHaus team will contact you/);
  assert.equal(await page.isVisible('#lp-form'), false);
  assert.equal(leadCalls().length, 1, 'double click must create one lead');

  const sent = await events(page, 'lead_submitted');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].lp_variant, 'florida');
  assert.equal(sent[0].lp_id, 'sell-your-house-florida-v1');
  const order = await page.evaluate(() => window.dataLayer.map((e) => e && e.event).filter(Boolean));
  assert.deepEqual(order, ['form_start', 'form_step_completed', 'form_step_completed', 'lead_submitted']);

  /* nothing personal in analytics, the URL or browser storage */
  const dump = await page.evaluate(() => JSON.stringify(window.dataLayer) + ' ' + location.href + ' ' +
    JSON.stringify(Object.entries(sessionStorage)) + ' ' + JSON.stringify(Object.entries(localStorage)) + ' ' + document.cookie);
  for (const p of PII) assert.equal(dump.includes(p), false, 'personal data leaked: ' + p);

  /* attribution and consent reached the CRM payload */
  const c = leadCalls()[0].body.comment;
  for (const s of ['variant: florida', 'gclid: TESTGCLID', 'gbraid: GB1', 'wbraid: WB1', 'utm_source: google',
    'utm_campaign: fl-search', 'campaignid: 111', 'adgroupid: 222', 'keyword: sell my house fast', 'matchtype: e',
    'landingUrl: ' + SITE + '/sell-your-house/florida/?gclid=TESTGCLID', 'Landing page: ' + SITE + '/sell-your-house/florida/',
    'Marketing calls and texts: YES']) assert.ok(c.includes(s), 'comment missing: ' + s);
  assert.match(c, /Submitted: 20\d\d-/);
  assert.equal(leadCalls()[0].body.marketId, 'mfl');

  /* optional questions: one activity note, no second lead, no second conversion */
  crm.mode = 'ok';
  await page.selectOption('#fu-condition', 'Needs major repairs');
  await page.selectOption('#fu-timeline', 'Within 1 to 3 months');
  await page.click('#lp-followup-send');
  await page.waitForFunction(() => /Added/.test(document.getElementById('lp-followup-status').textContent));
  assert.equal(leadCalls().length, 1);
  const notes = crm.calls.filter((x) => x.url.endsWith('/activity/add'));
  assert.equal(notes.length, 1);
  assert.equal(notes[0].body.subModuleId, LEAD_ID);
  assert.match(notes[0].body.comment, /Condition: Needs major repairs\nPreferred timing: Within 1 to 3 months/);
  assert.equal((await events(page, 'lead_submitted')).length, 1);
  assert.deepEqual(errors, []);

  /* same person, same property, fresh page: acknowledged, but not a new lead or conversion */
  const again = await ctx.newPage();
  await again.addInitScript((o) => { window.MH_LANDING_OVERRIDES = o; }, { intakeBase: INTAKE });
  await again.goto(SITE + '/sell-your-house/florida/', { waitUntil: 'networkidle' });
  await step1(again); await step2(again); await again.waitForTimeout(1700);
  await again.click('#lp-submit');
  await again.waitForSelector('#lp-success:not([hidden])');
  assert.equal(leadCalls().length, 1, 'duplicate created a second lead');
  assert.equal((await again.evaluate(() => window.dataLayer.filter((e) => e.event === 'lead_submitted'))).length, 0);
  await ctx.close();
});

await test('server refusal: no success, details kept, retry works, one conversion', async () => {
  resetIntake(); crm.mode = 'refuse';
  const { page, ctx } = await open('ohio', 1440);
  await step1(page, { street: '9 Lake Rd', city: 'Akron', zip: '44304' });
  await step2(page);
  await settle(page);
  await page.click('#lp-submit');
  await page.waitForSelector('#lp-failure:not([hidden])');
  assert.equal(await page.isVisible('#lp-success'), false);
  assert.match(await page.textContent('#lp-failure-text'), /was not sent.*still here.*407-917-3347/);
  assert.equal(await page.getAttribute('#lp-failure a[data-call]', 'href'), 'tel:+14079173347');
  assert.equal((await events(page, 'lead_submitted')).length, 0);
  assert.deepEqual((await events(page, 'lead_submit_failed')).map((e) => e.reason), ['server']);
  await page.click('#lp-edit');
  assert.equal(await page.inputValue('#name'), 'Jane Seller');
  assert.equal(await page.inputValue('#phone'), '(407) 555-0123');
  assert.equal(await page.isChecked('#consent'), true);
  await page.click('#lp-back');
  assert.equal(await page.inputValue('#street'), '9 Lake Rd');
  await page.click('#lp-continue');
  crm.mode = 'ok';
  await page.click('#lp-submit');
  await page.waitForSelector('#lp-success:not([hidden])');
  assert.equal((await events(page, 'lead_submitted')).length, 1);
  assert.equal(leadCalls().length, 2);   /* one refused, one accepted */
  await ctx.close();
});

await test('network failure: no success, retry button resends the same request once', async () => {
  resetIntake();
  const { page, ctx } = await open('florida', 375);
  let block = true;
  await page.route(INTAKE + '/lead', (r) => (block ? r.abort() : r.continue()));
  await step1(page); await step2(page); await settle(page);
  await page.click('#lp-submit');
  await page.waitForSelector('#lp-failure:not([hidden])');
  assert.match(await page.textContent('#lp-failure-text'), /could not reach our system/);
  assert.equal(await page.isVisible('#lp-success'), false);
  assert.equal((await events(page, 'lead_submitted')).length, 0);
  assert.equal(leadCalls().length, 0);
  block = false;
  await page.click('#lp-retry');
  await page.waitForSelector('#lp-success:not([hidden])');
  assert.equal(leadCalls().length, 1);
  assert.equal((await events(page, 'lead_submitted')).length, 1);
  await ctx.close();
});

await test('unconfirmed delivery: told to call, no retry loop, no conversion', async () => {
  resetIntake(); crm.mode = 'noid';
  const { page, ctx } = await open('ohio', 390);
  await step1(page, { street: '12 Elm St', city: 'Cleveland', zip: '44102' });
  await step2(page); await settle(page);
  await page.click('#lp-submit');
  await page.waitForSelector('#lp-failure:not([hidden])');
  assert.match(await page.textContent('#lp-failure-text'), /could not confirm.*please call us on 407-917-3347/);
  assert.equal(await page.isVisible('#lp-retry'), false);
  assert.equal(await page.isVisible('#lp-success'), false);
  assert.equal((await events(page, 'lead_submitted')).length, 0);
  await ctx.close();
});

await test('no intake configured: the form never claims delivery and makes no request', async () => {
  resetIntake();
  const { page, ctx } = await open('florida', 390, { overrides: { intakeBase: '' } });
  let requests = 0;
  page.on('request', (r) => { if (r.method() === 'POST') requests += 1; });
  await step1(page); await step2(page);
  await page.click('#lp-submit');
  await page.waitForSelector('#lp-failure:not([hidden])');
  assert.match(await page.textContent('#lp-failure-text'), /not available right now\. Your details have not been sent\. Please call us on 407-917-3347/);
  assert.equal(await page.isVisible('#lp-success'), false);
  assert.equal(await page.isVisible('#lp-retry'), false);
  assert.equal(requests, 0);
  assert.equal((await events(page, 'lead_submitted')).length, 0);
  await ctx.close();
});

await test('shipped config has no IDs and no endpoint; a server without settings answers not_configured', async () => {
  const cfg = fs.readFileSync(path.join(REPO, 'landing-config.js'), 'utf8');
  for (const key of ['intakeBase', 'gtmId', 'googleAdsId', 'googleAdsLeadLabel']) assert.match(cfg, new RegExp(key + ": ''"), key);
  resetIntake(); env.RESIMPLI_API_KEY = '';
  const { page, ctx } = await open('ohio', 390);
  await step1(page, { street: '3 Hill St', city: 'Dayton', zip: '45402' });
  await step2(page); await settle(page);
  await page.click('#lp-submit');
  await page.waitForSelector('#lp-failure:not([hidden])');
  assert.match(await page.textContent('#lp-failure-text'), /Your details have not been sent/);
  assert.equal(leadCalls().length, 0);
  await ctx.close();
});

/* ---------------- measurement ---------------- */
await test('phone_click is an interaction event and never a lead; phone number is configurable', async () => {
  const { page, ctx } = await open('florida', 390, { overrides: { intakeBase: INTAKE, phoneDigits: '8135550100', phoneDisplay: '813-555-0100' } });
  const hrefs = await page.$$eval('a[data-call]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
  assert.deepEqual(hrefs, ['tel:+18135550100']);
  const shown = await page.evaluate(() => {
    document.querySelectorAll('[hidden]').forEach((el) => { el.hidden = false; });
    document.querySelectorAll('details').forEach((d) => { d.open = true; });
    return document.body.innerText + ' ' + [...document.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label')).join(' ');
  });
  assert.equal(shown.includes('407-917-3347'), false, 'old number still shown somewhere');
  assert.ok(shown.includes('813-555-0100'));
  await page.$eval('.lp-header a[data-call]', (a) => { a.addEventListener('click', (e) => e.preventDefault()); a.click(); });
  const clicks = await events(page, 'phone_click');
  assert.deepEqual(clicks.map((e) => e.link_location), ['header']);
  assert.equal((await events(page, 'lead_submitted')).length, 0);
  await ctx.close();
});

await test('no tag loads without an ID; GTM loads when configured; Global Privacy Control is respected', async () => {
  for (const [label, opts, want] of [
    ['no ids', {}, 0],
    ['gtm id', { overrides: { intakeBase: INTAKE, gtmId: 'GTM-TEST123' } }, 1],
    ['gtm id with GPC', { overrides: { intakeBase: INTAKE, gtmId: 'GTM-TEST123' },
      init: () => { Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }); } }, 0]]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 720 } });
    const page = await ctx.newPage();
    const hits = [];
    await page.route(/googletagmanager\.com|google-analytics\.com|doubleclick\.net|googleadservices\.com/, (r) => { hits.push(r.request().url()); r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); });
    await page.addInitScript((o) => { window.MH_LANDING_OVERRIDES = o; }, opts.overrides || { intakeBase: INTAKE });
    if (opts.init) await page.addInitScript(opts.init);
    await page.goto(SITE + '/sell-your-house/florida/', { waitUntil: 'networkidle' });
    assert.equal(hits.length, want, label + ': ' + hits.join(' '));
    if (want) assert.match(hits[0], /gtm\.js\?id=GTM-TEST123/);
    await ctx.close();
  }
});

await test('Google Ads conversion (no GTM) fires only on an accepted lead', async () => {
  resetIntake();
  const { page, ctx } = await open('florida', 390, { overrides: { intakeBase: INTAKE, googleAdsId: 'AW-000TEST', googleAdsLeadLabel: 'LABEL1' } });
  const conv = () => page.evaluate(() => window.dataLayer.filter((e) => e && e[0] === 'event' && e[1] === 'conversion').map((e) => e[2]));
  await step1(page); await step2(page); await settle(page);
  assert.deepEqual(await conv(), []);
  await page.click('#lp-submit');
  await page.waitForSelector('#lp-success:not([hidden])');
  const c = await conv();
  assert.equal(c.length, 1);
  assert.equal(c[0].send_to, 'AW-000TEST/LABEL1');
  assert.deepEqual(Object.keys(c[0]).sort(), ['send_to', 'transaction_id']);
  await ctx.close();
});

/* ---------------- accessibility and weight ---------------- */
await test('accessibility: landmarks, one h1, heading order, labels, keyboard reach, focus visible', async () => {
  const { page, ctx } = await open('ohio', 1440);
  assert.equal(await page.locator('h1').count(), 1);
  for (const sel of ['header', 'main', 'footer']) assert.equal(await page.locator(sel).count(), 1, sel);
  const levels = await page.$$eval('h1, h2, h3', (hs) => hs.filter((h) => h.offsetParent !== null).map((h) => +h.tagName[1]));
  for (let i = 1; i < levels.length; i += 1) assert.ok(levels[i] - levels[i - 1] <= 1, 'heading level jumps at ' + i);
  assert.equal(await page.$$eval('img', (is) => is.filter((i) => !i.getAttribute('alt')).length), 0, 'images without alt');
  assert.equal(await page.$$eval('input, select', (els) => els.filter((el) => !document.querySelector(`label[for="${el.id}"]`)).length), 0, 'controls without a label');
  assert.equal(await page.getAttribute('html', 'lang'), 'en');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'lp-skip');
  const seen = [];
  for (let i = 0; i < 9; i += 1) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => document.activeElement.id || document.activeElement.textContent.trim().slice(0, 20)));
  }
  for (const id of ['street', 'city', 'state', 'zip', 'lp-continue']) assert.ok(seen.includes(id), 'keyboard cannot reach ' + id + ': ' + seen.join(', '));
  await page.focus('#lp-continue');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
  const outline = await page.$eval('#lp-continue', (el) => getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth);
  assert.match(outline, /solid 3px/, 'focus ring: ' + outline);
  const faq = page.locator('.lp-faq details').first();
  await faq.locator('summary').focus(); await page.keyboard.press('Enter');
  assert.equal(await faq.getAttribute('open'), '');
  await ctx.close();
});

if (process.env.AXE_PATH) {
  for (const variant of Object.keys(PAGES)) for (const width of [390, 1440]) {
    await test(`axe ${variant} ${width}px: WCAG 2 A/AA, each form state`, async () => {
      resetIntake();
      const { page, ctx } = await open(variant, width);
      await page.addScriptTag({ path: process.env.AXE_PATH });
      const run = async (label) => {
        const r = await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }));
        const v = r.violations.map((x) => x.id + ' (' + x.nodes.length + '): ' + x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | '));
        assert.deepEqual(v, [], label);
      };
      await run('step 1');
      await page.click('#lp-continue'); await run('step 1 errors');
      await step1(page); await page.click('#lp-submit'); await run('step 2 errors');
      await step2(page); await settle(page); await page.click('#lp-submit');
      await page.waitForSelector('#lp-success:not([hidden])'); await run('success');
      await page.$$eval('.lp-faq details', (ds) => ds.forEach((d) => { d.open = true; })); await run('faq open');
      await ctx.close();
    });
  }
}

await test('page weight: small first load, hero image under 100 KB on mobile', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const sizes = {};
  page.on('response', async (r) => { try { if (r.url().startsWith(SITE)) sizes[new URL(r.url()).pathname] = (await r.body()).length; } catch (ignore) {} });
  await page.goto(SITE + '/sell-your-house/florida/', { waitUntil: 'networkidle' });
  const total = Object.values(sizes).reduce((a, b) => a + b, 0);
  const images = Object.entries(sizes).filter(([k]) => /\.(webp|png|jpg)$/.test(k));
  assert.ok(total < 260000, 'first load ' + total + ' bytes: ' + JSON.stringify(sizes));
  const hero = images.find(([k]) => k.includes('broward'));
  assert.ok(hero && hero[1] < 100000, 'hero ' + JSON.stringify(hero));
  assert.equal(images.some(([k]) => k.includes('tampa')), false, 'below-the-fold image must load lazily');
  console.log('     first load ' + Math.round(total / 1024) + ' KB uncompressed, same-origin');
  await ctx.close();
});

/* ---------------- previews ---------------- */
if (process.env.SHOTS) {
  fs.mkdirSync(process.env.SHOTS, { recursive: true });
  for (const variant of Object.keys(PAGES)) for (const [width, name] of [[390, 'mobile'], [1440, 'desktop']]) {
    const { page, ctx } = await open(variant, width, { scale: 2 });
    await page.$$eval('img[loading=lazy]', (is) => is.forEach((i) => { i.loading = 'eager'; }));
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(process.env.SHOTS, `${variant}-${name}-top.png`) });
    await page.screenshot({ path: path.join(process.env.SHOTS, `${variant}-${name}-full.png`), fullPage: true });
    if (width === 390) {
      await step1(page, variant === 'ohio' ? { street: '55 Oak Ave', city: 'Dayton', zip: '45402' } : {}); await page.locator('#offer-form').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(process.env.SHOTS, `${variant}-mobile-step2.png`) });
      await page.click('#lp-submit'); await page.locator('#offer-form').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(process.env.SHOTS, `${variant}-mobile-errors.png`) });
      resetIntake(); await step2(page); await settle(page); await page.click('#lp-submit');
      await page.waitForSelector('#lp-success:not([hidden])'); await page.locator('#offer-form').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(process.env.SHOTS, `${variant}-mobile-success.png`) });
    }
    await ctx.close();
  }
  console.log('previews saved to ' + process.env.SHOTS);
}

await browser.close(); site.close(); intake.close();
console.log('\n' + passed + ' passed, ' + failures.length + ' failed');
if (failures.length) { console.log(failures.map((f) => ' - ' + f).join('\n')); process.exit(1); }
