'use strict';
const {DatabaseSync}=require('node:sqlite');
const {IntakeStore:CoreStore,verified}=require('./intake-store-core.cjs');
class IntakeStore extends CoreStore{
 constructor(filename,key){
  const db=new DatabaseSync(filename);db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;');
  super(db,key,fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}});
 }
}
module.exports={IntakeStore,verified};
