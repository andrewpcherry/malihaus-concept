/* MaliHaus paid-search landing pages: form, attribution and measurement.
   Loaded only by /sell-your-house/<state>/. Configuration: landing-config.js.

   Rules this file enforces:
   - Success is shown ONLY after the intake server answers
     {ok:true, accepted:true} for this exact submission id.
   - lead_submitted fires once per accepted, non-duplicate submission.
   - No name, phone, email, address or free text ever goes into dataLayer,
     gtag, the URL or browser storage. */
(function () {
  'use strict';

  var CFG = {};
  var k;
  for (k in (window.MH_LANDING || {})) CFG[k] = window.MH_LANDING[k];
  for (k in (window.MH_LANDING_OVERRIDES || {})) CFG[k] = window.MH_LANDING_OVERRIDES[k];

  var body = document.body;
  var VARIANT = body.getAttribute('data-lp-variant') || '';
  var PAGE_ID = body.getAttribute('data-lp-id') || '';
  var $ = function (id) { return document.getElementById(id); };
  var each = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), fn); };

  /* ------------------------------------------------------------------
     Measurement. Events always queue into dataLayer. A tag loads only
     when an ID is configured.
     ------------------------------------------------------------------ */
  window.dataLayer = window.dataLayer || [];
  var SAFE_KEYS = { step: 1, step_name: 1, link_location: 1, reason: 1, submission_id: 1 };

  function track(event, params) {
    var row = { event: event, lp_variant: VARIANT, lp_id: PAGE_ID };
    for (var key in (params || {})) if (SAFE_KEYS[key]) row[key] = params[key];
    window.dataLayer.push(row);
    return row;
  }

  var gpcBlocks = CFG.respectGlobalPrivacyControl !== false && navigator.globalPrivacyControl === true;
  var gtagOn = false;

  function loadScript(src) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  function startMeasurement() {
    if (gpcBlocks) return;
    if (CFG.gtmId) {
      window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
      loadScript('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(CFG.gtmId));
    } else if (CFG.googleAdsId) {
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', CFG.googleAdsId);
      loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(CFG.googleAdsId));
      gtagOn = true;
    }
  }

  function adsConversion(submissionId) {
    if (!gtagOn || !CFG.googleAdsLeadLabel) return;
    window.gtag('event', 'conversion', {
      send_to: CFG.googleAdsId + '/' + CFG.googleAdsLeadLabel,
      transaction_id: submissionId
    });
  }

  /* ------------------------------------------------------------------
     Attribution. Captured from the landing URL, kept for the session,
     sent to the server with the lead. Never contains personal details.
     ------------------------------------------------------------------ */
  var ATTR_KEYS = ['gclid', 'gbraid', 'wbraid', 'gad_source', 'gad_campaignid',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
    'campaignid', 'adgroupid', 'keyword', 'matchtype', 'device', 'network', 'creative'];

  function readAttribution() {
    var found = {};
    var hasNew = false;
    try {
      var q = new URLSearchParams(location.search);
      ATTR_KEYS.forEach(function (key) {
        var v = q.get(key);
        if (v) { found[key] = String(v).slice(0, 200); hasNew = true; }
      });
    } catch (ignore) {}
    var stored = null;
    try { stored = JSON.parse(sessionStorage.getItem('mh_lp_attr')); } catch (ignore) {}
    if (stored && !hasNew) return stored;
    found.landingUrl = (location.origin + location.pathname + location.search).slice(0, 1000);
    found.referrer = (document.referrer || '').slice(0, 500);
    found.firstSeenAt = new Date().toISOString();
    try { sessionStorage.setItem('mh_lp_attr', JSON.stringify(found)); } catch (ignore) {}
    return found;
  }
  var ATTRIBUTION = readAttribution();

  /* ------------------------------------------------------------------
     Config driven text: phone, legal links, consent wording.
     ------------------------------------------------------------------ */
  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function applyConfig() {
    var tel = 'tel:+1' + CFG.phoneDigits;
    each('[data-call]', function (a) {
      a.setAttribute('href', tel);
      if (a.hasAttribute('aria-label')) a.setAttribute('aria-label', 'Call MaliHaus on ' + CFG.phoneDisplay);
    });
    each('[data-phone]', function (el) { el.textContent = CFG.phoneDisplay; });
    each('[data-legal]', function (el) { if (CFG.legalLine) el.textContent = CFG.legalLine; });
    each('[data-address]', function (el) { if (CFG.addressLine) el.textContent = CFG.addressLine; });
    each('[data-privacy]', function (a) { a.setAttribute('href', CFG.privacyUrl); });
    each('[data-terms]', function (a) { a.setAttribute('href', CFG.termsUrl); });

    var label = esc(CFG.consentCheckboxLabel || '');
    label = label.replace('Terms &amp; Conditions',
      '<a href="' + esc(CFG.termsUrl) + '" target="_blank" rel="noopener">Terms &amp; Conditions</a>');
    label = label.replace('Privacy Policy',
      '<a href="' + esc(CFG.privacyUrl) + '" target="_blank" rel="noopener">Privacy Policy</a>');
    $('lp-consent-text').innerHTML = label + ' ' + esc(CFG.consentDisclosure || '');
    $('lp-marketing-text').textContent = CFG.marketingConsentDisclosure || '';
  }

  /* ------------------------------------------------------------------
     Validation
     ------------------------------------------------------------------ */
  function digits(v) { return String(v || '').replace(/\D/g, ''); }

  function phone10(v) {
    var d = digits(v);
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    return /^[2-9]\d{2}[2-9]\d{6}$/.test(d) ? d : '';
  }

  var RULES = {
    street: function (v) {
      return (/[A-Za-z]/.test(v) && /\d/.test(v) && v.length >= 5) ? '' :
        'Enter the street number and street name, for example 123 Main St.';
    },
    city: function (v) { return /[A-Za-z]{2,}/.test(v) ? '' : 'Enter the city or town.'; },
    state: function (v) { return /^[A-Z]{2}$/.test(v) ? '' : 'Choose the state.'; },
    zip: function (v) { return /^\d{5}(-\d{4})?$/.test(v) ? '' : 'Enter a 5 digit ZIP code.'; },
    name: function (v) { return (/[A-Za-z]/.test(v) && v.length >= 2) ? '' : 'Enter your name.'; },
    phone: function (v) {
      return phone10(v) ? '' : 'Enter a 10 digit US phone number, for example 407 555 0123.';
    },
    email: function (v) {
      return (!v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) ? '' :
        'Check the email address, or leave it empty.';
    },
    consent: function (v, el) {
      return el.checked ? '' : 'Tick this box so we are able to contact you about your request.';
    }
  };
  var STEP_FIELDS = { 1: ['street', 'city', 'state', 'zip'], 2: ['name', 'phone', 'email', 'consent'] };

  function value(id) { return String($(id).value || '').trim(); }

  function setError(id, message) {
    var el = $(id), err = $(id + '-err');
    if (message) {
      el.setAttribute('aria-invalid', 'true');
      err.textContent = message;
      err.hidden = false;
    } else {
      el.removeAttribute('aria-invalid');
      err.textContent = '';
      err.hidden = true;
    }
  }

  function validateStep(step) {
    var bad = [];
    STEP_FIELDS[step].forEach(function (id) {
      var message = RULES[id](value(id), $(id));
      setError(id, message);
      if (message) bad.push(id);
    });
    var box = $('lp-form-error');
    if (bad.length) {
      box.textContent = bad.length === 1 ? 'Please check the highlighted field.' :
        'Please check the ' + bad.length + ' highlighted fields.';
      box.hidden = false;
      $(bad[0]).focus();
    } else {
      box.hidden = true;
      box.textContent = '';
    }
    return !bad.length;
  }

  /* ------------------------------------------------------------------
     Form state and steps
     ------------------------------------------------------------------ */
  var state = { step: 1, started: false, sending: false, done: false, id: newId(),
    lastSig: '', definiteFailure: false, loadedAt: Date.now() };

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'lp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function showStep(step, focusId) {
    state.step = step;
    $('lp-step-1').hidden = step !== 1;
    $('lp-step-2').hidden = step !== 2;
    $('lp-progress').textContent = step === 1 ? 'Step 1 of 2: the property' :
      'Step 2 of 2: your contact details';
    $('lp-form-error').hidden = true;
    if (step === 2) {
      $('lp-address-summary').textContent = 'Property: ' + value('street') + ', ' + value('city') +
        ', ' + value('state') + ' ' + value('zip');
    }
    if (focusId) $(focusId).focus();
  }

  function goContinue() {
    if (!validateStep(1)) return;
    track('form_step_completed', { step: 1, step_name: 'property_address' });
    showStep(2, 'name');
  }

  function payload() {
    var marketing = $('marketing').checked;
    var now = new Date().toISOString();
    return {
      submissionId: state.id,
      variant: VARIANT,
      pageId: PAGE_ID,
      property: { street: value('street'), city: value('city'), state: value('state'), zip: value('zip') },
      contact: { name: value('name'), phone: phone10(value('phone')), email: value('email') },
      consent: {
        contact: true,
        contactText: (CFG.consentCheckboxLabel || '') + ' ' + (CFG.consentDisclosure || ''),
        marketing: marketing,
        marketingText: marketing ? (CFG.marketingConsentDisclosure || '') : '',
        version: CFG.consentVersion || '',
        at: now
      },
      attribution: ATTRIBUTION,
      page: { url: location.origin + location.pathname, submittedAt: now },
      hp: $('company-website').value || '',
      elapsedMs: Date.now() - state.loadedAt
    };
  }

  function setSending(on) {
    state.sending = on;
    var b = $('lp-submit');
    b.disabled = on;
    b.textContent = on ? 'Sending your request…' : 'Request My Offer';
    $('lp-back').disabled = on;
    $('lp-retry').disabled = on;
    $('lp-retry').textContent = on ? 'Sending…' : 'Try again';
  }

  var FAILURES = {
    not_configured: 'Online requests are not available right now. Your details have not been sent. Please call us on {phone} and we will take the details by phone.',
    network: 'We could not reach our system, so your request has not been confirmed. Your details are still here. Please try again, or call us on {phone}.',
    timeout: 'Our system took too long to answer, so your request has not been confirmed. Your details are still here. Please try again, or call us on {phone}.',
    unconfirmed: 'We could not confirm that your request reached us. To be safe, please call us on {phone} so we can make sure we have it.',
    in_progress: 'Your request is still being processed. Please wait a moment and try again, or call us on {phone}.',
    rejected: 'Some of the details could not be accepted. Please check them and try again, or call us on {phone}.',
    server: 'Something went wrong on our side and your request was not sent. Your details are still here. Please try again, or call us on {phone}.'
  };

  function showFailure(kind) {
    setSending(false);
    state.definiteFailure = kind === 'rejected' || kind === 'server';
    $('lp-failure-text').textContent = (FAILURES[kind] || FAILURES.server).replace('{phone}', CFG.phoneDisplay);
    $('lp-retry').hidden = kind === 'not_configured' || kind === 'unconfirmed';
    $('lp-edit').hidden = kind === 'not_configured' || kind === 'unconfirmed';
    $('lp-form').hidden = true;
    $('lp-failure').hidden = false;
    $('lp-failure').focus();
    track('lead_submit_failed', { reason: kind });
  }

  function showSuccess(response) {
    setSending(false);
    state.done = true;
    var first = value('name').split(/\s+/)[0];
    if (first) $('lp-success-title').textContent = 'Thank you, ' + first + '. We have your request.';
    $('lp-form').hidden = true;
    $('lp-failure').hidden = true;
    $('lp-success').hidden = false;
    $('lp-success').focus();
    updateBar();

    var key = 'mh_lp_sent_' + state.id;
    var already = false;
    try { already = sessionStorage.getItem(key) === '1'; } catch (ignore) {}
    if (!response.duplicate && !already && !state.counted) {
      state.counted = true;
      try { sessionStorage.setItem(key, '1'); } catch (ignore) {}
      track('lead_submitted', { submission_id: state.id });
      adsConversion(state.id);
    }
  }

  function send() {
    if (state.sending || state.done) return;
    var data = payload();
    var sig = JSON.stringify([data.property, data.contact]);
    /* A definite server refusal followed by edited details is a new request. */
    if (state.definiteFailure && state.lastSig && sig !== state.lastSig) {
      state.id = newId();
      data.submissionId = state.id;
    }
    state.lastSig = sig;
    state.definiteFailure = false;

    if (!CFG.intakeBase) { showFailure('not_configured'); return; }
    setSending(true);

    var ctrl = window.AbortController ? new AbortController() : null;
    var timedOut = false;
    var timer = setTimeout(function () { timedOut = true; if (ctrl) ctrl.abort(); },
      CFG.requestTimeoutMs || 20000);

    fetch(String(CFG.intakeBase).replace(/\/+$/, '') + '/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': state.id },
      body: JSON.stringify(data),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (json) {
        clearTimeout(timer);
        if (res.ok && json && json.ok === true && json.accepted === true &&
            json.submissionId === state.id) {
          showSuccess(json);
        } else if (json && json.error === 'not_configured') {
          showFailure('not_configured');
        } else if (json && json.error === 'unconfirmed') {
          showFailure('unconfirmed');
        } else if (res.status === 409) {
          showFailure('in_progress');
        } else if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          showFailure('rejected');
        } else {
          showFailure('server');
        }
      });
    }).catch(function () {
      clearTimeout(timer);
      showFailure(timedOut ? 'timeout' : 'network');
    });
  }

  function onSubmit(ev) {
    ev.preventDefault();
    if (state.sending || state.done) return;
    if (state.step === 1) { goContinue(); return; }
    if (!validateStep(1)) { showStep(1); validateStep(1); return; }
    if (!validateStep(2)) return;
    track('form_step_completed', { step: 2, step_name: 'contact_details' });
    send();
  }

  /* ------------------------------------------------------------------
     Optional questions after a confirmed request. Never a second lead
     and never a conversion.
     ------------------------------------------------------------------ */
  function onFollowup(ev) {
    ev.preventDefault();
    var status = $('lp-followup-status');
    var btn = $('lp-followup-send');
    if (btn.disabled) return;
    var answers = {};
    var any = false;
    ['propertyType', 'condition', 'timeline'].forEach(function (key) {
      var v = $('fu-' + key).value;
      if (v) { answers[key] = v; any = true; }
    });
    if (!any) { status.textContent = 'Choose at least one answer, or simply leave this page. Your request is already in.'; return; }
    btn.disabled = true;
    status.textContent = 'Adding your answers…';
    fetch(String(CFG.intakeBase).replace(/\/+$/, '') + '/followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId: state.id, answers: answers })
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (json) {
        if (res.ok && json && json.ok === true) {
          status.textContent = 'Added. Thank you.';
          each('#lp-followup select', function (s) { s.disabled = true; });
          track('lead_details_added', {});
        } else {
          throw new Error('not accepted');
        }
      });
    }).catch(function () {
      btn.disabled = false;
      status.textContent = 'We could not add those answers online. Your request is still received, and you can mention them when we speak.';
    });
  }

  /* ------------------------------------------------------------------
     Sticky mobile bar. Hidden whenever the form or the final call to
     action is on screen, while a field has focus, and after success, so
     it can never cover a field or the consent text.
     ------------------------------------------------------------------ */
  var bar = $('lp-bar');
  var visible = { form: true, final: false };
  var typing = false;

  function updateBar() {
    var show = !visible.form && !visible.final && !typing && !state.done;
    bar.hidden = !show;
    body.classList.toggle('lp-has-bar', show);
  }

  function watchBar() {
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.target.id === 'offer-form') visible.form = en.isIntersecting;
        else visible.final = en.isIntersecting;
      });
      updateBar();
    }, { threshold: 0 });
    io.observe($('offer-form'));
    io.observe($('lp-final'));
    document.addEventListener('focusin', function (ev) {
      typing = /^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName);
      updateBar();
    });
    document.addEventListener('focusout', function () { typing = false; updateBar(); });
  }

  /* ------------------------------------------------------------------
     Wiring
     ------------------------------------------------------------------ */
  function init() {
    applyConfig();
    startMeasurement();

    var form = $('lp-form');
    form.addEventListener('submit', onSubmit);
    $('lp-continue').addEventListener('click', goContinue);
    $('lp-back').addEventListener('click', function () { showStep(1, 'street'); });
    $('lp-retry').addEventListener('click', send);
    $('lp-edit').addEventListener('click', function () {
      $('lp-failure').hidden = true;
      form.hidden = false;
      showStep(2, 'name');
    });
    $('lp-followup').addEventListener('submit', onFollowup);

    function started() {
      if (state.started) return;
      state.started = true;
      track('form_start', {});
    }
    form.addEventListener('input', started);
    form.addEventListener('change', started);

    /* Clear a field's error as soon as it is corrected. */
    form.addEventListener('input', function (ev) {
      var id = ev.target.id;
      if (RULES[id] && ev.target.getAttribute('aria-invalid') === 'true' &&
          !RULES[id](value(id), ev.target)) setError(id, '');
    });
    form.addEventListener('change', function (ev) {
      var id = ev.target.id;
      if (RULES[id] && ev.target.getAttribute('aria-invalid') === 'true' &&
          !RULES[id](value(id), ev.target)) setError(id, '');
    });

    document.addEventListener('click', function (ev) {
      var a = ev.target.closest ? ev.target.closest('a') : null;
      if (!a) return;
      var loc = a.getAttribute('data-loc') || 'unknown';
      if (a.hasAttribute('data-call')) track('phone_click', { link_location: loc });
      if (a.hasAttribute('data-cta')) {
        track('cta_click', { link_location: loc });
        setTimeout(function () {
          try { $('offer-form').focus({ preventScroll: true }); } catch (ignore) {}
        }, 0);
      }
    });

    watchBar();
  }

  init();
})();
