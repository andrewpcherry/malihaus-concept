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
 for(let i=0;i<16;i++){
  const status=await fetch(ORIGIN+'/api/intake/status',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://www.malihaus.com'},body:JSON.stringify({read_token:claim.read_token}),signal:AbortSignal.timeout(12000)}),b=await status.json();
  if(status.ok&&b.accepted===true&&b.enquiry_key===claim.enquiry_key&&b.receipt?.crm_lead_id&&b.receipt?.source_activity_id)return {accepted:true,enquiry_key:claim.enquiry_key,crm_lead_id:b.receipt.crm_lead_id,source_activity_id:b.receipt.source_activity_id,duplicate:claim.duplicate===true||b.receipt.duplicate===true,google_export_allowed:false};
  if(!status.ok||!['queued','dispatch_started'].includes(b.state))throw Error('WEBSITE_CRM_RECEIPT_REQUIRES_REVIEW');
  await new Promise(resolve=>setTimeout(resolve,1500));
 }
 throw Error('WEBSITE_CRM_RECEIPT_PENDING_NO_AUTOMATIC_RETRY');
}
