const test=require('node:test'),assert=require('node:assert/strict');
const {websiteEnvelope,LOCATION,WORKFLOW}=require('../../integration/resimpli-intake/ghl-website-envelope.cjs');
const {prepare,deliver,C}=require('../../integration/resimpli-intake/ppc-resimpli.cjs');
const now=Date.parse('2026-11-17T00:30:00Z');
function source({at='2026-11-17T00:29:00Z',note='Needs a roof',state='FL',phone='+12025550189',email='malihaus-launch-qa-20261116@example.com'}={}){
 const address='135 MaliHaus QA Website Intake Lane',city='Boca Raton',zip='33432';
 const summary='MaliHausQA DoNotContact enquired through the website funnel about '+address+', '+city+', '+state+', '+zip+'. Their notes: '+note;
 return {location:{id:LOCATION},workflow:{id:WORKFLOW},contact_id:'kr9JckkvQIchcFBrbp3B',first_name:'MaliHausQA',last_name:'DoNotContact',phone,email,address1:address,city,state,postal_code:zip,
 'Property Type':'Single family home','Property Ownership':'Yes, I am the owner','Property Condition':'Needs a roof','Desired Selling Timeframe':'Yes, within 30 days',
 'Conversation Summary':summary+'\nConsent: '+JSON.stringify({given:true,at,page:'https://www.malihaus.com/get-offer/#quiz'})+'\nAttribution: '+JSON.stringify({utm_source:'direct',landing_page:'/',first_seen:'2026-11-17T00:28:00Z'})};
}
function fixture(options){const p=websiteEnvelope(source(options));p.test_mode='synthetic_qa';p.qa_destination='production_ppc';return p;}
const prep=p=>prepare(p,now,{productionQaEnabled:true});
test('the website route preserves the complete captured enquiry and original timestamp',()=>{const s=source(),p=fixture(),e=prep(p);assert.equal(e.details.original_summary,s['Conversation Summary']);assert.equal(e.original_enquiry_at,'2026-11-17T00:29:00Z');assert.equal(e.create.marketingCampignId,C.ppcCampaign);assert.equal(e.details.page,'/get-offer/');assert.equal(e.google_export_allowed,false);assert.match(e.comment,/DO NOT CONTACT/);});
test('a replay of an existing-contact submission has the same event identity',()=>{const p=websiteEnvelope(source());assert.deepEqual(p,websiteEnvelope(structuredClone(source())));assert.match(p.event_id,/^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-a[a-f\d]{3}-[a-f\d]{12}$/);});
test('a new submission time has a new event but an identical enquiry remains a semantic duplicate',()=>{const a=prep(fixture()),b=prep(fixture({at:'2026-11-17T00:29:30Z'}));assert.notEqual(a.enquiry_key,b.enquiry_key);assert.equal(a.dedupe_fingerprint,b.dedupe_fingerprint);});
test('changed notes do not disappear into the semantic duplicate guard',()=>{assert.notEqual(prep(fixture()).dedupe_fingerprint,prep(fixture({note:'Roof now leaking'})).dedupe_fingerprint);});
test('main website and Florida PPC delivery have independent public holds',()=>{const p=websiteEnvelope(source());assert.throws(()=>prepare(p,now,{productionEnabled:true}),/WEBSITE_DELIVERY_HOLD/);assert.throws(()=>prepare(p,now,{websiteEnabled:true}),/WEBSITE_DELIVERY_HOLD/);assert.throws(()=>prepare(fixture(),now),/WEBSITE_QA_SCOPE_REQUIRED/);});
for(const [name,mutate] of [
 ['wrong location',s=>s.location.id='different'],['wrong workflow',s=>s.workflow.id='different'],['missing summary',s=>delete s['Conversation Summary']],
 ['wrong page',s=>s['Conversation Summary']=s['Conversation Summary'].replace('/get-offer/','/other/')],
 ['consent missing',s=>s['Conversation Summary']=s['Conversation Summary'].replace('"given":true','"given":false')]
])test(name+' is rejected before dispatch',()=>{const s=source();mutate(s);assert.throws(()=>websiteEnvelope(s));});
for(const [name,mutate] of [
 ['property mismatch',p=>p.fields.address='Another property'],['timestamp invalid',p=>{const d=JSON.parse(p.fields.conversation_summary.split('\n').slice(1).join('\n'));d.enquiry_at='invalid';p.fields.conversation_summary='Website seller enquiry\n'+JSON.stringify(d);}],
 ['QA real callback number',p=>p.fields.phone='+14157994243'],['QA other address',p=>p.fields.address='Other'],
 ['incomplete ownership',p=>p.fields.property_ownership=''],['wrong contact source',p=>{p.fields.conversation_summary=p.fields.conversation_summary.replace('kr9JckkvQIchcFBrbp3B','wrong');}]
])test(name+' fails closed',()=>{const p=fixture();mutate(p);assert.throws(()=>prep(p));});
test('expired source is usable for read-only reconciliation but never as a new write',()=>{const p=fixture({at:'2026-11-15T00:00:00Z'});assert.throws(()=>prep(p),/INVALID_WEBSITE_SOURCE/);assert.equal(prepare(p,now,{productionQaEnabled:true,allowStaleReadOnly:true}).original_enquiry_at,'2026-11-15T00:00:00Z');});
test('production supports other US states and email-only enquiries without inventing call permission',()=>{const s=source({state:'OH',phone:'',email:'seller@real-domain.test'});s.first_name='Jordan';s.last_name='Seller';s['Conversation Summary']=s['Conversation Summary'].replace('MaliHausQA DoNotContact','Jordan Seller');const e=prepare(websiteEnvelope(s),now,{websiteEnabled:true});assert.equal(e.details.state,'OH');assert.equal(e.details.contact_permission.enquiry_call,false);assert.equal(e.details.contact_permission.enquiry_email,true);assert.deepEqual(e.contact.phoneNumbers,[]);assert.equal(e.create.marketingCampignId,C.ppcCampaign);});
test('website intake still requires an immutable CRM receipt and replay makes zero extra writes',async()=>{const e=prep(fixture()),id='6af9ed8801d4b214e9ddaf55';let writes=0;const notes=[];const ok=data=>({statusCode:200,type:'SUCCESS',data});const list=items=>ok({page:1,limit:100,count:items.length,items});
 const api=async(path,b)=>{if(path==='lead/list')return list([{_id:id,type:'Lead',address:e.address}]);if(path==='lead/details')return ok({leadData:{_id:id,isDeleted:false,address:e.address,marketId:C.market,pipelineId:C.pipeline,marketingCampignId:C.ppcCampaign,isHotLead:false,isClosedManually:false,contactData:[e.contact]}});if(path==='activity/list')return list(notes);if(path==='activity/add'){writes++;notes.push({_id:'6af9ed8801d4b214e9ddaf56',subModuleId:id,activityType:8,isDeleted:false,isEnabled:true,createdAt:now,comment:b.comment});return ok({});}throw Error('UNEXPECTED');};
 assert.equal((await deliver(e,api,{writeEnabled:true})).delivery_state,'crm_existing_enquiry_appended_verified');assert.equal((await deliver(e,api,{writeEnabled:true})).delivery_state,'crm_existing_receipt_verified');assert.equal(writes,1);
});

