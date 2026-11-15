/* Reuses MaliHaus's native HighLevel external-form integration.
 * An acknowledged GHL intake is NOT a verified REsimpli lead.
 */
(() => {
  'use strict';
  const cfg = window.MHIntegration || {};
  const core = window.MHIntakeCore;
  const form = document.getElementById('offer-form');
  const production = (cfg.allowedOrigins || []).includes(location.origin);
  const live = cfg.deliveryEnabled === true && production;
  let inFlight, nativeSubmit = false, ack, dispatched = false, sdkLoaded = false;
  const originalFetch = window.fetch;
  const labels = {first_name:'First Name',last_name:'Last Name',phone:'Phone',email:'Email',address:'Street Address',city:'City',state:'State',postal_code:'Postal Code',property_ownership:'Property Ownership',property_condition:'Property Condition',desired_selling_timeframe:'Desired Selling Timeframe',phonetext_contact_permission:'Phone/Text Contact Permission',human_followup_requested:'Human Follow-Up Requested',lead_source:'Lead Source',conversation_summary:'Conversation Summary'};
  let source = core.attribution(location.href);
  source.landing_at = new Date().toISOString();
  // Keep attribution in memory until the form is sent. No contact data is stored.
  if (live) form.id = cfg.formId;
  document.addEventListener('submit', event => {
    if (!live || event.target !== form || nativeSubmit) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    form.dispatchEvent(new CustomEvent('mh-request-submit'));
  }, true);
  if (live) window.fetch = function (url, options) {
    let ours = false;
    try {
      if (String(url) === 'https://backend.leadconnectorhq.com/external-tracking/events') {
        const event = JSON.parse(options.body);
        ours = event.type === 'external_form_submission' && event.formId === cfg.formId && event.trackingId === cfg.ghlTrackingId;
      }
    } catch (_) {}
    return originalFetch.apply(this, arguments).then(response => {
      if (ours && response.ok && dispatched) response.clone().json().then(body => {
        if (core.positiveAck(body) && ack) ack();
      }).catch(() => {});
      return response;
    });
  };
  function send(values) {
    if (production && !live) return Promise.reject(new Error('Online enquiries are temporarily unavailable. Your details have not been sent. Please call (407) 917-3347.'));
    if (!live) return Promise.resolve({preview:true});
    if (inFlight) return inFlight;
    const mapped = core.fields(values, source, new Date().toISOString(), location.pathname);
    inFlight = (async () => {
      const identity = JSON.stringify([mapped.first_name,mapped.last_name,mapped.phone,mapped.email,mapped.address,mapped.city,mapped.postal_code,mapped.property_ownership,mapped.property_condition,mapped.desired_selling_timeframe]);
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
      const key = 'mh_ppc_' + Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2,'0')).join('');
      let previous;
      try { previous = JSON.parse(sessionStorage.getItem(key)); } catch (_) {}
      if (previous && Date.now() - previous.at < 86400000) {
        if (previous.status === 'accepted') return {accepted:true, duplicate:true, destination:'ghl'};
        throw new Error('This enquiry is awaiting confirmation. Please call rather than submitting it again.');
      }
      const remember = status => {try {sessionStorage.setItem(key, JSON.stringify({status,at:Date.now()}));} catch (_) {}};
      remember('pending');
      const snapshot = JSON.parse(JSON.stringify(mapped));
      for (const input of form.querySelectorAll('input,select')) {
        if (input.type === 'checkbox' || input.tagName === 'SELECT') input.disabled = true;
        else input.readOnly = true;
        input.removeAttribute('name');
      }
      form.querySelectorAll('button').forEach(button => {button.disabled=true;});
      const details = document.createElement('details');
      details.className = 'intake-details';
      const title = document.createElement('summary');title.textContent='Your enquiry details';details.appendChild(title);
      for (const [name,value] of Object.entries(snapshot)) {
        if (!value) continue;
        const label=document.createElement('label');label.textContent=labels[name];
        const input=document.createElement('textarea');input.name=name;input.readOnly=true;input.value=value;
        label.appendChild(input);details.appendChild(label);
      }
      form.appendChild(details);
      return new Promise((resolve,reject) => {
        let settled=false;
        const finish=(error,result) => {if(settled)return;settled=true;clearTimeout(timer);ack=null;error?reject(error):resolve(result);};
        const unavailable=() => {
          if (dispatched) return;
          try {sessionStorage.removeItem(key);}catch(_){}
          finish(new Error('Online delivery is unavailable. Your enquiry has not been sent. Please call (407) 917-3347.'));
        };
        const timer=setTimeout(() => {
          if(!dispatched){unavailable();return;}
          finish(new Error('Delivery could not be confirmed. Your details may have arrived. Please call (407) 917-3347 rather than submitting again.'));
        },30000);
        ack=() => {remember('accepted');finish(null,{accepted:true,duplicate:false,destination:'ghl'});};
        function dispatch() {
          if(settled)return;
          dispatched=true;nativeSubmit=true;
          try {form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}
          finally {nativeSubmit=false;}
        }
        if (sdkLoaded) {dispatch();return;}
        const script=document.createElement('script');
        script.src='https://link.msgsndr.com/js/external-tracking.js';script.dataset.trackingId=cfg.ghlTrackingId;
        script.onload=() => {sdkLoaded=true;dispatch();};script.onerror=unavailable;
        document.body.appendChild(script);
      });
    })();
    return inFlight;
  }
  window.MHIntake = Object.freeze({send,live,production,get nativeSubmitting(){return nativeSubmit;},get attribution(){return {...source};}});
})();
