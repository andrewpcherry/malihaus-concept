const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const core=require('./intake-core.js');
const values={address:'123 QA Test Lane',city:'Boca Raton',zip:'33432',ownership:'Owner',condition:'Needs repairs',timeline:'Within 30 days',name:'QA Seller',phone:'2025550189',email:'qa@example.invalid',contact_permission:true};
function environment({origin='https://www.malihaus.com',deliveryEnabled=true,verified=true,mode='verified',ledger=new Map()}={}){
 const requests=[];
 const ctx={URL,TextEncoder,crypto:webcrypto,AbortController,console,location:{origin,href:origin+'/sell-your-house/florida/?gclid=QA',pathname:'/sell-your-house/florida/'},sessionStorage:{getItem:k=>ledger.get(k)||null,setItem:(k,v)=>ledger.set(k,v),removeItem:k=>ledger.delete(k)},setTimeout(fn,ms){if(ms!==30000)queueMicrotask(fn);return 1;},clearTimeout(){},fetch:async(url,options)=>{
  requests.push({url,options});if(mode==='network')throw Error('network');
  if(!url.endsWith('/status'))return {ok:mode!=='reject',json:async()=>mode==='reject'?{state:'rejected_before_dispatch'}:{enquiry_key:'mhppc_test',read_token:'a'.repeat(64),accepted:false,duplicate:false}};
  return {ok:true,json:async()=>mode==='verified'?{enquiry_key:'mhppc_test',accepted:true,state:'crm_created_verified',receipt:{crm_lead_id:'6af9ed8801d4b214e9ddaf55',source_activity_id:'6afb3b352b2b4c637af0aeb1'}}:mode==='false_success'?{enquiry_key:'mhppc_test',accepted:true,state:'queued'}:{enquiry_key:'mhppc_test',accepted:false,state:'uncertain_review_required'}};
 }};ctx.window=ctx;ctx.MHIntegration={deliveryEnabled,downstreamResimpliVerified:verified,intakeEndpoint:'/api/intake',allowedOrigins:['https://www.malihaus.com']};ctx.MHIntakeCore=core;
 vm.runInNewContext(fs.readFileSync(__dirname+'/intake-browser.js','utf8'),ctx);return {ctx,requests,ledger};
}
test('public delivery gates make no request when closed or downstream unverified',async()=>{for(const options of [{deliveryEnabled:false},{verified:false}]){const e=environment(options);await assert.rejects(e.ctx.MHIntake.send(values),/have not been sent/);assert.equal(e.requests.length,0);}});
test('preview stays local and never posts',async()=>{const e=environment({origin:'http://localhost:4000'});assert.equal((await e.ctx.MHIntake.send(values)).preview,true);assert.equal(e.requests.length,0);});
test('double click sends one direct ingress request and requires verified CRM receipt',async()=>{const e=environment();const [a,b]=await Promise.all([e.ctx.MHIntake.send(values),e.ctx.MHIntake.send(values)]);assert.equal(a.crm_verified,true);assert.equal(b.destination,'resimpli');assert.equal(e.requests.filter(x=>!x.url.endsWith('/status')).length,1);const p=JSON.parse(e.requests[0].options.body);assert.equal(p.schema,'mh-ppc-intake-v1');assert.equal(p.fields.phone,'+12025550189');assert.equal(e.requests.some(x=>/leadconnector|msgsndr|gohighlevel/.test(x.url)),false);});
test('reload after confirmation does not post or duplicate a conversion',async()=>{const a=environment();await a.ctx.MHIntake.send(values);const b=environment({ledger:a.ledger});const r=await b.ctx.MHIntake.send(values);assert.equal(r.duplicate,true);assert.equal(b.requests.length,0);});
for(const mode of ['uncertain','false_success','network'])test(mode+' never claims success or automatically resends',async()=>{const a=environment({mode});await assert.rejects(a.ctx.MHIntake.send(values),/could not be confirmed/);const b=environment({mode,ledger:a.ledger});await assert.rejects(b.ctx.MHIntake.send(values));assert.equal(b.requests.filter(x=>!x.url.endsWith('/status')).length,0);});
test('explicit pre-dispatch rejection leaves no pending browser marker',async()=>{const a=environment({mode:'reject'});await assert.rejects(a.ctx.MHIntake.send(values),/have not been sent/);assert.equal(a.ledger.size,0);});
test('attribution retains click IDs and all campaign fields but ignores unknown URL parameters',()=>{
  const a=core.attribution('https://test.invalid/?gclid=abc&gbraid=xyz&utm_campaign=fl&adgroupid=42&email=private@example.invalid');
  assert.deepEqual(a,{gclid:'abc',gbraid:'xyz',utm_campaign:'fl',adgroupid:'42'});
});
test('attribution retains original values across internal navigation',()=>assert.equal(core.attribution('https://test.invalid/offer',{gclid:'original'}).gclid,'original'));
test('enquiry fields preserve contact, property, consent and attribution',()=>{
  const f=core.fields(values,{gclid:'click'},'2026-11-12T00:00:00Z','/offer');
  assert.equal(f.address,values.address);assert.equal(f.first_name,'QA');assert.equal(f.last_name,'Seller');assert.equal(f.phone,'+12025550189');assert.equal(f.lead_source,'Google Ads - Florida');
  assert.equal(JSON.parse(f.conversation_summary.split('\n').slice(1).join('\n')).contact_permission.marketing_sms,false);
  assert.match(f.conversation_summary,/click/);
});
test('phone-only leads remain supported',()=>assert.equal(core.fields({...values,email:''},{},'now','/').email,''));
test('missing enquiry permission cannot produce a delivery payload',()=>assert.throws(()=>core.fields({...values,contact_permission:false},{},'now','/')));
test('enquiry permission does not imply advertising permission',()=>{
  const f=core.fields(values,{gclid:'RetainCaseSensitiveClick'},'2026-11-16T00:00:00Z','/offer');
  const details=JSON.parse(f.conversation_summary.split('\n').slice(1).join('\n'));
  assert.equal(details.contact_permission.enquiry_call,true);
  assert.equal(details.contact_permission.marketing_sms,false);
  assert.equal(details.measurement_choice.advertising,false);
  assert.equal(details.measurement_choice.at,null);
  assert.equal(details.attribution.gclid,'RetainCaseSensitiveClick');
});
test('recorded measurement choice survives the operational summary without leaking into analytics',()=>{
  const choice={analytics:true,advertising:true,at:'2026-11-15T12:00:00.000Z',ad_personalization:true};
  const f=core.fields(values,{gclid:'RetainCaseSensitiveClick'},'2026-11-16T00:00:00Z','/offer',choice);
  const details=JSON.parse(f.conversation_summary.split('\n').slice(1).join('\n'));
  assert.deepEqual(details.measurement_choice,{analytics:true,advertising:true,at:choice.at,ad_personalization:false,notice_version:'mh-measurement-v1'});
  assert.equal(core.analytics('generate_lead',{measurement_choice:details.measurement_choice}).measurement_choice,undefined);
  assert.equal(core.measurementChoice({analytics:true,advertising:true,at:'invalid'}).advertising,false);
});
test('analytics never carries contact, property, click-ID or arbitrary supplied fields',()=>assert.deepEqual(core.analytics('generate_lead',{phone:values.phone,email:values.email,address:values.address,gclid:'private',step:2}),{event:'generate_lead',page_id:'mh_google_cash_offer_florida_v1',market:'florida',step:2}));
function measurementEnvironment(saved) {
  const scripts=[],panels=[],storage=new Map(saved?[['mh_measurement_consent',JSON.stringify(saved)]]:[]);
  const footer={appendChild(node){this.settings=node;}};
  const document={head:{appendChild(node){scripts.push(node);}},body:{appendChild(node){panels.push(node);}},
    querySelector(selector){return selector==='.footer-contact'?footer:panels[0];},
    createElement(){return {setAttribute(){},addEventListener(type,fn){this[type]=fn;},remove(){panels.splice(panels.indexOf(this),1);}};}};
  const c={location:{origin:'https://www.malihaus.com',pathname:'/sell-your-house/florida/'},document,crypto:webcrypto,
    MHIntegration:{allowedOrigins:['https://www.malihaus.com'],gtmContainerId:'GTM-PBSJTR3X'},MHIntakeCore:core,
    localStorage:{getItem(k){return storage.get(k)||null;},setItem(k,v){storage.set(k,v);}}};c.window=c;
  vm.runInNewContext(fs.readFileSync(__dirname+'/measurement.js','utf8'),c);
  return {c,scripts,panels,storage,footer,choose(value){panels[0].click({target:{dataset:{privacyChoice:value}}});}};
}
test('optional Google tags stay unloaded before a choice and after Essential only',()=>{
  const e=measurementEnvironment();assert.equal(e.scripts.length,0);assert.equal(e.panels.length,1);
  e.choose('reject');assert.equal(e.scripts.length,0);
  const r=measurementEnvironment(JSON.parse(e.storage.get('mh_measurement_consent')));
  assert.equal(r.scripts.length,0);assert.equal(r.panels.length,0);
  r.footer.settings.click();assert.equal(r.panels.length,1);
});
test('measurement snapshot records explicit choices and rejects invalid saved timestamps',()=>{
  const e=measurementEnvironment();
  assert.equal(e.c.MHMeasurement.consentSnapshot().at,null);
  e.choose('reject');const rejected=e.c.MHMeasurement.consentSnapshot();
  assert.equal(rejected.advertising,false);assert.equal(rejected.analytics,false);
  assert.ok(Number.isFinite(Date.parse(rejected.at)));
  e.footer.settings.click();e.choose('analytics');
  assert.equal(e.c.MHMeasurement.consentSnapshot().analytics,true);
  assert.equal(e.c.MHMeasurement.consentSnapshot().advertising,false);
  e.footer.settings.click();e.choose('all');
  const accepted=e.c.MHMeasurement.consentSnapshot();assert.equal(accepted.advertising,true);
  assert.equal(accepted.ad_personalization,false);assert.equal(rejected.advertising,false);
  const restored=measurementEnvironment(JSON.parse(e.storage.get('mh_measurement_consent')));
  assert.equal(restored.c.MHMeasurement.consentSnapshot().at,accepted.at);
  for(const at of ['invalid',Date.now()+86400000,Date.now()-15552000001]){
    const invalid=measurementEnvironment({analytics:true,advertising:true,at});
    assert.equal(invalid.c.MHMeasurement.consentSnapshot().at,null);
    assert.equal(invalid.scripts.length,0);
  }
});
test('consent changes notify GTM without duplicating its loader or direct conversions',()=>{
  const e=measurementEnvironment();e.choose('analytics');assert.equal(e.scripts.length,1);
  e.footer.settings.click();e.choose('all');assert.equal(e.scripts.length,1);
  assert.equal(e.c.dataLayer.filter(x=>x.event==='mh_analytics_ready').length,1);
  assert.equal(e.c.dataLayer.filter(x=>x.event==='mh_advertising_ready').length,1);
  e.c.MHMeasurement.leadAccepted({accepted:true,destination:'resimpli'});
  assert.equal(e.c.dataLayer.filter(x=>x.event==='generate_lead').length,0);
  e.c.MHMeasurement.leadAccepted({accepted:true,destination:'resimpli',crm_verified:true});
  e.c.MHMeasurement.leadAccepted({accepted:true,destination:'resimpli',crm_verified:true});
  const events=e.c.dataLayer.filter(x=>x.event==='generate_lead');assert.equal(events.length,1);
  assert.match(events[0].mh_submission_id,/^[a-f0-9-]{36}$/);
  assert.equal(e.c.dataLayer.filter(x=>x[0]==='event'&&x[1]==='conversion').length,0);
  const set=e.c.dataLayer.find(x=>x[0]==='set');
  assert.equal(set[1].page_location,'https://www.malihaus.com/sell-your-house/florida/');
});
