'use strict';
// PPC enquiry contract and REsimpli worker. No credentials, SDKs or GHL dependency.
const {createHash}=require('node:crypto');
const C=Object.freeze({base:'https://api.resimpli.com/api/v6/openapi',qaCampaign:'6af9d9050330f0ab2cd920d7',ppcCampaign:'6aa4e0be6006b0594f25d6f1',market:'67cb2775cdac00bfc44449ad',pipeline:'6aa4dcb1d18014f8fc607d1b',status:'6aa4dcb1d18014f8fc607d1c'});
const parse=x=>typeof x==='string'?JSON.parse(x):x;
const hash=x=>createHash('sha256').update(x).digest('hex');
const norm=x=>String(x||'').normalize('NFKC').toLowerCase().replace(/[.,]/g,' ').replace(/\s+/g,' ').trim();
const phone=x=>String(x||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
const oid=x=>/^[a-f0-9]{24}$/.test(x||'');
const esc=x=>String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function text(x){return String(x||'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(?:p|div|pre)>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');}
function response(x){let r=parse(x);if(r&&'body'in r){if(r.status_code&&Number(r.status_code)!==200)throw Error('HTTP_READ_FAILED');r=parse(r.body);}if(!r||Number(r.statusCode)!==200||r.type!=='SUCCESS')throw Error('PROVIDER_NOT_SUCCESS');return r;}
function complete(x){const d=response(x).data;if(!d||!Array.isArray(d.items)||d.page!==1||d.limit!==100||d.count!==d.items.length||d.count>=100)throw Error('INCOMPLETE_READ');return d.items;}
function prepare(payload,now=Date.now(),{productionEnabled=false,allowStaleReadOnly=false,productionQaEnabled=false}={}){
 const p=parse(payload);if(!p||p.schema!=='mh-ppc-intake-v1'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(p.event_id||''))throw Error('INVALID_PPC_ENVELOPE');
 const f=p.fields;if(!f||typeof f!=='object'||Array.isArray(f))throw Error('FIELDS_REQUIRED');
 const summary=String(f.conversation_summary||'');if(!summary.startsWith('Florida cash-offer enquiry\n')||summary.length>16000)throw Error('SUMMARY_REQUIRED');
 const d=JSON.parse(summary.slice(summary.indexOf('{'))),at=Date.parse(d.enquiry_at);
 if(d.page_id!=='mh_google_cash_offer_florida_v1'||d.page!=='/sell-your-house/florida/'||d.market!=='Florida'||d.state!=='FL'||!/^3\d{4}$/.test(d.zip||'')||!Number.isFinite(at)||at>now+30000||(!allowStaleReadOnly&&now-at>86400000))throw Error('INVALID_ENQUIRY');
 for(const k of ['property_address','city'])if(typeof d[k]!=='string'||!d[k].trim()||d[k].length>200)throw Error('INVALID_PROPERTY');
 if(norm(f.address)!==norm(d.property_address)||norm(f.city)!==norm(d.city)||f.state!=='FL'||String(f.postal_code)!==d.zip)throw Error('PROPERTY_MISMATCH');
 if(d.contact_permission?.enquiry_call!==true||d.contact_permission.marketing_sms!==false||d.contact_permission.at!==d.enquiry_at)throw Error('CALL_PERMISSION_REQUIRED');
 if(!['I own the property','I’m authorized to act for the owner or estate','I’m helping the owner','Other'].includes(d.ownership)||!['Move-in ready','Needs some updating','Needs major repairs','Not sure'].includes(d.condition)||!['As soon as possible','Within 30 days','Within 1–3 months','More than 3 months / exploring'].includes(d.timeline))throw Error('QUALIFICATION_REQUIRED');
 if(f.property_ownership!==d.ownership||f.property_condition!==d.condition||f.desired_selling_timeframe!==d.timeline)throw Error('QUALIFICATION_MISMATCH');
 const m=d.measurement_choice;if(!m||typeof m.analytics!=='boolean'||typeof m.advertising!=='boolean'||m.ad_personalization!==false||m.notice_version!=='mh-measurement-v1'||(m.at===null?(m.analytics||m.advertising):(!Number.isFinite(Date.parse(m.at))||Date.parse(m.at)>at)))throw Error('INVALID_MEASUREMENT_CHOICE');
 if(!d.attribution||typeof d.attribution!=='object'||Array.isArray(d.attribution)||Object.values(d.attribution).some(v=>typeof v!=='string'||v.length>500))throw Error('INVALID_ATTRIBUTION');
 if(!f.first_name?.trim()||!f.last_name?.trim()||f.first_name.length>100||f.last_name.length>100||!/^\d{10}$/.test(phone(f.phone))||(f.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)))throw Error('INVALID_CONTACT');
 const qa=p.test_mode==='synthetic_qa';
 const productionQa=qa&&p.qa_destination==='production_ppc';
 if(p.qa_destination&&(!productionQa||!productionQaEnabled||!['131 MaliHaus QA Notification Test Lane','133 MaliHaus QA Team Acceptance Lane'].includes(f.address)))throw Error('PRODUCTION_QA_HOLD');
 const reviewedRecovery=qa&&p.recovery_of==='mhqa_b3b52366a12970f3026092b8'&&hash(JSON.stringify(d))==='b3f207edf857ac7719a92faf22cbdc71b4ae49208004a16a1baf6997d179a61f';
 if(p.recovery_of&&!reviewedRecovery)throw Error('UNAPPROVED_RECOVERY');
 if(qa){if(f.first_name!=='MaliHausQA'||f.last_name!=='DoNotContact'||phone(f.phone)!=='2025550189'||f.email!=='malihaus-launch-qa-20261116@example.com'||!(productionQa?['131 MaliHaus QA Notification Test Lane','133 MaliHaus QA Team Acceptance Lane'].includes(d.property_address):['123 MaliHaus QA Test Lane','127 MaliHaus QA Browser Test Lane','129 MaliHaus QA Production Test Lane'].includes(d.property_address))||d.city!=='Boca Raton'||d.zip!=='33432'||m.analytics||m.advertising||(d.attribution.gclid!=='QA_DIRECT_20261117'&&!reviewedRecovery))throw Error('QA_SCOPE_REQUIRED');for(const k of ['gbraid','wbraid'])if(d.attribution[k]&&!d.attribution[k].startsWith('QA_'))throw Error('QA_SCOPE_REQUIRED');}
 else if(!productionEnabled||p.test_mode||/qa|do.?not.?contact/i.test(f.first_name+' '+f.last_name)||/@example\.(com|invalid)$/i.test(f.email||''))throw Error('PRODUCTION_DELIVERY_HOLD');
 const address=d.property_address.trim()+', '+d.city.trim()+', FL '+d.zip;
 const contact={firstName:f.first_name.trim(),lastName:f.last_name.trim(),phoneNumbers:[{phoneNumber:'+1'+phone(f.phone),isPrimary:true}],...(f.email?{emails:[{email:f.email.trim(),isPrimary:true}]}:{})};
 const key='mhppc_'+hash(p.event_id).slice(0,32),digest=hash(JSON.stringify(d));
 const fingerprint=hash(JSON.stringify([norm(address),norm(contact.firstName),norm(contact.lastName),phone(f.phone),norm(f.email),d.ownership,d.condition,d.timeline,m.analytics,m.advertising]));
 const destinationCampaign=productionQa?C.ppcCampaign:(qa?C.qaCampaign:C.ppcCampaign);
 const metadata={schema:'mh-ppc-receipt-v1',enquiry_key:key,event_id:p.event_id,enquiry_sha256:digest,dedupe_fingerprint:fingerprint,synthetic_qa:qa,recovery_of:p.recovery_of||'',google_export_allowed:false};
 const comment=esc((qa?'SYNTHETIC MALIHAUS QA. NO REAL SELLER. DO NOT CONTACT. DO NOT IMPORT TO GOOGLE.\n':'')+summary+'\n\nMaliHaus PPC metadata\n'+JSON.stringify(metadata));
 return {enquiry_key:key,event_id:p.event_id,payload_sha256:hash(JSON.stringify(p)),original_enquiry_at:d.enquiry_at,qa,destinationCampaign,address,contact,details:d,comment,enquiry_sha256:digest,dedupe_fingerprint:fingerprint,queue_key:'mhprop_'+hash(norm(address)).slice(0,24),lookup:{searchStr:d.property_address.toLowerCase().trim(),page:1,limit:100},create:{contactDetails:contact,propertyType:'residential',address,marketingCampignId:destinationCampaign,marketId:C.market,pipelineId:C.pipeline,mainStatusId:C.status,leadCreated:d.enquiry_at,isHotLead:false,comment},google_export_allowed:false};
}
function existing(e,r){const all=complete(r),exact=all.filter(x=>norm(x.address)===norm(e.address));if(exact.length>1)throw Error('MULTIPLE_EXACT_PROPERTIES');if(!exact.length){if(all.length)throw Error('AMBIGUOUS_PROPERTY_SEARCH');return null;}if(!oid(exact[0]._id)||exact[0].type!=='Lead')throw Error('UNSUPPORTED_EXISTING_PROPERTY');return exact[0]._id;}
function verifyLead(e,id,r){const l=response(r).data?.leadData;if(!l||l._id!==id||l.isDeleted!==false||norm(l.address)!==norm(e.address)||l.marketId!==C.market||l.pipelineId!==C.pipeline||l.isClosedManually===true)throw Error('EXISTING_PROPERTY_REVIEW_REQUIRED');if(e.qa&&(l.marketingCampignId!==e.destinationCampaign||l.isHotLead!==false))throw Error('QA_DESTINATION_MISMATCH');if(!l.contactData?.some(x=>x.isDeleted!==true&&norm(x.firstName)===norm(e.contact.firstName)&&norm(x.lastName)===norm(e.contact.lastName)&&x.phoneNumbers?.some(y=>phone(y.phoneNumber)===phone(e.contact.phoneNumbers[0].phoneNumber))&&(!e.contact.emails?.length||x.emails?.some(y=>norm(y.email)===norm(e.contact.emails[0].email)))))throw Error('EXISTING_CONTACT_MISMATCH');return l;}
function receipt(e,id,items,{allowSemanticDuplicate=false}={}){
 const matches=[];
 for(const a of items){const t=text(a.comment),split=t.split('\n\nMaliHaus PPC metadata\n');if(split.length!==2)continue;let m,d;try{m=JSON.parse(split[1].trim());d=JSON.parse(split[0].slice(split[0].indexOf('{')));}catch{continue;}
  if(m.enquiry_key!==e.enquiry_key&&!(allowSemanticDuplicate&&m.dedupe_fingerprint===e.dedupe_fingerprint&&Math.abs(Date.parse(e.original_enquiry_at)-Date.parse(d.enquiry_at))<86400000))continue;
  if(a.subModuleId!==id||a.activityType!==8||a.isDeleted!==false||a.isEnabled!==true||!oid(a._id)||!Number.isFinite(a.createdAt)||a.createdAt<Date.parse(d.enquiry_at)||m.schema!=='mh-ppc-receipt-v1'||m.synthetic_qa!==e.qa||m.google_export_allowed!==false||m.enquiry_sha256!==hash(JSON.stringify(d)))throw Error('RECEIPT_CONTENT_MISMATCH');
  if(m.enquiry_key===e.enquiry_key&&(m.event_id!==e.event_id||m.enquiry_sha256!==e.enquiry_sha256))throw Error('EVENT_CONTENT_CONFLICT');
  matches.push({activity_id:a._id,original_enquiry_at:d.enquiry_at,duplicate:m.enquiry_key!==e.enquiry_key});
 }
 if(matches.length>1)throw Error('DUPLICATE_ACTIVITY_MARKER');return matches[0]||null;
}
async function deliver(e,api,{writeEnabled=false,reconcileOnly=false}={}){
 let id='',operation='lookup',writeAttempted=false;
 const result=(state,extra={})=>({delivery_state:state,enquiry_key:e.enquiry_key,enquiry_sha256:e.enquiry_sha256,crm_lead_id:id,operation,write_attempted:writeAttempted,retry_allowed:false,google_export_allowed:false,...extra});
 try{
  id=existing(e,await api('lead/list',e.lookup))||'';
  if(id){verifyLead(e,id,await api('lead/details',{leadId:id}));const before=complete(await api('activity/list',{moduleId:1,subModuleId:id,type:1,page:1,limit:100}));const prior=receipt(e,id,before,{allowSemanticDuplicate:true});if(prior)return result('crm_existing_receipt_verified',{source_activity_id:prior.activity_id,duplicate:true,receipt_enquiry_at:prior.original_enquiry_at});operation='append';}
  else operation='create';
  if(reconcileOnly)return result('manual_review_required',{error_code:'NO_PRIOR_RECEIPT_NO_RETRY'});
  if(!writeEnabled)return result('delivery_hold',{error_code:'WRITE_NOT_ENABLED'});
  let raw;
  writeAttempted=true;
  try{raw=await api(operation==='append'?'activity/add':'lead/add',operation==='append'?{moduleId:1,subModuleId:id,comment:e.comment}:e.create);}catch{return result('uncertain_review_required',{error_code:'WRITE_TRANSPORT_OR_ACTION_ERROR'});}
  let ack;try{ack=response(raw);}catch{return result('uncertain_review_required',{error_code:'WRITE_NOT_ACKNOWLEDGED'});}
  if(operation==='create'){const l=ack.data;if(!l||!oid(l._id)||norm(l.address)!==norm(e.address)||l.marketingCampignId!==e.create.marketingCampignId||l.pipelineId!==C.pipeline||l.mainStatusId!==C.status||l.isHotLead!==false)return result('uncertain_review_required',{error_code:'CREATE_RECEIPT_MISMATCH'});id=l._id;verifyLead(e,id,await api('lead/details',{leadId:id}));}
  const found=receipt(e,id,complete(await api('activity/list',{moduleId:1,subModuleId:id,type:1,page:1,limit:100})));
  if(!found)return result('uncertain_review_required',{error_code:'WRITE_ACKNOWLEDGED_RECEIPT_MISSING'});
  return result(operation==='append'?'crm_existing_enquiry_appended_verified':'crm_created_verified',{source_activity_id:found.activity_id,duplicate:false,receipt_enquiry_at:found.original_enquiry_at});
 }catch(error){return result(writeAttempted?'uncertain_review_required':'manual_review_required',{error_code:/^[A-Z_]+$/.test(error.message)?error.message:'READ_OR_VALIDATION_ERROR'});}
}
module.exports={C,prepare,existing,verifyLead,receipt,deliver,response,complete,text,hash};
