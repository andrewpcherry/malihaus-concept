/* MaliHaus Capital — shared site layer
   Covers proposal section 03 items 02 (measurement), 03 (call tracking foundation)
   and 11 (conversion event tracking).

   EVERYTHING CONFIGURABLE LIVES IN ONE PLACE: the CONFIG block below.
   Change the phone number here and it changes on every page, every button,
   the mobile call bar, the footer and the structured data. */

(function () {
  'use strict';

  var CONFIG = {
    /* ---- Call tracking foundation (proposal 03/03) ----
       One business-controlled number, presented identically everywhere.
       digits: 10 digits, no punctuation. display: exactly how it should read. */
    phoneDigits: '3214612550',
    phoneDisplay: '(321) 461-2550',

    /* ---- Measurement foundation (proposal 03/02) ----
       Put the real GTM container ID here and the container loads on every page.
       Left empty the site runs normally and events queue into dataLayer,
       so nothing breaks and nothing is lost before the container exists. */
    gtmId: '',

    /* Seller qualification path (proposal 03/04) */
    funnelUrl: 'https://andrewpcherry.github.io/malihaus-funnel/'
  };

  window.MALIHAUS = CONFIG;

  /* ------------------------------------------------------------------ *
   * 1. dataLayer and Google Tag Manager
   * ------------------------------------------------------------------ */

  window.dataLayer = window.dataLayer || [];

  function track(event, params) {
    var payload = { event: event };
    if (params) for (var k in params) if (params.hasOwnProperty(k)) payload[k] = params[k];
    var a = attribution();
    for (var j in a) if (a.hasOwnProperty(j)) payload[j] = a[j];
    window.dataLayer.push(payload);
  }
  window.mhTrack = track;

  if (CONFIG.gtmId) {
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    var g = document.createElement('script');
    g.async = true;
    g.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(CONFIG.gtmId);
    document.head.appendChild(g);
  }

  /* ------------------------------------------------------------------ *
   * 2. Source attribution (proposal 03/02 and 03/11)
   *    First touch is kept for the whole session so a lead that arrives
   *    from an ad and converts three pages later still carries its source.
   * ------------------------------------------------------------------ */

  var ATTR_KEY = 'mh_attr';
  var ATTR_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
                     'gclid', 'fbclid', 'msclkid', 'ttclid'];
  var attrCache = null;

  function store(key, value) {
    try { sessionStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }
  function read(key) {
    try { return sessionStorage.getItem(key); } catch (e) { return null; }
  }

  function attribution() {
    if (attrCache) return attrCache;

    var existing = read(ATTR_KEY);
    if (existing) {
      try { attrCache = JSON.parse(existing); return attrCache; } catch (e) { /* fall through */ }
    }

    var q = new URLSearchParams(window.location.search);
    var a = {};
    for (var i = 0; i < ATTR_FIELDS.length; i++) {
      var v = q.get(ATTR_FIELDS[i]);
      if (v) a[ATTR_FIELDS[i]] = v.slice(0, 200);
    }

    /* No campaign parameters means we still want to know where they came from. */
    if (!a.utm_source) {
      var ref = document.referrer || '';
      if (!ref) {
        a.utm_source = 'direct';
        a.utm_medium = 'none';
      } else {
        var host = '';
        try { host = new URL(ref).hostname.replace(/^www\./, ''); } catch (e) { host = 'unknown'; }
        if (host === window.location.hostname.replace(/^www\./, '')) {
          return (attrCache = {}); /* internal navigation, do not overwrite */
        }
        a.utm_source = host;
        a.utm_medium = /google|bing|duckduckgo|yahoo|ecosia|brave/.test(host) ? 'organic' : 'referral';
      }
    }

    a.landing_page = window.location.pathname;
    a.first_seen = new Date().toISOString();

    attrCache = a;
    store(ATTR_KEY, JSON.stringify(a));
    return a;
  }

  /* Carry attribution across to the funnel so the lead record knows its source. */
  function funnelLink(extra) {
    var q = new URLSearchParams();
    var a = attribution();
    for (var k in a) if (a.hasOwnProperty(k) && k !== 'first_seen') q.set(k, a[k]);
    if (extra) for (var e in extra) if (extra.hasOwnProperty(e) && extra[e]) q.set(e, extra[e]);
    var s = q.toString();
    return CONFIG.funnelUrl + (s ? '?' + s : '');
  }
  window.mhFunnelLink = funnelLink;

  /* ------------------------------------------------------------------ *
   * 3. Consistent number presentation (proposal 03/03)
   * ------------------------------------------------------------------ */

  function applyPhone(root) {
    var tel = 'tel:+1' + CONFIG.phoneDigits;
    var sms = 'sms:+1' + CONFIG.phoneDigits;
    var i, els;

    els = root.querySelectorAll('[data-call]');
    for (i = 0; i < els.length; i++) els[i].setAttribute('href', tel);

    els = root.querySelectorAll('[data-sms]');
    for (i = 0; i < els.length; i++) els[i].setAttribute('href', sms);

    els = root.querySelectorAll('[data-phone]');
    for (i = 0; i < els.length; i++) els[i].textContent = CONFIG.phoneDisplay;
  }

  /* ------------------------------------------------------------------ *
   * 4. Conversion events (proposal 03/11)
   * ------------------------------------------------------------------ */

  function wireEvents(root) {
    /* Phone taps and text taps, on every page and every button. */
    root.addEventListener('click', function (ev) {
      var el = ev.target.closest ? ev.target.closest('[data-call],[data-sms],[data-cta],[data-situation-link]') : null;
      if (!el) return;

      if (el.hasAttribute('data-call')) {
        track('phone_tap', { link_location: el.getAttribute('data-loc') || 'unknown' });
      } else if (el.hasAttribute('data-sms')) {
        track('text_tap', { link_location: el.getAttribute('data-loc') || 'unknown' });
      } else if (el.hasAttribute('data-situation-link')) {
        track('situation_click', { situation: el.getAttribute('data-situation-link') });
      } else {
        track('cta_click', {
          cta_text: (el.textContent || '').trim().slice(0, 80),
          link_location: el.getAttribute('data-loc') || 'unknown'
        });
      }
    }, true);

    /* Address form: start, submit and abandonment. */
    var forms = root.querySelectorAll('form[data-address-form]');
    for (var i = 0; i < forms.length; i++) {
      (function (form) {
        var started = false, submitted = false;
        var input = form.querySelector('input[type="text"]');

        if (input) {
          input.addEventListener('input', function () {
            if (started || !input.value.trim()) return;
            started = true;
            track('form_start', { form_name: 'address_entry' });
          });
        }

        form.addEventListener('submit', function (ev) {
          ev.preventDefault();
          submitted = true;
          var addr = input ? input.value.trim() : '';
          track('address_submit', {
            form_name: 'address_entry',
            has_address: addr ? 'yes' : 'no',
            situation: form.getAttribute('data-situation') || 'none'
          });
          window.location.href = funnelLink({
            address: addr,
            situation: form.getAttribute('data-situation') || ''
          });
        });

        window.addEventListener('pagehide', function () {
          if (started && !submitted) track('form_abandon', { form_name: 'address_entry' });
        });
      })(forms[i]);
    }

    /* Scroll depth, so we can see where the page loses people. */
    var marks = [25, 50, 75, 90], hit = {};
    window.addEventListener('scroll', function () {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      if (h <= 0) return;
      var pct = (window.scrollY / h) * 100;
      for (var i = 0; i < marks.length; i++) {
        if (pct >= marks[i] && !hit[marks[i]]) {
          hit[marks[i]] = true;
          track('scroll_depth', { percent_scrolled: marks[i] });
        }
      }
    }, { passive: true });
  }

  /* ------------------------------------------------------------------ *
   * 5. Boot
   * ------------------------------------------------------------------ */

  function init() {
    applyPhone(document);
    wireEvents(document);
    attribution();
    track('page_ready', { page_type: document.body.getAttribute('data-page-type') || 'other' });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
