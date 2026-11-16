/* PPC page -> private intake endpoint -> REsimpli. No provider credentials here. */
(() => {
  'use strict';
  const cfg=window.MHIntegration||{},core=window.MHIntakeCore;
  const production=(cfg.allowedOrigins||[]).includes(location.origin);
  const live=production&&cfg.deliveryEnabled===true&&cfg.downstreamResimpliVerified===true&&!!cfg.intakeEndpoint;
  const touch=core.attribution(location.href),landingAt=new Date().toISOString();
  let source={...touch,landing_at:landingAt};
  const attributionKey='mh_ppc_attribution_v1',attributionWindow=90*86400000;
  // Keep only a consented advertising touch, never contact/property data.
  // A new tagged visit replaces the entire touch so campaign fields cannot mix.
  function rememberAttribution(choice={}){
    const now=Date.now(),choiceAt=Date.parse(choice.at);
    const permitted=production&&choice.advertising===true&&Number.isFinite(choiceAt)&&choiceAt<=now&&now-choiceAt<15552000000;
    const clear=()=>{try{localStorage.removeItem(attributionKey);}catch{}};
    if(!permitted){clear();source={...touch,landing_at:landingAt};return {...source};}
    let saved;try{saved=JSON.parse(localStorage.getItem(attributionKey));}catch{}
    const valid=saved?.schema==='mh-ppc-attribution-v1'&&Number.isFinite(saved.at)&&saved.at>0&&saved.at<=now&&now-saved.at<attributionWindow&&saved.source&&typeof saved.source==='object'&&!Array.isArray(saved.source)&&(saved.source.gclid||saved.source.gbraid||saved.source.wbraid)&&Object.keys(saved.source).every(k=>k==='landing_at'||core.attributionKeys.includes(k))&&Object.values(saved.source).every(v=>typeof v==='string'&&v.length<=500)&&Date.parse(saved.source.landing_at)===saved.at;
    if(!valid){saved=null;clear();}
    if(Object.keys(touch).length){
      const same=saved&&core.attributionKeys.every(k=>saved.source[k]===touch[k]);
      if(same)source={...saved.source};
      else{
        source={...touch,landing_at:landingAt};clear();
        if(touch.gclid||touch.gbraid||touch.wbraid){try{localStorage.setItem(attributionKey,JSON.stringify({schema:'mh-ppc-attribution-v1',at:Date.parse(landingAt),source}));}catch{}}
      }
    }else source=saved?{...saved.source}:{landing_at:landingAt};
    return {...source};
  }
  let inFlight;
  const pendingMessage='Delivery could not be confirmed. Your details may have arrived. Please call (407) 917-3347 rather than submitting again.';
  const storage={get(k){try{return JSON.parse(sessionStorage.getItem(k));}catch{return null;}},set(k,v){try{sessionStorage.setItem(k,JSON.stringify(v));}catch{}},remove(k){try{sessionStorage.removeItem(k);}catch{}}};
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function send(values){
    if(production&&!live)return Promise.reject(new Error('Online enquiries are temporarily unavailable. Your details have not been sent. Please call (407) 917-3347.'));
    if(!live)return Promise.resolve({preview:true});
    if(inFlight)return inFlight;
    inFlight=(async()=>{
      const measurement=window.MHMeasurement?.consentSnapshot?.()||{};
      const initial=core.fields(values,rememberAttribution(measurement),new Date().toISOString(),location.pathname,measurement);
      const identity=JSON.stringify([initial.first_name.toLowerCase(),initial.last_name.toLowerCase(),initial.phone,initial.email.toLowerCase(),initial.address.toLowerCase(),initial.city.toLowerCase(),initial.postal_code,initial.property_ownership,initial.property_condition,initial.desired_selling_timeframe,JSON.parse(initial.conversation_summary.slice(initial.conversation_summary.indexOf('{'))).measurement_choice.analytics,JSON.parse(initial.conversation_summary.slice(initial.conversation_summary.indexOf('{'))).measurement_choice.advertising]);
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
      const key='mh_ppc_'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
      let record=storage.get(key);
      if(record&&Date.now()-record.at>=86400000)record=null;
      let duplicate=!!record;
      if(record?.state==='accepted')return {accepted:true,duplicate:true,destination:'resimpli',crm_verified:true};
      if(record&&!record.read_token)throw new Error(pendingMessage);
      const endpoint=new URL(cfg.intakeEndpoint,location.origin);
      if(endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&['127.0.0.1','localhost'].includes(endpoint.hostname)))throw new Error('Online delivery is unavailable. Your details have not been sent. Please call (407) 917-3347.');
      const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),30000);
      try{
        if(!record){
          record={event_id:crypto.randomUUID(),at:Date.now(),state:'pending'};storage.set(key,record);
          const payload={schema:'mh-ppc-intake-v1',event_id:record.event_id,fields:initial};
          // QA configuration exists only in the separate local harness.
          if(cfg.testMode==='synthetic_qa')payload.test_mode='synthetic_qa';
          const r=await fetch(endpoint.href,{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
          const b=await r.json();
          if(!r.ok){if(b.state==='rejected_before_dispatch'){storage.remove(key);throw new Error('Online delivery is unavailable. Your details have not been sent. Please call (407) 917-3347.');}throw new Error(pendingMessage);}
          if(b.enquiry_key&&!b.read_token)throw new Error(pendingMessage);
          if(!b.enquiry_key||!b.read_token)throw new Error(pendingMessage);
          record={...record,read_token:b.read_token,enquiry_key:b.enquiry_key};duplicate=b.duplicate===true;storage.set(key,record);
        }
        for(let n=0;n<14;n++){
          const r=await fetch(endpoint.href.replace(/\/$/,'')+'/status',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({read_token:record.read_token}),signal:controller.signal});
          const b=await r.json();
          if(r.ok&&b.accepted===true&&b.enquiry_key===record.enquiry_key&&b.receipt?.crm_lead_id&&b.receipt?.source_activity_id){storage.set(key,{...record,state:'accepted'});return {accepted:true,duplicate:duplicate||b.receipt.duplicate===true,destination:'resimpli',crm_verified:true};}
          if(!r.ok||!['queued','dispatch_started'].includes(b.state))throw new Error(pendingMessage);
          await pause(1500);
        }
        throw new Error(pendingMessage);
      }catch(error){if(error.message?.includes('have not been sent'))throw error;throw new Error(pendingMessage);}finally{clearTimeout(deadline);}
    })().finally(()=>{inFlight=undefined;});return inFlight;
  }
  window.MHIntake=Object.freeze({send,live,production,rememberAttribution,nativeSubmitting:false,get attribution(){return {...source};}});
})();
