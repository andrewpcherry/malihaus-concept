/* MaliHaus lead intake: landing page -> this handler -> REsimpli Open API.
 *
 * Runs server side so the REsimpli API key never reaches a browser.
 * Written against the Web Fetch API (Request/Response/crypto.subtle), in
 * Cloudflare Workers module format. NOT DEPLOYED: see README.md.
 *
 * Routes
 *   POST /lead      create one lead in REsimpli, answer accepted or not
 *   POST /followup  add the optional answers as an activity note on that lead
 *   GET  /health    which settings are present (names only, never values)
 *
 * REsimpli facts used here, read from developer.resimpli.com on 2026-11-12:
 *   base   https://api.resimpli.com/api/v6/openapi
 *   POST   /lead/add       contactDetails{firstName,lastName,phoneNumbers[],emails[]},
 *                          propertyType, address, marketingCampignId (their spelling),
 *                          marketId, pipelineId, mainStatusId, tagIds, comment
 *   POST   /activity/add   moduleId (1 = Lead), subModuleId, comment
 *   auth   API key in the Authorization header
 *
 * NOT VERIFIED (no API key was available when this was written):
 *   - the JSON shape REsimpli returns from /lead/add, including where the new
 *     lead id sits. See interpret() and RESIMPLI_LEAD_ID_PATH.
 *   - whether the key needs a prefix such as "Bearer ". See RESIMPLI_AUTH_PREFIX.
 *   Run verify.mjs with the real key before going live.
 */

const DEFAULT_BASE = 'https://api.resimpli.com/api/v6/openapi';
const VARIANTS = { florida: 'FLORIDA', ohio: 'OHIO' };
const DAY = 86400;
const UPSTREAM_TIMEOUT_MS = 15000;
const MAX_BODY = 20000;
const MAX_PER_IP_PER_HOUR = 12;

const FOLLOWUP = {
  propertyType: ['Single-family house', 'Townhouse or duplex', 'Condo',
    'Multi-family (3 or more units)', 'Mobile or manufactured home', 'Vacant land', 'Other'],
  condition: ['Move-in ready', 'Needs some updating', 'Needs major repairs', 'Not sure'],
  timeline: ['As soon as possible', 'Within 1 to 3 months', 'In 3 to 6 months', 'No fixed date']
};

export default {
  fetch(request, env) { return handle(request, env); }
};

export async function handle(request, env, deps = {}) {
  const doFetch = deps.fetch || fetch;
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const allowed = list(env.ALLOWED_ORIGINS);
  const originOk = origin !== '' && allowed.includes(origin);
  const cors = originOk ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin'
  } : { 'Vary': 'Origin' };
  const reply = (status, body) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors }
  });

  if (request.method === 'GET' && url.pathname === '/health') {
    const missing = missingConfig(env);
    return reply(200, { ok: missing.length === 0, missing });
  }
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: originOk ? 204 : 403, headers: cors });
  }
  if (request.method !== 'POST') return reply(405, { ok: false, error: 'method_not_allowed' });
  if (!originOk) return reply(403, { ok: false, error: 'origin_not_allowed' });

  const missing = missingConfig(env);
  if (missing.length) return reply(503, { ok: false, error: 'not_configured', missing });

  let data;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return reply(413, { ok: false, error: 'too_large' });
    data = JSON.parse(text);
  } catch (ignore) {
    return reply(400, { ok: false, error: 'bad_json' });
  }
  if (!data || typeof data !== 'object') return reply(400, { ok: false, error: 'bad_json' });

  if (url.pathname === '/lead') return lead(data, request, env, doFetch, reply);
  if (url.pathname === '/followup') return followup(data, env, doFetch, reply);
  return reply(404, { ok: false, error: 'not_found' });
}

/* ------------------------------------------------------------------ */

