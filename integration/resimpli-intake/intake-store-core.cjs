'use strict';
// Durable atomic claim/outbox. Keep the DB and encryption key outside the public site.
const {randomBytes,createCipheriv,createDecipheriv,createHash}=require('node:crypto');
const sha=x=>createHash('sha256').update(x).digest('hex');
const verified=new Set(['crm_created_verified','crm_existing_enquiry_appended_verified','crm_existing_receipt_verified']);
class IntakeStore {
 constructor(db,key,transaction){if(!Buffer.isBuffer(key)||key.length!==32)throw Error('32_BYTE_STORAGE_KEY_REQUIRED');this.key=key;this.db=db;this.transact=transaction;this.db.exec('CREATE TABLE IF NOT EXISTS intake (event_key TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, fingerprint TEXT NOT NULL, property_key TEXT NOT NULL, state TEXT NOT NULL, read_hash TEXT NOT NULL UNIQUE, callback_hash TEXT NOT NULL UNIQUE, sealed TEXT NOT NULL, created INTEGER NOT NULL, receipt TEXT); CREATE TABLE IF NOT EXISTS property_lock (property_key TEXT PRIMARY KEY, event_key TEXT NOT NULL); CREATE TABLE IF NOT EXISTS execution_guard (event_key TEXT PRIMARY KEY);');}
 seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);const data=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value),'utf8')),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');}
 open(value){const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',this.key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString());}
 view(row,duplicate=false){const s=this.open(row.sealed);return {enquiry_key:row.event_key,state:row.state,read_token:s.readToken,duplicate,accepted:verified.has(row.state),receipt:row.receipt?JSON.parse(row.receipt):null};}
 claim(e,payload,now=Date.now()){
  return this.transact(()=>{
   let old=this.db.prepare('SELECT * FROM intake WHERE event_key=?').get(e.enquiry_key);
   if(old){if(old.payload_hash!==e.payload_sha256)throw Error('EVENT_CONTENT_CONFLICT');return {...this.view(old,true),dispatch:false};}
   old=this.db.prepare('SELECT * FROM intake WHERE fingerprint=? AND created>? ORDER BY created DESC LIMIT 1').get(e.dedupe_fingerprint,now-86400000);
   if(old){return {...this.view(old,true),dispatch:false};}
   if(this.db.prepare('SELECT event_key FROM property_lock WHERE property_key=?').get(e.queue_key))throw Error('PROPERTY_DELIVERY_PENDING_REVIEW');
   const readToken=randomBytes(32).toString('hex'),callbackToken=randomBytes(32).toString('hex');
   this.db.prepare('INSERT INTO intake VALUES (?,?,?,?,?,?,?,?,?,NULL)').run(e.enquiry_key,e.payload_sha256,e.dedupe_fingerprint,e.queue_key,'queued',sha(readToken),sha(callbackToken),this.seal({payload,readToken,callbackToken,contentHash:e.enquiry_sha256}),now);
   this.db.prepare('INSERT INTO property_lock VALUES (?,?)').run(e.queue_key,e.enquiry_key);
   return {enquiry_key:e.enquiry_key,state:'queued',read_token:readToken,duplicate:false,accepted:false,dispatch:true,callback_token:callbackToken};
  });
 }
 status(token){const row=this.db.prepare('SELECT * FROM intake WHERE read_hash=?').get(sha(token));return row?this.view(row):null;}
 execution(token,key,digest){return this.transact(()=>{const row=this.db.prepare('SELECT * FROM intake WHERE callback_hash=?').get(sha(token));if(!row||row.event_key!==key||this.open(row.sealed).contentHash!==digest)throw Error('INVALID_EXECUTION_TOKEN');if(verified.has(row.state)||this.db.prepare('SELECT event_key FROM execution_guard WHERE event_key=?').get(key))return false;this.db.prepare('INSERT INTO execution_guard VALUES (?)').run(key);return true;});}
 reviewJob(token){if(!/^[a-f0-9]{64}$/.test(token||''))throw Error('INVALID_READ_TOKEN');const row=this.db.prepare('SELECT * FROM intake WHERE read_hash=?').get(sha(token));if(!row||verified.has(row.state))throw Error('REVIEW_NOT_REQUIRED');const sealed=this.open(row.sealed);return {enquiry_key:row.event_key,payload:sealed.payload,callback_token:sealed.callbackToken};}
 pending(){return this.db.prepare("SELECT event_key,state,created FROM intake WHERE state NOT IN ('crm_created_verified','crm_existing_enquiry_appended_verified','crm_existing_receipt_verified')").all();}
 markDispatched(key){this.db.prepare("UPDATE intake SET state='dispatch_started' WHERE event_key=? AND state='queued'").run(key);}
 uncertain(key){this.db.prepare("UPDATE intake SET state='uncertain_review_required' WHERE event_key=? AND state IN ('queued','dispatch_started')").run(key);}
 recoverAfterRestart(){this.db.prepare("UPDATE intake SET state='uncertain_review_required' WHERE state IN ('queued','dispatch_started')").run();}
 callback(token,receipt){
  return this.transact(()=>{
   const row=this.db.prepare('SELECT * FROM intake WHERE callback_hash=?').get(sha(token));
   if(!row||receipt.enquiry_key!==row.event_key||receipt.enquiry_sha256!==this.open(row.sealed).contentHash||receipt.google_export_allowed!==false||receipt.retry_allowed!==false)throw Error('INVALID_RECEIPT');
   if(verified.has(receipt.delivery_state)&&(!/^[a-f0-9]{24}$/.test(receipt.crm_lead_id||'')||!/^[a-f0-9]{24}$/.test(receipt.source_activity_id||'')))throw Error('UNVERIFIED_CRM_RECEIPT');
   if(row.receipt){if(row.receipt===JSON.stringify(receipt))return this.view(row);if(verified.has(row.state)||!verified.has(receipt.delivery_state))throw Error('RECEIPT_CONFLICT');}
   this.db.prepare('UPDATE intake SET state=?,receipt=? WHERE event_key=?').run(receipt.delivery_state,JSON.stringify(receipt),row.event_key);
   if(verified.has(receipt.delivery_state))this.db.prepare('DELETE FROM property_lock WHERE property_key=? AND event_key=?').run(row.property_key,row.event_key);
   const updated=this.db.prepare('SELECT * FROM intake WHERE event_key=?').get(row.event_key);return this.view(updated);
  });
 }
 close(){this.db.close();}
}
module.exports={IntakeStore,verified};
