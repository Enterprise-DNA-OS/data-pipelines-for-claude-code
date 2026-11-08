#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {getDb,REPO_ROOT} from './lib/db.mjs';
import {parseCsv} from './lib/csv.mjs';
import {table as textTable} from './lib/format.mjs';
import {page,table,writeOut} from './lib/render.mjs';

const READS = {
 pipelines:'SELECT code,name,owner,record_count,freshness,latest_status FROM pipeline_health ORDER BY code',
 'morning-check':"SELECT code,owner,freshness,latest_status,last_source_at FROM pipeline_health WHERE enabled AND (freshness <> 'current' OR latest_status='rejected') ORDER BY code",
 failures:"SELECT code,status,input_rows,issues,actor,created_at FROM run_reconciliation WHERE status='rejected' ORDER BY created_at DESC",
 reconciliation:'SELECT code,status,input_rows,inserted,changed,unchanged,issues FROM run_reconciliation ORDER BY created_at DESC',
 'schema-review':'SELECT code,revision,config FROM pipelines ORDER BY code',
 'retention-review':`SELECT p.code,p.retention_days,
  (SELECT count(*)::integer FROM records d WHERE d.pipeline_id=p.id AND d.created_at < now()-p.retention_days*interval '1 day') AS records_due,
  (SELECT count(*)::integer FROM record_changes d WHERE d.pipeline_id=p.id AND d.created_at < now()-p.retention_days*interval '1 day') AS history_due
  FROM pipelines p WHERE p.retention_days IS NOT NULL ORDER BY p.code`,
 compliance:'SELECT * FROM compliance_findings ORDER BY code,rule',
 'owner-load':"SELECT COALESCE(NULLIF(owner,''),'Unassigned') AS owner,count(*)::integer AS pipelines,count(*) FILTER(WHERE enabled AND freshness <> 'current')::integer AS overdue FROM pipeline_health GROUP BY owner ORDER BY overdue DESC,owner",
 changes:'SELECT p.code,c.record_key,c.before_data,c.after_data,c.created_at FROM record_changes c JOIN pipelines p ON p.id=c.pipeline_id ORDER BY c.created_at DESC,c.record_key',
 activity:'SELECT p.code,a.kind,a.actor,a.note,a.created_at FROM activity a LEFT JOIN pipelines p ON p.id=a.pipeline_id ORDER BY a.created_at DESC',
 actions:"SELECT a.id,p.code,a.name,a.owner,a.due_on,a.status FROM actions a JOIN pipelines p ON p.id=a.pipeline_id ORDER BY a.due_on,a.id"
};
export const COMMANDS=[...Object.keys(READS),'help','show','weekly-review','add','configure','policy','pause','resume','log','add-action','close-action','import','export','validate','sync','reconcile','draft-handover','draft-incident'];
const ENTITIES=['pipelines','runs','records','record_changes','package_imports','actions','activity'];
export function parseArgs(args) {
 const options={}, positionals=[];
 for(let i=0;i<args.length;i++){
  if(!args[i].startsWith('--')){positionals.push(args[i]);continue;}
  const [key,...rest]=args[i].slice(2).split('=');
  if(Object.hasOwn(options,key))throw Error(`Repeated option: ${key}`);
  if(rest.length)options[key]=rest.join('=');
  else if(['json','dry-run','personal-data'].includes(key))options[key]=true;
  else {if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`Missing value for --${key}`);options[key]=args[++i];}
 }
 return {cmd:positionals[0]||'help',arg:positionals[1],o:options};
}
function required(o,key){if(typeof o[key]!=='string'||!o[key].trim())throw Error(`--${key} is required`);return o[key].trim();}
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const canonical=x=>JSON.stringify(x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,JSON.parse(canonical(x[k]))])):Array.isArray(x)?x.map(v=>JSON.parse(canonical(v))):x);
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function integer(v,name){const s=String(v);if(!/^\d+$/.test(s)||!Number.isSafeInteger(Number(s))||Number(s)<1)throw Error(`${name} must be a positive integer`);return Number(s);}
function date(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw Error('Expected a valid YYYY-MM-DD date');return v;}
function timestamp(v){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v)||!Number.isFinite(Date.parse(v)))throw Error('Use a UTC timestamp such as 2026-11-08T10:00:00Z');date(v.slice(0,10));if(Number(v.slice(11,13))>23||Number(v.slice(14,16))>59||Number(v.slice(17,19))>59)throw Error('Invalid UTC clock time');if(Date.parse(v)>Date.now()+60000)throw Error('Source timestamp is in the future');return new Date(v).toISOString();}
export function checkConfig(c){
 if(!c||!Array.isArray(c.columns)||!c.columns.length||typeof c.key!=='string')throw Error('Mapping requires key and nonempty columns');
 const inputs=new Set(),outputs=new Set();
 for(const col of c.columns){
  if(typeof col.input!=='string'||!col.input.trim()||typeof col.output!=='string'||!col.output||!['text','integer','decimal','date','boolean'].includes(col.type)||typeof col.required!=='boolean')throw Error('Each column needs input, output, supported type and required boolean');
  if(!/^[a-z][a-z0-9_]*$/.test(col.output)||['__proto__','constructor','prototype'].includes(col.output))throw Error('Invalid output field');
  if(inputs.has(col.input)||outputs.has(col.output))throw Error('Duplicate mapping field');inputs.add(col.input);outputs.add(col.output);
 }
 const k=c.columns.find(x=>x.output===c.key);if(!k||!k.required||k.type!=='text')throw Error('The key must be a required text column');
 return {key:c.key,columns:c.columns.map(({input,output,type,required})=>({input,output,type,required}))};
}
async function tx(db,fn){await db.exec('BEGIN');try{const result=await fn();await db.exec('COMMIT');return result;}catch(e){await db.exec('ROLLBACK');throw e;}}
async function audit(db,p,kind,actor,note,details={}){await db.query('INSERT INTO activity(pipeline_id,kind,actor,note,details) VALUES($1,$2,$3,$4,$5)',[p?.id||null,kind,actor,note,JSON.stringify(details)]);}
export async function resolve(db,ref,entity='pipelines'){
 if(!['pipelines','actions'].includes(entity))throw Error('Invalid reference kind');
 const rows=await db.query(`SELECT * FROM ${entity} ORDER BY name,id`);
 const needle=String(ref||'').toLowerCase();
 if(!needle)throw Error('A nonempty reference is required');
 let matches=rows.filter(r=>[r.id,r.code,r.name].filter(Boolean).some(v=>v.toLowerCase()===needle));
 if(!matches.length)matches=rows.filter(r=>r.id.toLowerCase().startsWith(needle)||r.name.toLowerCase().includes(needle)||r.code?.toLowerCase().startsWith(needle));
 if(matches.length!==1){const e=Error(matches.length?'Ambiguous reference':'Reference not found');e.candidates=(matches.length?matches:rows).map(r=>({id:r.id,code:r.code,name:r.name}));throw e;}
 return matches[0];
}
export function inspectCsv(content,config){
 const rows=parseCsv(content),issues=[],records=[],keys=new Set();
 // Empty input is rejected rather than mistaken for a successful refresh.
 if(!rows.length)issues.push({row:0,field:'file',reason:'No data rows'});
 const expected=config.columns.map(c=>c.input);
 if(rows.length){for(const h of Object.keys(rows[0]))if(!expected.includes(h))issues.push({row:1,field:h,reason:'Unmapped input column'});for(const h of expected)if(!Object.hasOwn(rows[0],h))issues.push({row:1,field:h,reason:'Missing input column'});}
 for(const [index,row] of rows.entries()){
  const data={};
  for(const col of config.columns){
   let v=row[col.input];
   try{
    if(v===undefined||v.trim()===''){if(col.required)throw Error('Required value missing');data[col.output]=null;continue;}
    if(col.type==='integer'){if(!/^-?\d+$/.test(v)||!Number.isSafeInteger(Number(v)))throw Error('Expected integer');v=Number(v);}
    if(col.type==='decimal'){if(!/^-?\d+(\.\d+)?$/.test(v)||!Number.isFinite(Number(v)))throw Error('Expected decimal');v=String(v);}
    if(col.type==='date')v=date(v);
    if(col.type==='boolean'){if(!['true','false'].includes(v.toLowerCase()))throw Error('Expected true or false');v=v.toLowerCase()==='true';}
    data[col.output]=v;
   }catch(e){issues.push({row:index+2,field:col.input,reason:e.message});}
  }
  const key=data[config.key];
  if(typeof key==='string'){if(keys.has(key))issues.push({row:index+2,field:config.key,reason:'Duplicate record key'});keys.add(key);}
  records.push({key,data,hash:hash(canonical(data))});
 }
 return {records,issues,input_rows:rows.length};
}
async function transfer(db,o,mode){
 const ref=required(o,'ref'),file=required(o,'file'),asOf=timestamp(required(o,'as-of'));
 const actor=mode==='sync'&&!o['dry-run']?required(o,'actor'):'Preview';
 // Read once, then lock the pipeline while comparing and writing.
 if(fs.statSync(file).size>32*1024*1024)throw Error('File exceeds the 32 MiB in-memory transfer limit');
 const content=fs.readFileSync(file,'utf8');
 return tx(db,async()=>{
  const found=await resolve(db,ref);
  const [p]=await db.query('SELECT * FROM pipelines WHERE id=$1 FOR UPDATE',[found.id]);
  const config=checkConfig(p.config);
  let parsed;
  try{parsed=inspectCsv(content,config);}catch(e){parsed={records:[],input_rows:0,issues:[{row:0,field:'file',reason:e.message}]};}
  const sourceHash=hash(content);
  if(!p.enabled)parsed.issues.push({row:0,field:'pipeline',reason:'Pipeline is paused'});
  const [latest]=await db.query("SELECT as_of,source_hash FROM runs WHERE pipeline_id=$1 AND status='succeeded' ORDER BY as_of DESC,created_at DESC LIMIT 1",[p.id]);
  if(latest&&Date.parse(asOf)<new Date(latest.as_of).getTime())parsed.issues.push({row:0,field:'as-of',reason:'Source is older than the latest successful snapshot'});
  if(latest&&Date.parse(asOf)===new Date(latest.as_of).getTime()&&sourceHash!==latest.source_hash)parsed.issues.push({row:0,field:'as-of',reason:'A different file already used this source timestamp'});
  const old=await db.query('SELECT * FROM records WHERE pipeline_id=$1',[p.id]);
  const byKey=new Map(old.map(r=>[r.record_key,r]));
  let inserted=0,changed=0,unchanged=0;
  for(const r of parsed.records){const prev=byKey.get(r.key);if(!prev)inserted++;else if(prev.content_hash===r.hash)unchanged++;else changed++;}
  const missing=old.filter(r=>!parsed.records.some(n=>n.key===r.record_key)).length;
  const result={code:p.code,status:parsed.issues.length?'rejected':'ready',input_rows:parsed.input_rows,inserted,changed,unchanged,absent_from_file:missing,issues:parsed.issues};
  if(mode==='reconcile')return {...result,status:parsed.issues.length?'rejected':inserted||changed||missing?'differences':'matched'};
  if(mode!=='sync'||o['dry-run'])return {...result,dry_run:true};
  const [run]=await db.query('INSERT INTO runs(pipeline_id,status,as_of,source_hash,config,revision,input_rows,inserted,changed,unchanged,issues,actor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',[p.id,parsed.issues.length?'rejected':'succeeded',asOf,sourceHash,JSON.stringify(config),p.revision,parsed.input_rows,parsed.issues.length?0:inserted,parsed.issues.length?0:changed,parsed.issues.length?0:unchanged,JSON.stringify(parsed.issues),actor]);
  if(!parsed.issues.length){
   for(const r of parsed.records){
    const prev=byKey.get(r.key);
    if(!prev||prev.content_hash!==r.hash)await db.query('INSERT INTO record_changes(run_id,pipeline_id,record_key,before_data,after_data) VALUES($1,$2,$3,$4,$5)',[run.id,p.id,r.key,prev?JSON.stringify(prev.data):null,JSON.stringify(r.data)]);
    await db.query('INSERT INTO records(pipeline_id,record_key,data,content_hash,run_id,source_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(pipeline_id,record_key) DO UPDATE SET data=excluded.data,content_hash=excluded.content_hash,run_id=excluded.run_id,source_at=excluded.source_at',[p.id,r.key,JSON.stringify(r.data),r.hash,run.id,asOf]);
   }
  }
  await audit(db,p,'sync',actor,parsed.issues.length?'Transfer rejected; destination unchanged':'Snapshot applied',{run_id:run.id,source_hash:sourceHash});
  return {...result,status:parsed.issues.length?'rejected':'succeeded',run_id:run.id,...(parsed.issues.length?{inserted:0,changed:0,unchanged:0}:{})};
 });
}
function pointer(obj,p){if(typeof p!=='string'||!p.startsWith('/'))throw Error('Package map values must be JSON pointers');return p.slice(1).split('/').reduce((v,k)=>v?.[k.replace(/~1/g,'/').replace(/~0/g,'~')],obj);}
async function importPackage(db,o,arg){
 if(arg!=='integrate-io')throw Error('Use import integrate-io');
 const raw=fs.readFileSync(required(o,'file'),'utf8'),doc=JSON.parse(raw),map=readJson(required(o,'map'));
 // Package variables and component settings can contain credentials. Reject nonempty
 // variables and suspicious keys, and store only selected inventory metadata.
 function scan(v){if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){if(/password|secret|token|credential|authorization|api.?key/i.test(k)&&x!==null&&x!=='')throw Error('Remove credentials from the export before importing');if(k.toLowerCase()==='variables'&&x&&Object.keys(x).length)throw Error('Remove package variables before importing');scan(x);}}
 scan(doc);
 const name=pointer(doc,map.name),version=map.version?pointer(doc,map.version):'',components=pointer(doc,map.components);
 if(typeof name!=='string'||!name.trim()||!components||typeof components!=='object')throw Error('Package mapping must identify a name and components');
 const inventory=Object.entries(components).map(([key,c])=>({key,type:typeof c?.type==='string'?c.type:'unclassified'}));
 const selected={name,version:String(version??''),components:inventory,execution:'not converted'};
 const digest=hash(raw),existing=await db.query('SELECT id FROM package_imports WHERE source_hash=$1',[digest]);
 if(o['dry-run'])return {dry_run:true,...selected,already_imported:existing.length>0};
 const actor=required(o,'actor');
 return tx(db,async()=>{
  const rows=await db.query('INSERT INTO package_imports(source_hash,name,version,package,actor) VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_hash) DO NOTHING RETURNING id',[digest,name,selected.version,JSON.stringify(selected),actor]);
  if(rows.length)await audit(db,null,'import',actor,'Imported package inventory',{source_hash:digest,components:inventory.length});
  return {...selected,imported:rows.length,id:rows[0]?.id||existing[0]?.id};
 });
}
export async function execute(db,cmd,o={},arg){
 if(!COMMANDS.includes(cmd))throw Error(`Unknown command: ${cmd}. Use help.`);
 const allowed={show:['ref'],add:['file','actor'],configure:['ref','file','actor'],policy:['ref','actor','owner','purpose','retention-days','review-on','sla-hours','personal-data'],pause:['ref','actor','note'],resume:['ref','actor','note'],log:['ref','actor','note'],'add-action':['ref','actor','name','owner','due-on'],'close-action':['ref','actor','evidence'],import:['file','map','actor','dry-run'],export:['file'],validate:['ref','file','as-of','actor','dry-run'],sync:['ref','file','as-of','actor','dry-run'],reconcile:['ref','file','as-of','actor'],'draft-handover':['ref'],'draft-incident':['ref']};
 for(const key of Object.keys(o))if(key!=='json'&&!(allowed[cmd]||[]).includes(key))throw Error(`Unknown option --${key} for ${cmd}`);
 for(const key of ['dry-run','json'])if(o[key]!==undefined&&o[key]!==true)throw Error(`--${key} is a flag without a value`);
 if(cmd==='help')return COMMANDS.map(command=>({command}));
 if(READS[cmd])return db.query(READS[cmd]);
 if(cmd==='weekly-review')return {morning_check:await execute(db,'morning-check'),reconciliation:await execute(db,'reconciliation'),compliance:await execute(db,'compliance'),actions:await execute(db,'actions'),owner_load:await execute(db,'owner-load')};
 if(['sync','validate','reconcile'].includes(cmd))return transfer(db,o,cmd);
 if(cmd==='import')return importPackage(db,o,arg);
 if(cmd==='export'){
  const file=path.resolve(required(o,'file')),data={version:1,exported_at:new Date().toISOString()};
  await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try{for(const entity of ENTITIES)data[entity]=await db.query(`SELECT * FROM ${entity} ORDER BY id`);}finally{await db.exec('ROLLBACK');}
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n',{mode:0o600,flag:'wx'});return {file,counts:Object.fromEntries(ENTITIES.map(e=>[e,data[e].length]))};
 }
 if(cmd==='add'){
  const actor=required(o,'actor'),d=readJson(required(o,'file')),config=checkConfig(d.config);
  if(!/^[A-Z][A-Z0-9_-]{1,39}$/.test(d.code)||typeof d.name!=='string'||!d.name.trim())throw Error('Definition requires uppercase code and name');
  const sla=integer(d.sla_hours??24,'sla_hours'),ret=d.retention_days==null?null:integer(d.retention_days,'retention_days');
  if(d.review_on)date(d.review_on);if(d.personal_data!==undefined&&typeof d.personal_data!=='boolean')throw Error('personal_data must be boolean');
  return tx(db,async()=>{const [p]=await db.query('INSERT INTO pipelines(code,name,owner,purpose,personal_data,retention_days,review_on,sla_hours,config) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',[d.code,d.name,d.owner||'',d.purpose||'',!!d.personal_data,ret,d.review_on||null,sla,JSON.stringify(config)]);await audit(db,p,'add',actor,'Created pipeline');return p;});
 }
 if(cmd==='close-action'){
  const actor=required(o,'actor'),evidence=required(o,'evidence'),a=await resolve(db,required(o,'ref'),'actions');
  return tx(db,async()=>{const [result]=await db.query("UPDATE actions SET status='done',evidence=$2 WHERE id=$1 RETURNING id,name,status,evidence",[a.id,evidence]);await audit(db,{id:a.pipeline_id},'close-action',actor,evidence,{action_id:a.id});return result;});
 }
 const found=await resolve(db,required(o,'ref'));
 if(cmd==='show')return {pipeline:found,records:await db.query('SELECT record_key,data,source_at FROM records WHERE pipeline_id=$1 ORDER BY record_key',[found.id]),runs:await db.query('SELECT * FROM runs WHERE pipeline_id=$1 ORDER BY created_at DESC',[found.id])};
 if(cmd.startsWith('draft-')){
  const rows=await db.query('SELECT status,as_of,input_rows,inserted,changed,unchanged,issues,actor FROM runs WHERE pipeline_id=$1 ORDER BY created_at DESC',[found.id]);
  const title=cmd==='draft-incident'?'Transfer incident draft':'Pipeline handover draft';
  const file=writeOut('drafts',`${cmd}-${found.code.toLowerCase()}-${crypto.randomUUID()}`,page({title,subtitle:found.name,sections:[{title:'Ownership',html:table([{code:found.code,owner:found.owner,purpose:found.purpose}])},{title:'Recorded runs',html:table(rows),note:'Internal draft. Investigate the recorded issues before assigning a cause. Nothing has been sent.'}]}));return {file};
 }
 const actor=required(o,'actor');
 return tx(db,async()=>{
  const [p]=await db.query('SELECT * FROM pipelines WHERE id=$1 FOR UPDATE',[found.id]);
  if(cmd==='configure'){
   const config=checkConfig(readJson(required(o,'file')));
   if(config.key!==p.config.key&&(await db.query('SELECT id FROM records WHERE pipeline_id=$1 LIMIT 1',[p.id])).length)throw Error('A key change requires a separate pipeline and reconciliation');
   const [result]=await db.query('UPDATE pipelines SET config=$2,revision=revision+1 WHERE id=$1 RETURNING code,revision,config',[p.id,JSON.stringify(config)]);
   await audit(db,p,cmd,actor,'Revised mapping',{before:p.config,after:config});return result;
  }
  if(cmd==='policy'){
   const owner=o.owner??p.owner,purpose=o.purpose??p.purpose,ret=o['retention-days']?integer(o['retention-days'],'retention-days'):p.retention_days;
   const review=o['review-on']?date(o['review-on']):p.review_on,sla=o['sla-hours']?integer(o['sla-hours'],'sla-hours'):p.sla_hours;
   const personal=o['personal-data']===undefined?p.personal_data:o['personal-data']===true||o['personal-data']==='true';
   if(o['personal-data']!==undefined&&![true,'true','false'].includes(o['personal-data']))throw Error('personal-data must be true or false');
   const [result]=await db.query('UPDATE pipelines SET owner=$2,purpose=$3,retention_days=$4,review_on=$5,sla_hours=$6,personal_data=$7 WHERE id=$1 RETURNING code,owner,purpose,retention_days,review_on,sla_hours,personal_data',[p.id,owner,purpose,ret,review,sla,personal]);await audit(db,p,cmd,actor,'Changed operating policy',{before:{owner:p.owner,purpose:p.purpose,retention_days:p.retention_days,review_on:p.review_on,sla_hours:p.sla_hours,personal_data:p.personal_data},after:result});return result;
  }
  if(['pause','resume'].includes(cmd)){const [result]=await db.query('UPDATE pipelines SET enabled=$2 WHERE id=$1 RETURNING code,enabled',[p.id,cmd==='resume']);await audit(db,p,cmd,actor,required(o,'note'));return result;}
  if(cmd==='log'){const note=required(o,'note');await audit(db,p,cmd,actor,note);return {code:p.code,note};}
  if(cmd==='add-action'){const name=required(o,'name'),owner=required(o,'owner'),due=date(required(o,'due-on'));const [a]=await db.query('INSERT INTO actions(pipeline_id,name,owner,due_on) VALUES($1,$2,$3,$4) RETURNING id,name,owner,due_on',[p.id,name,owner,due]);await audit(db,p,cmd,actor,name,{action_id:a.id});return a;}
  throw Error(`Unhandled command ${cmd}`);
 });
}
export function format(result){
 if(Array.isArray(result)){if(!result.length)return '(none)';const flat=result.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,v instanceof Date?v.toISOString():v&&typeof v==='object'?JSON.stringify(v):v])));return textTable(flat,Object.keys(flat[0]).map(key=>({key,label:key,width:80})));}
 return Object.entries(result).map(([k,v])=>v&&typeof v==='object'?`${k}\n${Array.isArray(v)?format(v):JSON.stringify(v,null,2)}`:`${k}: ${v??''}`).join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 let db;const json=process.argv.includes('--json');
 try{const {cmd,o,arg}=parseArgs(process.argv.slice(2));db=await getDb();const result=await execute(db,cmd,o,arg);console.log(json?JSON.stringify(result,null,2):format(result));if(result?.status==='rejected')process.exitCode=1;}
 catch(e){const result={error:e.message,...(e.candidates?{candidates:e.candidates}:{})};console[json?'log':'error'](json?JSON.stringify(result,null,2):format(result));process.exitCode=1;}
 finally{if(db)await db.close();}
}
