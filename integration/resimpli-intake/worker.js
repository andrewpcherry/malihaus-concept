/* PPC page -> private durable ingress -> private Zapier REsimpli worker.
 * HOLD: public delivery stays disabled pending production acceptance.
 * REsimpli credentials remain exclusively in the existing Zapier connection.
 */
import storeModule from './intake-store-core.cjs';
import ppc from './ppc-resimpli.cjs';
import {timingSafeEqual} from 'node:crypto';
const {IntakeStore}=storeModule;
const json=(status,data,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const allowed=env=>String(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
const missing=env=>['PPC_INTAKE','ZAPIER_INTAKE_HOOK','INTAKE_STORAGE_KEY','ALLOWED_ORIGINS'].filter(k=>!env[k]);
const equals=(a,b)=>{if(!a||!b)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
async function readJson(request){const reader=request.body?.getReader();if(!reader)throw Error('BODY_REQUIRED');const chunks=[];let n=0;while(true){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>24000){await reader.cancel();throw Error('BODY_TOO_LARGE');}chunks.push(value);}return JSON.parse(Buffer.concat(chunks).toString());}
export default {async fetch(request,env){const u=new URL(request.url);if(u.pathname==='/health')return json(200,{missing:missing(env),public_intake_held:env.DELIVERY_ENABLED!=='true',website_intake_held:env.WEBSITE_DELIVERY_ENABLED!=='true',qa_enabled:env.QA_ENABLED==='true',production_qa_enabled:env.PRODUCTION_QA_ENABLED==='true'});if(missing(env).length)return json(503,{state:'rejected_before_dispatch',error:'NOT_CONFIGURED'});return env.PPC_INTAKE.get(env.PPC_INTAKE.idFromName('malihaus-ppc-v1')).fetch(request);}};
export class PpcIntake {
 constructor(ctx,env,{now=Date.now}={}){
  this.ctx=ctx;this.env=env;this.now=now;const sql=ctx.storage.sql;
  const db={exec(query){for(const q of query.split(';').filter(x=>x.trim()))sql.exec(q);},prepare(query){return {get(...v){return sql.exec(query,...v).toArray()[0];},all(...v){return sql.exec(query,...v).toArray();},run(...v){sql.exec(query,...v);}};},close(){}};
  this.store=new IntakeStore(db,Buffer.from(env.INTAKE_STORAGE_KEY,'base64'),fn=>ctx.storage.transactionSync(fn));this.store.recoverAfterRestart();sql.exec('CREATE TABLE IF NOT EXISTS rate_bucket (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL)');
 }
 async fetch(request){
  const env=this.env,u=new URL(request.url),origin=request.headers.get('Origin')||'',originOk=allowed(env).includes(origin),cors=originOk?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{'Vary':'Origin'};
  const reply=(status,data)=>json(status,data,cors);
  if(request.method==='OPTIONS')return new Response(null,{status:originOk?204:403,headers:{...cors,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
  if(request.method!=='POST')return reply(405,{state:'rejected_before_dispatch'});
  const isCallback=u.pathname==='/api/intake/callback',isExecution=u.pathname==='/api/intake/execution';if(!isCallback&&!isExecution&&!originOk)return reply(403,{state:'rejected_before_dispatch'});
  if(!String(request.headers.get('Content-Type')).startsWith('application/json'))return reply(415,{state:'rejected_before_dispatch'});
  let data;try{data=await readJson(request);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('OBJECT_REQUIRED');}catch{return reply(400,{state:'rejected_before_dispatch'});}
  if(isExecution){try{return reply(200,{write_allowed:this.store.execution(data.callback_token,data.enquiry_key,data.enquiry_sha256)});}catch{return reply(409,{write_allowed:false});}}
  if(isCallback){try{this.store.callback(data.callback_token,data.receipt);return reply(200,{received:true});}catch{return reply(409,{received:false});}}
  if(u.pathname==='/api/intake/status'){if(!/^[a-f0-9]{64}$/.test(data.read_token||''))return reply(404,{state:'unknown'});const row=this.store.status(data.read_token);if(!row)return reply(404,{state:'unknown'});delete row.read_token;return reply(200,row);}
  if(u.pathname==='/api/intake/reconcile'){
   if(env.QA_ENABLED!=='true'||!equals(request.headers.get('X-MaliHaus-QA'),env.QA_AUTH_TOKEN))return reply(403,{state:'rejected_before_dispatch'});
   let job;try{job=this.store.reviewJob(data.read_token);if(job.payload.test_mode!=='synthetic_qa')throw Error('QA_ONLY');}catch{return reply(409,{state:'manual_review_required'});}
   const message={...job.payload,enquiry_key:job.enquiry_key,reconcile_only:true,receipt:{url:u.origin+'/api/intake/callback',callback_token:job.callback_token}};
   this.dispatch(message,job.enquiry_key);return reply(202,{state:'reconciliation_requested',write_allowed:false});
  }
  if(u.pathname!=='/api/intake')return reply(404,{state:'rejected_before_dispatch'});
  const qa=data?.test_mode==='synthetic_qa',website=data?.schema==='mh-website-intake-v1';if(qa?!(env.QA_ENABLED==='true'&&equals(request.headers.get('X-MaliHaus-QA'),env.QA_AUTH_TOKEN)):(website?env.WEBSITE_DELIVERY_ENABLED!=='true':env.DELIVERY_ENABLED!=='true'))return reply(503,{state:'rejected_before_dispatch',error:'DELIVERY_HOLD'});
  let e;try{if(data.website)throw Error('HONEYPOT');e=ppc.prepare(data,this.now(),{productionEnabled:env.DELIVERY_ENABLED==='true',websiteEnabled:env.WEBSITE_DELIVERY_ENABLED==='true',productionQaEnabled:env.PRODUCTION_QA_ENABLED==='true'});}catch{return reply(422,{state:'rejected_before_dispatch'});}
  const bucket=ppc.hash(request.headers.get('CF-Connecting-IP')||'unknown')+':'+Math.floor(this.now()/60000);
  const count=this.ctx.storage.transactionSync(()=>{this.ctx.storage.sql.exec('INSERT INTO rate_bucket VALUES (?,1) ON CONFLICT(bucket) DO UPDATE SET count=count+1',bucket);const r=this.ctx.storage.sql.exec('SELECT count FROM rate_bucket WHERE bucket=?',bucket).toArray()[0];this.ctx.storage.sql.exec('DELETE FROM rate_bucket WHERE bucket NOT LIKE ?', '%:'+Math.floor(this.now()/60000));return r.count;});if(count>20)return reply(429,{state:'rejected_before_dispatch'});
  let hook;try{hook=new URL(env.ZAPIER_INTAKE_HOOK);if(hook.protocol!=='https:'||hook.hostname!=='hooks.zapier.com'||!hook.pathname.startsWith('/hooks/catch/'))throw Error('INVALID_PRIVATE_HOOK');}catch{return reply(503,{state:'rejected_before_dispatch',error:'NOT_CONFIGURED'});}
  let claim;try{claim=this.store.claim(e,data,this.now());}catch(error){const conflict=['EVENT_CONTENT_CONFLICT','PROPERTY_DELIVERY_PENDING_REVIEW'].includes(error.message);return reply(conflict?409:503,{state:conflict?(error.message==='EVENT_CONTENT_CONFLICT'?'event_content_conflict':'property_delivery_pending_review'):'rejected_before_dispatch',error:conflict?'CLAIM_CONFLICT':'PRIVATE_STORAGE_UNAVAILABLE'});}
  const publicClaim={...claim};delete publicClaim.callback_token;delete publicClaim.dispatch;
  if(claim.dispatch){this.store.markDispatched(e.enquiry_key);const message={...data,enquiry_key:e.enquiry_key,receipt:{url:u.origin+'/api/intake/callback',callback_token:claim.callback_token}};this.dispatch(message,e.enquiry_key);}
  return reply(202,publicClaim);
 }
 dispatch(message,key){this.ctx.waitUntil((async()=>{try{const hook=new URL(this.env.ZAPIER_INTAKE_HOOK);if(hook.protocol!=='https:'||hook.hostname!=='hooks.zapier.com'||!hook.pathname.startsWith('/hooks/catch/'))throw Error('INVALID_PRIVATE_HOOK');const r=await fetch(hook.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ppc_payload:JSON.stringify(message)}),signal:AbortSignal.timeout(15000)});if(!r.ok)this.store.uncertain(key);}catch{this.store.uncertain(key);}})());}
}