async function lead(data, request, env, doFetch, reply) {
  const v = validateLead(data);
  if (v.errors.length) return reply(422, { ok: false, error: 'invalid', fields: v.errors });
  const id = v.submissionId;
  const kv = env.LEADS_KV;

  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
  if (ip) {
    const bucket = 'ip:' + (await sha256(ip)).slice(0, 32) + ':' + Math.floor(Date.now() / 3600000);
    const count = parseInt((await kv.get(bucket)) || '0', 10);
    if (count >= MAX_PER_IP_PER_HOUR) return reply(429, { ok: false, error: 'rate_limited' });
    await kv.put(bucket, String(count + 1), { expirationTtl: 7200 });
  }

  /* Same submission id seen before: answer from the record, never re-send. */
  const subKey = 'sub:' + id;
  const prior = parse(await kv.get(subKey));
  if (prior) {
    if (prior.status === 'delivered') {
      return reply(200, { ok: true, accepted: true, submissionId: id, duplicate: false, replayed: true });
    }
    if (prior.status === 'pending' && Date.now() - prior.at < 60000) {
      return reply(409, { ok: false, error: 'in_progress' });
    }
    if (prior.status === 'unconfirmed') {
      return reply(409, { ok: false, error: 'unconfirmed' });
    }
  }

  /* Same phone and property within 24 hours from another submission id. */
  const fpKey = 'fp:' + await sha256(v.phone + '|' + normalise(v.address));
  const twin = parse(await kv.get(fpKey));
  if (twin && twin.id !== id) {
    return reply(200, { ok: true, accepted: true, submissionId: id, duplicate: true });
  }

  await kv.put(subKey, JSON.stringify({ status: 'pending', at: Date.now() }), { expirationTtl: DAY });

  const suffix = VARIANTS[v.variant];
  const body = {
    contactDetails: {
      firstName: v.firstName,
      lastName: v.lastName,
      phoneNumbers: [{ phoneNumber: v.phone, isPrimary: true }]
    },
    propertyType: 'residential',
    address: v.address,
    marketingCampignId: env['RESIMPLI_CAMPAIGN_ID_' + suffix],
    marketId: env['RESIMPLI_MARKET_ID_' + suffix],
    pipelineId: env.RESIMPLI_PIPELINE_ID,
    mainStatusId: env.RESIMPLI_MAIN_STATUS_ID,
    comment: comment(v)
  };
  if (v.email) body.contactDetails.emails = [{ email: v.email, isPrimary: true }];
  const tags = list(env['RESIMPLI_TAG_IDS_' + suffix]);
  if (tags.length) body.tagIds = tags;

  const result = await resimpli('/lead/add', body, env, doFetch);

  if (result.state === 'accepted') {
    await kv.put(subKey, JSON.stringify({ status: 'delivered', at: Date.now(), leadId: result.leadId }),
      { expirationTtl: DAY });
    await kv.put(fpKey, JSON.stringify({ id }), { expirationTtl: DAY });
    return reply(200, { ok: true, accepted: true, submissionId: id, duplicate: false });
  }
  if (result.state === 'refused') {
    await kv.delete(subKey);
    console.log('resimpli refused lead', result.status);
    return reply(502, { ok: false, error: 'crm_refused' });
  }
  /* Timeout, network failure, or a reply we cannot read as an acceptance.
     The lead may or may not exist, so this id is never sent again. */
  await kv.put(subKey, JSON.stringify({ status: 'unconfirmed', at: Date.now() }), { expirationTtl: DAY });
  console.log('resimpli unconfirmed lead', result.status || 'no response');
  return reply(504, { ok: false, error: 'unconfirmed' });
}

