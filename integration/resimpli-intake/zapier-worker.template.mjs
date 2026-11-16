// HOLD: the public route and all Google exports remain disabled.
const CALLBACK_ORIGIN='https://malihaus-lead-intake.andrew-1ee.workers.dev';
export default async function main({inputData,connections}) {
 const envelope=typeof inputData.payload==='string'?JSON.parse(inputData.payload||'{}'):inputData.payload;
 const p=typeof envelope?.ppc_payload==='string'?JSON.parse(envelope.ppc_payload):(envelope?.ppc_payload||envelope);
 if(!p.receipt||p.receipt.url!==CALLBACK_ORIGIN+'/api/intake/callback'||!/^[a-f0-9]{64}$/.test(p.receipt.callback_token||''))throw Error('TRUSTED_CALLBACK_REQUIRED');
 const e=prepare(p,Date.now(),{productionEnabled:false,allowStaleReadOnly:p.reconcile_only===true});
 if(p.enquiry_key!==e.enquiry_key)throw Error('EVENT_KEY_MISMATCH');
 if(p.qa_scenario&&!['before_provider_failure','after_write_ack_loss'].includes(p.qa_scenario))throw Error('QA_SCENARIO_INVALID');
 if(p.qa_scenario&&!e.qa)throw Error('QA_ONLY');
 let readOnly=p.reconcile_only===true;
 if(!readOnly){const gate=await fetch(CALLBACK_ORIGIN+'/api/intake/execution',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({callback_token:p.receipt.callback_token,enquiry_key:e.enquiry_key,enquiry_sha256:e.enquiry_sha256}),signal:AbortSignal.timeout(15000)});if(!gate.ok)throw Error('PRIVATE_EXECUTION_GUARD_UNAVAILABLE');const grant=await gate.json();readOnly=grant.write_allowed!==true;}
 let readRequests=0,writeRequests=0;
 const api=async(path,body)=>{
  if(p.qa_scenario==='before_provider_failure'&&!readOnly)throw Error('CONTROLLED_QA_PROVIDER_UNAVAILABLE');
  const write=/\/add$/.test(path);
  if(write&&readOnly)throw Error('RECONCILIATION_MUST_BE_READ_ONLY');
  if(write)writeRequests++;else readRequests++;
  const r=await zapier.fetch(C.base+'/'+path,{connection:connections.resimpli,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),...(write?{idempotencyKey:hash(e.enquiry_key+':'+path)}:{}),maxTimeSeconds:12});
  const responseBody=await r.json();
  if(write&&p.qa_scenario==='after_write_ack_loss'&&!readOnly&&r.ok)throw Error('CONTROLLED_QA_ACK_LOSS');
  return {status_code:r.status,body:responseBody};
 };
 const result=await deliver(e,api,{writeEnabled:!readOnly,reconcileOnly:readOnly});
 const callback=await fetch(p.receipt.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({callback_token:p.receipt.callback_token,receipt:result}),signal:AbortSignal.timeout(15000)});
 if(!callback.ok)throw Error('RECEIPT_CALLBACK_NOT_ACKNOWLEDGED');
 return {enquiry_key:e.enquiry_key,delivery_state:result.delivery_state,crm_lead_id:result.crm_lead_id,source_activity_id:result.source_activity_id||'',duplicate:result.duplicate===true,read_requests:readRequests,write_requests:writeRequests,receipt_received:true,execution_write_allowed:!readOnly,retry_allowed:false,google_export_allowed:false};
}
