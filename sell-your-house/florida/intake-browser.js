/* PPC page -> private intake endpoint -> REsimpli. No provider credentials here. */
(() => {
  'use strict';
  const cfg=window.MHIntegration||{},core=window.MHIntakeCore;
  const production=(cfg.allowedOrigins||[]).includes(location.origin);
  const live=production&&cfg.deliveryEnabled===true&&cfg.downstreamResimpliVerified===true&&!!cfg.intakeEndpoint;
  const source={...core.attribution(location.href),landing_at:new Date().toISOString()};
  let inFlight;
  const pendingMessage='Delivery could not be confirmed. Your details may have arrived. Please call (407) 917-3347 rather than submitting again.';
  const storage={get(k){try{return JSON.parse(sessionStorage.getItem(k));}catch{return null;}},set(k,v){try{sessionStorage.setItem(k,JSON.stringify(v));}catch{}},remove(k){try{sessionStorage.removeItem(k);}catch{}}};
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function send(values){
    if(production&&!live)return Promise.reject(new Error('Online enquiries are temporarily unavailable. Your details have not been sent. Please call (407) 917-3347.'));
    if(!live)return Promise.resolve({preview:true});
    if(inFlight)return inFlight;
    inFlight=(async()=>{
      const initial=core.fields(values,source,new Date().toISOString(),location.pathname,window.MHMeasurement?.consentSnapshot?.()||{});
      const identity=JSON.stringify([initial.first_name.toLowerCase(),initial.last_name.toLowerCase(),initial.phone,initial.email.toLowerCase(),initial.address.toLowerCase(),initial.city.toLowerCase(),initial.postal_code,initial.property_ownership,initial.property_condition,initial.desired_selling_timeframe]);
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity));
      const key='mh_ppc_'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
      let record=storage.get(key),duplicate=!!record;
      if(record&&Date.now()-record.at>=86400000)record=null;
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
    })();return inFlight;
  }
  window.MHIntake=Object.freeze({send,live,production,nativeSubmitting:false,get attribution(){return {...source};}});
})();