async function followup(data, env, doFetch, reply) {
  const id = String(data.submissionId || '');
  if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) return reply(422, { ok: false, error: 'invalid' });
  const answers = data.answers && typeof data.answers === 'object' ? data.answers : {};
  const lines = [];
  for (const key of Object.keys(FOLLOWUP)) {
    const value = answers[key];
    if (value == null || value === '') continue;
    if (!FOLLOWUP[key].includes(value)) return reply(422, { ok: false, error: 'invalid' });
    lines.push(LABELS[key] + ': ' + value);
  }
  if (!lines.length) return reply(422, { ok: false, error: 'empty' });

  const kv = env.LEADS_KV;
  const record = parse(await kv.get('sub:' + id));
  if (!record || record.status !== 'delivered') return reply(404, { ok: false, error: 'unknown_submission' });
  if (!record.leadId) return reply(501, { ok: false, error: 'followup_unavailable' });
  if (await kv.get('fu:' + id)) return reply(200, { ok: true, replayed: true });

  const result = await resimpli('/activity/add', {
    moduleId: 1,
    subModuleId: record.leadId,
    comment: 'Answers added by the seller on the website after requesting an offer:\n' + lines.join('\n')
  }, env, doFetch, false);
  if (result.state !== 'accepted') return reply(502, { ok: false, error: 'crm_refused' });
  await kv.put('fu:' + id, '1', { expirationTtl: DAY });
  return reply(200, { ok: true });
}

const LABELS = { propertyType: 'Property type', condition: 'Condition', timeline: 'Preferred timing' };

/* ------------------------------------------------------------------ */

async function resimpli(path, body, env, doFetch, needLeadId = true) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await doFetch((env.RESIMPLI_API_BASE || DEFAULT_BASE) + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': (env.RESIMPLI_AUTH_PREFIX || '') + env.RESIMPLI_API_KEY
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    let json = null;
    try { json = await res.json(); } catch (ignore) {}
    return interpret(res.status, json, env, needLeadId);
  } catch (ignore) {
    return { state: 'unconfirmed' };
  } finally {
    clearTimeout(timer);
  }
}

/* Decide whether REsimpli accepted the call.
   UNVERIFIED: the success envelope is not published. This fails closed:
   a /lead/add reply counts as accepted only when the HTTP status is 2xx,
   the body carries no failure marker, AND a lead id can be found. */
export function interpret(status, json, env, needLeadId) {
  if (status >= 400 && status < 500) return { state: 'refused', status };
  if (status < 200 || status >= 300) return { state: 'unconfirmed', status };
  if (json && typeof json === 'object') {
    for (const key of ['statusCode', 'status', 'code']) {
      const n = json[key];
      if (typeof n === 'number' && n >= 400 && n < 500) return { state: 'refused', status: n };
      if (typeof n === 'number' && n >= 500) return { state: 'unconfirmed', status: n };
    }
    if (json.success === false || json.error) return { state: 'refused', status };
  }
  const leadId = findLeadId(json, env.RESIMPLI_LEAD_ID_PATH);
  if (needLeadId && !leadId) return { state: 'unconfirmed', status };
  return { state: 'accepted', status, leadId };
}

function findLeadId(json, configuredPath) {
  if (!json || typeof json !== 'object') return '';
  const paths = configuredPath ? [configuredPath] :
    ['data._id', 'data.leadId', 'data.id', 'data.lead._id', '_id', 'leadId', 'id'];
  for (const path of paths) {
    let node = json;
    for (const part of path.split('.')) node = node && typeof node === 'object' ? node[part] : undefined;
    if (typeof node === 'string' && /^[a-f0-9]{24}$/i.test(node)) return node;
  }
  return '';
}

/* ------------------------------------------------------------------ */

