/* Consent-controlled Google measurement. IDs must come from the client account. */
(() => {
  'use strict';
  const cfg=window.MHIntegration || {};
  const live=cfg.measurementEnabled !== false && (cfg.allowedOrigins || []).includes(location.origin);
  window.dataLayer=window.dataLayer || [];
  window.gtag=window.gtag || function(){window.dataLayer.push(arguments);};
  let choice={analytics:false,advertising:false},loaded=false,conversionCounted=false,choiceSaved=false;
  let choiceAt=null;
  let analyticsAnnounced=false,advertisingAnnounced=false;
  const googleConfigured=/^GTM-[A-Z0-9]+$/.test(cfg.gtmContainerId || '') || /^G-[A-Z0-9]+$/.test(cfg.ga4MeasurementId || '') || /^AW-\d+\/[A-Za-z0-9_-]+$/.test(cfg.googleAdsConversion || '');
  function consent() {
    gtag('consent','update',{
      analytics_storage:choice.analytics?'granted':'denied',
      ad_storage:choice.advertising?'granted':'denied',
      ad_user_data:choice.advertising?'granted':'denied',
      ad_personalization:'denied'
    });
    window.MHIntake?.rememberAttribution?.({...choice,at:choiceAt});
  }
  function load() {
    if(loaded || !live || !googleConfigured || (!choice.analytics && !choice.advertising))return;
    loaded=true;
    const script=document.createElement('script');script.async=true;
    if (/^GTM-[A-Z0-9]+$/.test(cfg.gtmContainerId || '')) {
      window.dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});
      script.src='https://www.googletagmanager.com/gtm.js?id='+encodeURIComponent(cfg.gtmContainerId);
    } else {
      const id=cfg.ga4MeasurementId || cfg.googleAdsConversion.split('/')[0];
      script.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(id);
      gtag('js',new Date());
      if(cfg.ga4MeasurementId && choice.analytics)gtag('config',cfg.ga4MeasurementId,{send_page_view:true,page_location:location.origin+location.pathname});
      if(cfg.googleAdsConversion && choice.advertising)gtag('config',cfg.googleAdsConversion.split('/')[0]);
    }
    document.head.appendChild(script);
  }
  function signalReady() {
    if(choice.analytics && !analyticsAnnounced){analyticsAnnounced=true;window.dataLayer.push({event:'mh_analytics_ready'});}
    if(choice.advertising && !advertisingAnnounced){advertisingAnnounced=true;window.dataLayer.push({event:'mh_advertising_ready'});}
  }
  if(live && googleConfigured) {
    gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    // Do not send arbitrary URL query strings (which can contain contact data).
    gtag('set',{page_location:location.origin+location.pathname});
    try {const saved=JSON.parse(localStorage.getItem('mh_measurement_consent'));if(saved && Number.isFinite(saved.at) && saved.at>0 && saved.at<=Date.now() && Date.now()-saved.at<15552000000){choice={analytics:saved.analytics===true,advertising:saved.advertising===true};choiceAt=new Date(saved.at).toISOString();choiceSaved=true;}}catch(_){}
    consent();load();
    signalReady();
    function showChoices() {
      if(document.querySelector('.measurement-choice'))return;
      const panel=document.createElement('aside');panel.className='measurement-choice';panel.setAttribute('aria-label','Privacy choices');
      panel.innerHTML='<p>Allow optional analytics and advertising measurement? Your property enquiry works without it.</p><button type="button" data-privacy-choice="reject">Essential only</button><button type="button" data-privacy-choice="analytics">Analytics only</button><button type="button" data-privacy-choice="all">Allow measurement</button>';
      panel.addEventListener('click',event=>{
        const value=event.target.dataset.privacyChoice;if(!value)return;
        choice={analytics:value!=='reject',advertising:value==='all'};
        const selectedAt=Date.now();choiceAt=new Date(selectedAt).toISOString();
        try{localStorage.setItem('mh_measurement_consent',JSON.stringify({...choice,at:selectedAt}));}catch(_){}
        consent();load();signalReady();panel.remove();
      });document.body.appendChild(panel);
    }
    const settings=document.createElement('button');settings.type='button';settings.className='text-link';settings.textContent='Privacy choices';
    settings.addEventListener('click',showChoices);
    (document.querySelector('.footer-contact') || document.body).appendChild(settings);
    if(!choiceSaved)showChoices();
  }
  window.MHMeasurement={
    // Operational enquiry metadata only. This snapshot is never an analytics payload.
    consentSnapshot(){return Object.freeze({...choice,at:choiceAt,ad_personalization:false,notice_version:'mh-measurement-v1'});},
    leadAccepted(result){
      if(!live || !result.accepted || result.crm_verified!==true || result.destination!=='resimpli' || result.duplicate || conversionCounted)return;
      conversionCounted=true;
      const payload=MHIntakeCore.analytics('generate_lead',{delivery_destination:result.destination});
      // Random event identity, never a contact identifier or a hash of contact data.
      payload.mh_submission_id=window.crypto?.randomUUID?.() || 'mh-'+Date.now()+'-'+Math.random().toString(36).slice(2);
      window.dataLayer.push(payload);
      // A GTM container owns its tags. Never duplicate its conversion with gtag.
      if(!cfg.gtmContainerId && loaded){
        if(choice.analytics && cfg.ga4MeasurementId)gtag('event','generate_lead',{send_to:cfg.ga4MeasurementId,page_location:location.origin+location.pathname});
        if(choice.advertising && cfg.googleAdsConversion)gtag('event','conversion',{send_to:cfg.googleAdsConversion,transaction_id:payload.mh_submission_id});
      }
    }
  };
})();
