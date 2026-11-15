/* Shared lead contract. No credentials or network requests. */
(function (root) {
  'use strict';
  const attributionKeys = ['utm_source','utm_medium','utm_campaign','utm_id','utm_term','utm_content','gclid','gbraid','wbraid','campaignid','adgroupid','keyword','matchtype','device','network','creative'];
  function attribution(url, previous = {}) {
    const parsed = new URL(url);
    const result = {...previous};
    for (const key of attributionKeys) {
      const value = parsed.searchParams.get(key);
      if (value && value.length <= 500) result[key] = value;
    }
    return result;
  }
  function measurementChoice(choice = {}) {
    const at = typeof choice.at === 'string' && Number.isFinite(Date.parse(choice.at)) ? choice.at : null;
    return {
      analytics: at !== null && choice.analytics === true,
      advertising: at !== null && choice.advertising === true,
      ad_personalization: false,
      at,
      notice_version: 'mh-measurement-v1'
    };
  }
  function fields(values, source, consentAt, pagePath, measurement = {}) {
    const name = String(values.name || '').trim().split(/\s+/);
    const phone = String(values.phone || '').replace(/\D/g, '');
    const normalized = phone.length === 10 ? '+1' + phone : '+' + phone;
    if (!values.contact_permission || !values.address || !values.city || !/^\d{5}$/.test(values.zip) || !name[0] || !/^\+1\d{10}$/.test(normalized)) throw new Error('Please complete the required contact and property details.');
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) throw new Error('Please check your email address.');
    const details = {
      page_id: 'mh_google_cash_offer_florida_v1', market: 'Florida', page: pagePath, enquiry_at: consentAt,
      property_address: values.address, city: values.city, state: 'FL', zip: values.zip,
      ownership: values.ownership, condition: values.condition, timeline: values.timeline,
      contact_permission: {enquiry_call: true, marketing_sms: false, at: consentAt},
      measurement_choice: measurementChoice(measurement),
      attribution: source
    };
    return {
      first_name: name.shift(), last_name: name.join(' '), phone: normalized, email: values.email || '',
      address: values.address, city: values.city, state: 'FL', postal_code: values.zip,
      property_ownership: values.ownership, property_condition: values.condition,
      desired_selling_timeframe: values.timeline,
      phonetext_contact_permission: 'Permission to call about this enquiry: ' + consentAt + '. Marketing SMS permission not given.',
      human_followup_requested: 'Yes',
      lead_source: source.gclid || source.gbraid || source.wbraid || (source.utm_source === 'google' && /^(cpc|ppc|paidsearch)$/i.test(source.utm_medium || '')) ? 'Google Ads - Florida' : 'Website - Florida',
      conversation_summary: 'Florida cash-offer enquiry\n' + JSON.stringify(details, null, 2)
    };
  }
  function analytics(event, extra = {}) {
    const allowed = ['step', 'placement', 'delivery_destination'];
    const clean = {event, page_id:'mh_google_cash_offer_florida_v1', market:'florida'};
    for (const k of allowed) if (['string','number','boolean'].includes(typeof extra[k])) clean[k] = extra[k];
    return clean;
  }
  function positiveAck(body) { return !!body && body.status === 'ok'; }
  const api = {attribution, fields, analytics, positiveAck, attributionKeys, measurementChoice};
  root.MHIntakeCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
