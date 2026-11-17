'use strict';
import {createHash} from 'node:crypto';
const LOCATION='JVRM7MPpimJUrPpB5o28';
const WORKFLOW='c1cebf3a-e3dc-41c1-aade-08448211710d';
function websiteEnvelope(input){
 const p=typeof input==='string'?JSON.parse(input):input;
 if(!p||p.location?.id!==LOCATION||p.workflow?.id!==WORKFLOW||!p.contact_id)throw Error('WEBSITE_SOURCE_MISMATCH');
 const get=(label,key)=>p[label]??p[key]??'';
 const summary=String(get('Conversation Summary','conversation_summary'));
 if(!summary||summary.length>16000)throw Error('WEBSITE_SUMMARY_REQUIRED');
 const marker='\nConsent: ',attributionMarker='\nAttribution: ';
 const a=summary.lastIndexOf(marker),b=summary.lastIndexOf(attributionMarker);
 if(a<0||b<a)throw Error('WEBSITE_CONSENT_REQUIRED');
 const consent=JSON.parse(summary.slice(a+marker.length,b).trim());
 const attribution=JSON.parse(summary.slice(b+attributionMarker.length).trim());
 const page=new URL(consent.page);
 if(consent.given!==true||page.origin!=='https://www.malihaus.com'||page.pathname!=='/get-offer/')throw Error('WEBSITE_CONSENT_SOURCE_MISMATCH');
 // The per-submission snapshot prevents old GHL contact fields leaking into
 // a later enquiry when a blank answer or omitted phone is not overwritten.
 const snapshotMarker='\nSubmission: ',si=summary.lastIndexOf(snapshotMarker);
 const submitted=si>=0?JSON.parse(summary.slice(si+snapshotMarker.length,a).trim()):null;
 if(submitted&&submitted.schema!=='mh-website-fields-v1')throw Error('WEBSITE_SNAPSHOT_REQUIRED');
 const answer=q=>{const prefix='\n'+q+': ';const lines=summary.slice(0,a).split('\n');return lines.find(x=>x.startsWith(prefix.slice(1)))?.slice(prefix.length-1)||'';};
 const c=submitted?.contact;
 const currentAnswers=submitted?.answers;
 const fields=c?{first_name:c.firstName,last_name:c.lastName,phone:c.phone||'',email:c.email||'',address:c.address,city:c.city,state:c.state,postal_code:c.zip,
  property_ownership:currentAnswers?.title||'',property_condition:currentAnswers?.issue||'',desired_selling_timeframe:currentAnswers?.timeline||currentAnswers?.dateset||''}:
 {first_name:p.first_name,last_name:p.last_name,phone:p.phone||'',email:p.email||'',address:p.address1,city:p.city,state:p.state,postal_code:p.postal_code,
  property_ownership:answer('Are you the owner on the title?')||get('Property Ownership','property_ownership'),property_condition:answer('What is the main problem?'),desired_selling_timeframe:answer('How soon do you want this resolved?')||answer('Has a date actually been set?')||get('Desired Selling Timeframe','desired_selling_timeframe')};
 const details={schema:'mh-website-enquiry-v1',page_id:'mh_website_funnel_v1',page:'/get-offer/',enquiry_at:consent.at,property_address:fields.address,city:fields.city,state:fields.state,zip:fields.postal_code,
  property_type:c?.propertyType||answer('What kind of property is it?')||get('Property Type','property_type'),ownership:fields.property_ownership,condition:fields.property_condition,timeline:fields.desired_selling_timeframe,contact_permission:{enquiry_call:!!fields.phone,enquiry_email:!!fields.email,marketing_sms:false,at:consent.at},
  measurement_choice:{analytics:false,advertising:false,ad_personalization:false,at:null,notice_version:'mh-measurement-v1'},attribution,
  original_summary:summary,source_contact_id:p.contact_id,source_location_id:LOCATION,source_workflow_id:WORKFLOW};
 // The event identity comes from the captured submission, never processing time.
 const h=createHash('sha256').update(JSON.stringify([LOCATION,p.contact_id,consent.at])).digest('hex');
 const event_id=h.slice(0,8)+'-'+h.slice(8,12)+'-4'+h.slice(13,16)+'-a'+h.slice(17,20)+'-'+h.slice(20,32);
 fields.conversation_summary='Website seller enquiry\n'+JSON.stringify(details);
 return {schema:'mh-website-intake-v1',event_id,fields};
}

// HighLevel captures the main website. The durable service confirms REsimpli.
// No REsimpli key or private Zapier catch URL belongs in this bridge.
const ORIGIN='https://malihaus-lead-intake.andrew-1ee.workers.dev';
export default async function main({inputData}){
 const p=websiteEnvelope(inputData.payload);
 const headers={'Content-Type':'application/json','Origin':'https://www.malihaus.com'};
 // Only a temporary native test mapping may supply private QA authorization.
 // This value is never generated, returned, logged or placed in source code.
 if(inputData.qa_authorization){
  if(!/^[A-Za-z0-9_-]{20,}$/.test(inputData.qa_authorization))throw Error('INVALID_QA_AUTHORIZATION');
  p.test_mode='synthetic_qa';p.qa_destination='production_ppc';headers['X-MaliHaus-QA']=inputData.qa_authorization;
 }
 const r=await fetch(ORIGIN+'/api/intake',{method:'POST',headers,body:JSON.stringify(p),signal:AbortSignal.timeout(15000)}),claim=await r.json();
 if(!r.ok||!claim.enquiry_key||!claim.read_token)throw Error('WEBSITE_INTAKE_NOT_ACCEPTED_'+r.status);
 for(let i=0;i<32;i++){
  const status=await fetch(ORIGIN+'/api/intake/status',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://www.malihaus.com'},body:JSON.stringify({read_token:claim.read_token}),signal:AbortSignal.timeout(12000)}),b=await status.json();
  if(status.ok&&b.accepted===true&&b.enquiry_key===claim.enquiry_key&&b.receipt?.crm_lead_id&&b.receipt?.source_activity_id)return {accepted:true,enquiry_key:claim.enquiry_key,crm_lead_id:b.receipt.crm_lead_id,source_activity_id:b.receipt.source_activity_id,duplicate:claim.duplicate===true||b.receipt.duplicate===true,google_export_allowed:false};
  if(!status.ok||!['queued','dispatch_started'].includes(b.state))throw Error('WEBSITE_CRM_RECEIPT_REQUIRES_REVIEW');
  await new Promise(resolve=>setTimeout(resolve,1500));
 }
 throw Error('WEBSITE_CRM_RECEIPT_PENDING_NO_AUTOMATIC_RETRY');
}
