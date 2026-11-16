/* Florida enquiry flow. Preview origins never send real enquiries. */
(() => {
  'use strict';
  const PAGE_ID = 'mh_google_cash_offer_florida_v1';
  const form = document.querySelector('[data-seller-form]');
  const steps = [...form.querySelectorAll('[data-step]')];
  const progress = [...document.querySelectorAll('.progress li')];
  const result = document.getElementById('preview-result');
  const byId = id => document.getElementById(id);
  let currentStep = 1;
  let formAttempt = false;

  // Preparation for GTM. Events contain no name, phone, email, address or ZIP.
  function track(event, extra = {}) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({...MHIntakeCore.analytics(event, extra), preview: !window.MHIntake.live});
  }
  function showStep(number, focus = true) {
    currentStep = number;
    steps.forEach(step => { step.hidden = Number(step.dataset.step) !== number; });
    progress.forEach((item, index) => {
      item.classList.toggle('active', index + 1 === number);
      item.classList.toggle('completed', index + 1 < number);
      if (index + 1 === number) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    if (number === 3) byId('property-summary').textContent = `${byId('address').value.trim()}, ${byId('city').value.trim()}, FL ${byId('zip').value.trim()}`;
    if (focus) steps[number - 1].querySelector('input,select').focus({preventScroll: true});
  }
  function error(step, message, input) {
    const el = byId(`error-${step}`);
    el.textContent = message;
    el.hidden = false;
    if (input) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', el.id); input.focus(); }
    return false;
  }
  function validate(step) {
    byId(`error-${step}`).hidden = true;
    const inputs = [...steps[step - 1].querySelectorAll('input,select')];
    inputs.forEach(input => { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); });
    for (const input of inputs) {
      if (input.required && ((input.type === 'checkbox' && !input.checked) || !input.value.trim())) return error(step, input.type === 'checkbox' ? 'Please confirm we may call you about this enquiry.' : `Please complete ${input.labels[0].textContent.toLowerCase()}.`, input);
      if (input.type === 'email' && input.value && !input.validity.valid) return error(step, 'Please enter a valid email, or leave it blank.', input);
    }
    if (step === 1) {
      if (byId('address').value.trim().length < 5) return error(step, 'Please enter the full property street address.', byId('address'));
      if (!/^\d{5}$/.test(byId('zip').value)) return error(step, 'Please enter a five-digit Florida ZIP code.', byId('zip'));
      if (!/^(32|33|34)/.test(byId('zip').value)) return error(step, 'This page is for Florida properties. Please check the ZIP or call us to discuss another area.', byId('zip'));
    }
    if (step === 3) {
      const digits = byId('phone').value.replace(/\D/g, '');
      if (!(digits.length === 10 || (digits.length === 11 && digits.startsWith('1')))) return error(step, 'Please enter a ten-digit US phone number, with an optional +1 country code.', byId('phone'));
    }
    return true;
  }
  form.querySelectorAll('[data-next]').forEach(button => button.addEventListener('click', () => {
    if (!validate(currentStep)) return;
    track('mh_form_step_completed', {step: currentStep});
    showStep(Number(button.dataset.next));
  }));
  form.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', () => showStep(Number(button.dataset.back))));
  async function submitEnquiry(event) {
    if (window.MHIntake.nativeSubmitting) return;
    event.preventDefault();
    if (formAttempt) return;
    if (currentStep < 3) {
      if (validate(currentStep)) {track('mh_form_step_completed', {step: currentStep}); showStep(currentStep + 1);}
      return;
    }
    if (!validate(3) || byId('website').value) return;
    for (const step of [1,2,3]) {
      showStep(step, false);
      if (!validate(step)) return;
    }
    formAttempt=true;
    const sendButton=form.querySelector('[data-submit-enquiry]');
    sendButton.disabled=true;sendButton.textContent='Sending your enquiry…';
    try {
      const values={};
      for (const id of ['address','city','zip','ownership','condition','timeline','name','phone','email']) values[id]=byId(id).value.trim();
      values.contact_permission=byId('consent').checked;
      const response=await window.MHIntake.send(values);
      if(response.preview) track('mh_preview_form_completed');
      else window.MHMeasurement.leadAccepted(response);
      steps.forEach(step=>{step.hidden=true;});
      document.querySelector('.progress').hidden=true;
      if(!response.preview) {
        result.querySelector('.result-label').textContent='ENQUIRY RECEIVED';
        result.querySelector('h3').textContent='Thanks. Your enquiry has been received.';
        result.querySelector('p').textContent='The MaliHaus team will review your property details and contact you about the next step.';
        byId('restart').textContent='Start a different enquiry';
      }
      result.hidden=false;result.focus({preventScroll:true});
    } catch (failure) {
      error(3, failure.message || 'Delivery could not be confirmed. Please call (407) 917-3347.');
      sendButton.textContent='Please call to continue';
    }
  }
  form.addEventListener('submit', submitEnquiry);
  form.addEventListener('mh-request-submit', submitEnquiry);
  form.querySelector('[data-submit-enquiry]').addEventListener('click', submitEnquiry);
  byId('restart').addEventListener('click', () => {
    if (window.MHIntake.live) {location.reload();return;}
    formAttempt=false;
    const sendButton=form.querySelector('[data-submit-enquiry]');
    sendButton.disabled=false;sendButton.textContent='Request my cash offer';
    form.reset();
    result.hidden = true;
    document.querySelector('.progress').hidden = false;
    form.querySelectorAll('.form-error').forEach(el => {el.hidden = true;});
    form.querySelectorAll('[aria-invalid]').forEach(el => {el.removeAttribute('aria-invalid');el.removeAttribute('aria-describedby');});
    showStep(1);
  });
  document.querySelectorAll('[data-call-location]').forEach(link => link.addEventListener('click', () => track('mh_call_click', {placement: link.dataset.callLocation})));
  document.querySelectorAll('[data-offer-location]').forEach(link => link.addEventListener('click', () => {
    track('mh_offer_cta_click', {placement: link.dataset.offerLocation});
    const target = result.hidden ? steps[currentStep - 1].querySelector('input,select') : result;
    target.focus({preventScroll:true});
  }));
  const mobileBar = document.querySelector('.mobile-bar');
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
    mobileBar.classList.toggle('form-visible', entries[0].isIntersecting);
  }, {threshold: .15}).observe(byId('offer'));

  const notices = {
    privacy: {title: 'Privacy Notice', body: '<p><strong>Design review version · November 12, 2026</strong></p><p>This preview is owned and operated by MaliHaus Capital LLC. The form runs only in your current browser tab. It does not send your details, save them to browser storage, or create a property enquiry.</p><p>No advertising or analytics SDK is installed in this preview. Interaction names and the Florida page identifier are held in a temporary in-memory event queue. Names, contact details, and property information are excluded from those events.</p><p>Images and page assets are served with this page. Normal hosting access logs may include technical request information. Clicking a phone or external review link uses the destination service.</p><p>For a real property enquiry or a privacy question, call <a href="tel:+14079173347">(407) 917-3347</a>, or write to MaliHaus Capital LLC, 1515 S Federal Hwy, Ste 156, Boca Raton, FL 33432.</p><p>Before this page accepts live enquiries, this notice must be replaced with the approved live privacy policy describing collection, service providers, retention, rights, and contact procedures.</p>'},
    terms: {title: 'Terms of Use', body: '<p><strong>Design review version · November 12, 2026</strong></p><p>This page is a preview provided by MaliHaus Capital LLC. Its form does not submit an enquiry or generate an offer.</p><p>Information on this page is general information about the proposed property enquiry process. Requesting information is not a purchase agreement or a commitment to sell.</p><p>Offers, eligibility, purchase costs, inspection terms, and timelines depend on review of the property and a written agreement. No specific offer, price, or closing date is guaranteed.</p><p>Properties may be considered for a direct purchase, an investor partnership, or another investor purchase route. The proposed buyer and purchase arrangement must be explained before any agreement.</p><p>Images are illustrative and are not evidence of previous purchases. Review excerpts are attributed to their displayed source.</p><p>Call <a href="tel:+14079173347">(407) 917-3347</a> with questions. These preview terms must be replaced with approved live terms before launch.</p>'}
  };
  if (window.MHIntake.production) {
    document.querySelector('.review-notice').hidden=true;
    notices.privacy.body='<p>This website is owned and operated by MaliHaus Capital LLC. When online enquiries are available, the form collects your contact details, property details and permission to call about your enquiry. MaliHaus uses its private intake service, Zapier and REsimpli to manage enquiries and team follow-up.</p><p>Campaign details, such as the referring campaign and Google click identifier, are retained with your enquiry to understand which advertising generated it. Names, addresses and contact details are excluded from the page’s analytics events. Optional Google Analytics and Google Ads measurement follow your Privacy choices. Essential-only works without loading those optional Google tags. You can reopen Privacy choices in the footer.</p><p>With advertising measurement allowed, this page may remember the ad click identifier and campaign details in this browser for up to 90 days after the visit. Choosing Essential only or Analytics only deletes this stored advertising attribution. Information already included with an enquiry is kept separately in the enquiry record.</p><p>The form does not provide permission for marketing text messages. For questions about your information or to request a correction or deletion, contact MaliHaus Capital LLC at 1515 S Federal Hwy, Ste 156, Boca Raton, FL 33432, or call (407) 917-3347. Records are kept as needed to handle the enquiry and related business obligations.</p>';
    notices.terms.body='<p>This website is owned and operated by MaliHaus Capital LLC. Sending an enquiry is not a purchase agreement or a commitment to sell.</p><p>Any offer, purchase costs and timetable depend on a property review and the written terms agreed with the buyer. A particular offer or purchase date is not guaranteed.</p><p>A property may be considered for direct purchase, an investor partnership or another investor purchase route. The team will explain the proposed arrangement before any agreement. Photographs are illustrative. Review cards identify their source and may concern other MaliHaus services.</p>';
  }
  if(window.MHIntake.production && !window.MHIntake.live) {
    const notice=document.querySelector('.review-notice');notice.hidden=false;
    notice.textContent='Online enquiries are temporarily unavailable. Please call (407) 917-3347.';
    form.querySelectorAll('input,select,button').forEach(control=>{control.disabled=true;});
    document.querySelector('.form-subtitle').textContent='Please call (407) 917-3347 to discuss your property.';
  }
  const dialog = byId('policy-dialog');
  document.querySelectorAll('[data-open-policy]').forEach(button => button.addEventListener('click', () => {
    const notice = notices[button.dataset.openPolicy];
    byId('policy-title').textContent = notice.title;
    byId('policy-content').innerHTML = notice.body;
    dialog.showModal();
  }));
  byId('close-policy').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {if(event.target === dialog) {const rect = dialog.getBoundingClientRect(); if(event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();}});
  byId('year').textContent = new Date().getFullYear();
  // Direct Google Maps review snapshot, retrieved November 12, 2026. Not an auto-refreshing feed.
  const ribbon = document.querySelector('.reviews-ribbon');
  const reviewTrack = byId('reviews-track');
  const reviewGroup = reviewTrack?.querySelector('.reviews-group');
  const pauseReviews = byId('reviews-pause');
  if (ribbon && reviewGroup && pauseReviews) {
    const duplicate = reviewGroup.cloneNode(true);
    duplicate.setAttribute('aria-hidden', 'true');
    duplicate.setAttribute('inert', '');
    duplicate.removeAttribute('aria-label');
    duplicate.removeAttribute('role');
    duplicate.querySelectorAll('a').forEach(link => {link.tabIndex = -1;});
    duplicate.classList.add('reviews-group-copy');
    reviewTrack.appendChild(duplicate);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let paused = reducedMotion.matches;
    function setReviewsPaused(value) {
      paused = value;
      ribbon.classList.toggle('reviews-paused', paused);
      pauseReviews.setAttribute('aria-pressed', String(paused));
      pauseReviews.disabled = reducedMotion.matches;
      pauseReviews.textContent = reducedMotion.matches ? 'Motion off' : paused ? 'Resume scrolling' : 'Pause scrolling';
    }
    setReviewsPaused(paused);
    pauseReviews.addEventListener('click', () => setReviewsPaused(!paused));
    reducedMotion.addEventListener('change', event => setReviewsPaused(event.matches));
    ribbon.querySelector('.reviews-viewport').addEventListener('pointerdown', event => {if(event.pointerType === 'touch') setReviewsPaused(true);});
    // No aria-live: scrolling must not repeatedly announce duplicate reviews.
    // Browsing with a keyboard or pointer temporarily pauses the track via CSS.
  }
  track('mh_landing_view');
})();
