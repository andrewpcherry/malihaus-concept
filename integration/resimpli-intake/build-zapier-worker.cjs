// Rebuild the standalone native SDK step from the reviewed shared contract.
const fs=require('node:fs'),path=require('node:path'),root=__dirname;
let core=fs.readFileSync(path.join(root,'ppc-resimpli.cjs'),'utf8').replace("const {createHash}=require('node:crypto');",'');core=core.slice(0,core.lastIndexOf('module.exports='));
fs.writeFileSync(path.join(root,'zapier-worker.mjs'),"import {createZapierSdk} from '@zapier/zapier-sdk';\nimport {createHash} from 'node:crypto';\nconst zapier=createZapierSdk();\n"+core+'\n'+fs.readFileSync(path.join(root,'zapier-worker.template.mjs'),'utf8'));