test('a branch without a condition answer preserves its absence',()=>{const s=source();s['Property Condition']='';const e=prep({...websiteEnvelope(s),test_mode:'synthetic_qa',qa_destination:'production_ppc'});assert.equal(e.details.condition,'');});
test('vacant land maps to the documented land API type',()=>{const s=source();s['Property Type']='Vacant land';const e=prep({...websiteEnvelope(s),test_mode:'synthetic_qa',qa_destination:'production_ppc'});assert.equal(e.create.propertyType,'land');});

test('a prior GHL condition is ignored when this branch did not ask it',()=>{const s=source();s['Property Condition']='Old answer';assert.equal(websiteEnvelope(s).fields.property_condition,'');});
test('a per-submission snapshot clears a previous phone and stale qualification fields',()=>{const s=source(),marker='\nConsent: ',i=s['Conversation Summary'].indexOf(marker);const contact={firstName:s.first_name,lastName:s.last_name,phone:'',email:s.email,address:s.address1,city:s.city,state:s.state,zip:s.postal_code,propertyType:'Vacant land'};s['Conversation Summary']=s['Conversation Summary'].slice(0,i)+'\nSubmission: '+JSON.stringify({schema:'mh-website-fields-v1',contact,answers:{title:'Yes, I am the owner',timeline:'Within 30 days'}})+s['Conversation Summary'].slice(i);const p=websiteEnvelope(s),d=JSON.parse(p.fields.conversation_summary.slice(p.fields.conversation_summary.indexOf('{')));assert.equal(p.fields.phone,'');assert.equal(p.fields.property_condition,'');assert.equal(d.property_type,'Vacant land');assert.equal(d.contact_permission.enquiry_call,false);});