function validateLead(d) {
  const errors = [];
  const s = (x, max) => String(x == null ? '' : x).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  const p = d.property || {}, c = d.contact || {}, consent = d.consent || {};
  const out = {
    submissionId: s(d.submissionId, 80),
    variant: s(d.variant, 20),
    pageId: s(d.pageId, 80),
    street: s(p.street, 120), city: s(p.city, 80), state: s(p.state, 2).toUpperCase(), zip: s(p.zip, 10),
    name: s(c.name, 100), phone: s(c.phone, 20).replace(/\D/g, ''), email: s(c.email, 160),
    marketing: consent.marketing === true,
    consentText: s(consent.contactText, 400), marketingText: s(consent.marketingText, 900),
    consentVersion: s(consent.version, 40), consentAt: s(consent.at, 40),
    pageUrl: s((d.page || {}).url, 300), submittedAt: s((d.page || {}).submittedAt, 40),
    attribution: {}
  };
  const a = d.attribution && typeof d.attribution === 'object' ? d.attribution : {};
  for (const key of ATTR_KEYS) if (a[key]) out.attribution[key] = s(a[key], key === 'landingUrl' ? 1000 : 300);

  if (!/^[A-Za-z0-9-]{8,80}$/.test(out.submissionId)) errors.push('submissionId');
  if (!VARIANTS[out.variant]) errors.push('variant');
  if (!(/[A-Za-z]/.test(out.street) && /\d/.test(out.street) && out.street.length >= 5)) errors.push('street');
  if (!/[A-Za-z]{2,}/.test(out.city)) errors.push('city');
  if (!/^[A-Z]{2}$/.test(out.state)) errors.push('state');
  if (!/^\d{5}(-\d{4})?$/.test(out.zip)) errors.push('zip');
  if (!(/[A-Za-z]/.test(out.name) && out.name.length >= 2)) errors.push('name');
  if (out.phone.length === 11 && out.phone[0] === '1') out.phone = out.phone.slice(1);
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(out.phone)) errors.push('phone');
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out.email)) errors.push('email');
  if (consent.contact !== true) errors.push('consent');
  /* Automated submissions: a filled trap field, or a form completed faster
     than a person can type. Refused openly, never shown as a success. */
  if (s(d.hp, 10) !== '') errors.push('rejected');
  if (typeof d.elapsedMs === 'number' && d.elapsedMs < 1500) errors.push('rejected');

  const parts = out.name.split(/\s+/);
  out.firstName = parts[0] || '';
  out.lastName = parts.slice(1).join(' ');
  out.address = out.street + ', ' + out.city + ', ' + out.state + ' ' + out.zip;
  out.errors = errors;
  return out;
}

const ATTR_KEYS = ['gclid', 'gbraid', 'wbraid', 'gad_source', 'gad_campaignid', 'utm_source',
  'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'campaignid', 'adgroupid',
  'keyword', 'matchtype', 'device', 'network', 'creative', 'landingUrl', 'referrer', 'firstSeenAt'];

function comment(v) {
  const lines = [
    'Website offer request (Google Ads landing page)',
    'Landing page variant: ' + v.variant,
    'Landing page: ' + (v.pageUrl || 'not supplied'),
    'Submitted: ' + (v.submittedAt || new Date().toISOString()),
    'Submission ID: ' + v.submissionId,
    '',
    'Attribution'
  ];
  const keys = Object.keys(v.attribution);
  if (!keys.length) lines.push('none captured');
  for (const key of keys) lines.push(key + ': ' + v.attribution[key]);
  lines.push('', 'Consent',
    'Contact request acknowledged: yes (' + (v.consentAt || 'time not supplied') + ', wording version ' +
      (v.consentVersion || 'not supplied') + ')',
    'Wording shown: ' + (v.consentText || 'not supplied'),
    'Marketing calls and texts: ' + (v.marketing ? 'YES, permission given' : 'NO, permission not given'));
  if (v.marketing) lines.push('Marketing wording shown: ' + v.marketingText);
  return lines.join('\n');
}

function missingConfig(env) {
  const need = ['RESIMPLI_API_KEY', 'RESIMPLI_PIPELINE_ID', 'RESIMPLI_MAIN_STATUS_ID',
    'RESIMPLI_MARKET_ID_FLORIDA', 'RESIMPLI_MARKET_ID_OHIO',
    'RESIMPLI_CAMPAIGN_ID_FLORIDA', 'RESIMPLI_CAMPAIGN_ID_OHIO', 'ALLOWED_ORIGINS'];
  const missing = need.filter((name) => !env[name]);
  if (!env.LEADS_KV) missing.push('LEADS_KV');
  return missing;
}

function list(value) {
  return String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
}
function parse(text) {
  try { return text ? JSON.parse(text) : null; } catch (ignore) { return null; }
}
function normalise(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]/g, '');
}
async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
