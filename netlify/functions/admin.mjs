import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import machines from '../../machines.json' with { type: 'json' };

const STORE = 'parc-documents';
const DRIVER_STORE = 'parc-chauffeurs';
const STATUS_STORE = 'parc-materiel-status';
const EXTINGUISHER_STORE = 'parc-extincteurs';
const ARCHIVE_STORE = 'parc-documents-archive';
const IMPORT_TMP_STORE = 'parc-import-tmp';
const REGION = 'eu-central-1';
const TTL = 8 * 60 * 60 * 1000;

const MACHINES = {};
for (const [group, items] of Object.entries(machines)) {
  for (const [id, name] of items) MACHINES[id] = { id, name, group };
}

const TYPES = {
  assurance:{label:'Assurance',alertDays:30},
  vgp:{label:'VGP',alertDays:30},
  mines:{label:'Mines',alertDays:30},
  ct:{label:'Contrôle technique',alertDays:30},
  shunt:{label:'Barre de shunt',alertDays:30},
  agrement:{label:'Agrément',alertMonths:3},
  carte:{label:'Carte grise'},
  barreRouge:{label:'Barré rouge'},
  divers:{label:'Divers'},
  doc:{label:'Document'},
  devis:{label:'Devis'}
};
const DRIVER_CATEGORIES = {
  identite:{label:'Identité & administratif',icon:'👤'},
  permis:{label:'Permis & autorisations',icon:'🚗'},
  formation:{label:'Formations & habilitations',icon:'🎓'},
  acces:{label:'Accès & badges',icon:'🪪'},
  diplomes:{label:'Diplômes & qualifications',icon:'📜'},
  sante:{label:'Santé & aptitude',icon:'🩺'},
  divers:{label:'Divers',icon:'📂'}
};
const NO_EXPIRY = new Set(['carte','barreRouge','divers','doc','devis']);
const AGR = new Set(['P16','P17','P18','P19','P20','P21','P24','P25','RRA319','RRA034','RRA035','RRA318','RRAT064','RRAT089']);

const store = () => getStore({name:STORE,region:REGION,consistency:'strong'});
const driverStore = () => getStore({name:DRIVER_STORE,region:REGION,consistency:'strong'});
const statusStore = () => getStore({name:STATUS_STORE,region:REGION,consistency:'strong'});
const extinguisherStore = () => getStore({name:EXTINGUISHER_STORE,region:REGION,consistency:'strong'});
const archiveStore = () => getStore({name:ARCHIVE_STORE,region:REGION,consistency:'strong'});
const importTmpStore = () => getStore({name:IMPORT_TMP_STORE,region:REGION,consistency:'strong'});
const hasExtinguisher = id => { const m=MACHINES[id]; if(!m) return false; if(/^(REM|RRA|RRAT|ANSEMS)/i.test(id) || /\bremorque\b/i.test(m.name)) return false; return m.group==='pelles' || /^T\d+$/.test(id); };
async function getExtinguisherDates(){
  const ids=Object.keys(MACHINES).filter(hasExtinguisher);
  const pairs=await Promise.all(ids.map(async id=>{
    try{
      const r=await extinguisherStore().get(`machine/${id}.json`,{type:'json',consistency:'strong'});
      return r?.expiry?[id,String(r.expiry)]:null;
    }catch{return null;}
  }));
  return Object.fromEntries(pairs.filter(Boolean));
}
const secret = () => process.env.PARC_PASSWORD || '';

function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function html(s,status=200,headers={}){return new Response(s,{status,headers:{'Content-Type':'text/html; charset=utf-8',...headers}});}
function parseCookies(req){const out={};for(const p of (req.headers.get('cookie')||'').split(';')){const i=p.indexOf('=');if(i>0)out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1));}return out;}
function makeToken(id){const exp=Date.now()+TTL;const payload=`${id}.${exp}`;const sig=crypto.createHmac('sha256',secret()).update(payload).digest('hex');return Buffer.from(`${payload}.${sig}`).toString('base64url');}
function validToken(token,id){try{if(!token||!secret())return false;const raw=Buffer.from(token,'base64url').toString();const [tid,exp,sig]=raw.split('.');if(tid!==id||!Number.isFinite(Number(exp))||Number(exp)<=Date.now())return false;const expected=crypto.createHmac('sha256',secret()).update(`${tid}.${exp}`).digest('hex');return !!sig&&crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected));}catch{return false;}}
function cookie(name,value){return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL/1000}`;}
function isAdmin(req){return validToken(parseCookies(req).PARC_ADMIN,'ADMIN');}
function parseDate(s){const t=String(s||'').replace(/_/g,' ').replace(/\s+/g,' ');let m=t.match(/\b(\d{2})[-./ ](\d{2})[-./ ](\d{4})\b/);if(m)return new Date(+m[3],+m[2]-1,+m[1]);m=t.match(/\b(\d{4})[-./](\d{2})[-./](\d{2})\b/);if(m)return new Date(+m[1],+m[2]-1,+m[3]);const months={janvier:0,janv:0,'février':1,fevr:1,'févr':1,fevrier:1,mars:2,avril:3,avr:3,mai:4,juin:5,juillet:6,juil:6,'août':7,aout:7,septembre:8,sept:8,octobre:9,oct:9,novembre:10,'nov':10,'décembre':11,decembre:11,'déc':11,dec:11};m=t.toLowerCase().match(/\b(\d{1,2})\s+(janvier|janv|février|fevr|févr|fevrier|mars|avril|avr|mai|juin|juillet|juil|août|aout|septembre|sept|octobre|oct|novembre|nov|décembre|decembre|déc|dec)\s+(\d{4})\b/);if(m)return new Date(+m[3],months[m[2]],+m[1]);return null;}
function iso(d){return d&&!Number.isNaN(new Date(d).getTime())?new Date(d).toISOString().slice(0,10):'';}
function hashSecret(v){return crypto.createHash('sha256').update(String(v)).digest('hex');}

const MACHINE_PATHS = {
'T01 - EW-610-MD - Man TGS 35.420 8x4 Grue':'T01','T04 - EB-837-AD - Man TGS 28.440':'T04','T08 - BE-763-WR - Man TGS 35.400':'T08','T09 - DY-847-PK - Man TGS 35.440':'T09','T21 - FJ-210-WY - VOLVO FM (4)':'T21','T22 - FT-812-DM - VOLVO FM 6x4':'T22','T23 - GF-353-RM - MERCEDES AROCS':'T23','T24 - GP-257-GM Mercedes':'T24',
'REM05 - EW-638-MH - Benne 3 essieux':'REM05','REM06 - CB-024-NG - Plateau Extensible':'REM06','REM08 - GQ-842-HQ':'REM08','REM09 -  ANSSEMS N GK-005-XL':'ANSEMS',
'Pelle 3 -  Pelle à chenilles VOLVO Nr Serie 221447':'P03','Pelle 10 - Pelle à pneus  DOOSAN Nr Serie 50932':'P10','Pelle 11 - Pelle à chenilles CASE CX 145 CSR Serie 1592':'P11','Pelle 12 - Pelle à pneus DOOSAN DX165W-5 Nr Serie 1225':'P12','Pelle 16 - Pelle RR ACX 160 WRR A1P13007':'P16','Pelle 17 - Pelle RR ACX 160 WRR A1P13012':'P17','Pelle 18 - Pelle RR ACX 160 WRR A1P13013':'P18','Pelle 19 - Pelle RR ACX 105 RR M1P160009':'P19','Pelle 20 - Pelle RR ACX 23 RR A2P180013':'P20','Pelle 21 - Pelle RR ACX 23 RR A2P190038':'P21','Pelle 24 -Pelle  RR ATLAS 21 RR 243Z301276':'P24','Pelle 25- Pelle RR ATLAS 21 RR 243Z301279':'P25',
'Remorque RR acx  AGT 24 319':'RRA319','Remorque RR acx AGT 24 034':'RRA034','Remorque RR acx AGT 24 035':'RRA035','Remorque RR acx AGT 24 318':'RRA318','remorque RR atlas AGT 26 064':'RRAT064','remorque RR atlas AGT 26 089':'RRAT089',
'1. DL 884 QM - MERCEDES Sprinter 3T5 benne':'DL884QM','1. DT-494-VJ - CITROEN C3':'DT494VJ','1. DV-098-KA - CITROEN Jumpy':'DV098KA','1. EQ-811-AX - CITROEN Berlingo':'EQ811AX','1. FE-191-ZT - RENAULT Clio':'FE191ZT','1. FE-798-ZS - RENAULT Clio':'FE798ZS','1. FG-520-PX - RENAULT Kangoo':'FG520PX','1. FH-458-MR - RENAULT Clio':'FH458MR','1. FL-238-XW - RENAULT Kangoo':'FL238XW','1. FL-865-XW - RENAULT Kangoo':'FL865XW','1. FM-019-PV - RENAULT Kangoo long cargo':'FM019PV','1. FV-628-AN - RENAULT Kangoo':'FV628AN','1. FV-643-AN - RENAULT Kangoo':'FV643AN','1. FZ-856-BY - SEAT':'FZ856BY'};
const aliases=Object.entries(MACHINE_PATHS).map(([n,id])=>[n.toLowerCase(),id]);
const typeFromPath=path=>{const f=String(path).split('/').filter(Boolean).map(x=>x.toLowerCase().trim()).at(-2)||'';if(f==='assurance')return'assurance';if(f==='vgp')return'vgp';if(f==='mines')return'mines';if(['ct','contrôle technique','controle technique'].includes(f))return'ct';if(['barre shunt','barre de shunt'].includes(f))return'shunt';if(['agrement','agrément'].includes(f))return'agrement';if(['carte grise','carte'].includes(f))return'carte';if(['barre rouge','barré rouge','barre-rouge'].includes(f))return'barreRouge';if(f==='divers')return'divers';if(['doc','docs'].includes(f))return'doc';if(f==='devis')return'devis';return'divers'};
const machineIdFromPath=path=>{for(const p of String(path).split('/').filter(Boolean)){const hit=aliases.find(([n])=>n===p.toLowerCase());if(hit)return hit[1]}return null;};
const allowed=(id,type)=>!!MACHINES[id]&&!!TYPES[type]&&!(type==='agrement'&&!AGR.has(id));
const expiryFor=(type,name)=>NO_EXPIRY.has(type)?'':iso(parseDate(name));

// Les rubriques soumises à une échéance ne peuvent avoir qu'un seul document actif.
// Lors d'un nouveau chargement, l'ancien document est conservé dans l'archive puis remplacé.
async function replaceExistingExpiryDocs(id,type,keepKey=''){
  if(NO_EXPIRY.has(type)) return;
  const {blobs}=await store().list({prefix:`${id}/${type}/`});
  for(const b of blobs){
    const oldKey=b.key;
    if(keepKey && oldKey===keepKey) continue;
    let oldMeta={};
    try{oldMeta=(await store().getMetadata(oldKey,{consistency:'strong'}))?.metadata||{};}catch{}
    const oldBytes=await store().get(oldKey,{type:'arrayBuffer'}).catch(()=>null);
    if(oldBytes){
      const archiveKey=`${id}/${type}/${Date.now()}_${Math.random().toString(36).slice(2,8)}_${oldKey.split('/').pop()}`;
      await archiveStore().set(archiveKey,oldBytes,{metadata:{id,type,label:oldMeta.label||oldKey.split('/').pop()||oldKey,expiry:oldMeta.expiry||'',archivedAt:new Date().toISOString(),replacedFrom:oldKey}});
    }
    await store().delete(oldKey);
  }
}

async function docsList(){
  const {blobs}=await store().list({prefix:''});
  const rows=await Promise.all(blobs.map(async b=>{
    const p=b.key.split('/');
    if(!MACHINES[p[0]])return null;
    const meta=(await store().getMetadata(b.key,{consistency:'strong'}).catch(()=>null))?.metadata||{};
    return {key:b.key,id:p[0],type:meta.type||p[1]||'',label:meta.label||p.slice(2).join('/'),uploadedAt:meta.uploadedAt||'',expiry:meta.expiry||''};
  }));
  const raw=rows.filter(Boolean);
  const byExpiry=new Map();
  const out=[];
  for(const d of raw){
    if(NO_EXPIRY.has(d.type)){out.push(d);continue;}
    const k=`${d.id}::${d.type}`;
    const prev=byExpiry.get(k);
    if(!prev || String(d.uploadedAt||'')>String(prev.uploadedAt||'')) byExpiry.set(k,d);
  }
  out.push(...byExpiry.values());
  return out.sort((a,b)=>`${MACHINES[a.id].name}${a.label}`.localeCompare(`${MACHINES[b.id].name}${b.label}`,'fr'));
}
async function archiveList(){
  const {blobs}=await archiveStore().list({prefix:''});
  const rows=await Promise.all(blobs.map(async b=>{
    const p=b.key.split('/'); const id=p[0];
    if(!MACHINES[id]) return null;
    let meta={};
    try{meta=(await archiveStore().getMetadata(b.key,{consistency:'strong'}))?.metadata||{};}catch{}
    return {key:b.key,id,type:p[1]||'',label:meta.label||p.slice(3).join('/')||p[2]||b.key,archivedAt:meta.archivedAt||'',replacedFrom:meta.replacedFrom||'',expiry:meta.expiry||''};
  }));
  return rows.filter(Boolean).sort((a,b)=>String(b.archivedAt).localeCompare(String(a.archivedAt)));
}
async function machineStatuses(){
  const {blobs}=await statusStore().list({prefix:'machine/'});
  const out=Object.fromEntries(Object.keys(MACHINES).map(id=>[id,true]));
  const rows=await Promise.all(blobs.map(async b=>{
    const id=b.key.slice('machine/'.length).replace(/\.json$/,'').toUpperCase();
    if(!MACHINES[id])return null;
    try{const v=await statusStore().get(b.key,{type:'json',consistency:'strong'});return [id,v?.enabled!==false];}
    catch{return null;}
  }));
  for(const row of rows)if(row)out[row[0]]=row[1];
  return out;
}
async function adminAlerts(docs,extDates){
  const now=Date.now();
  let overdue=0,within30=0;
  for(const d of docs){
    const expiry=d.expiry||'';
    if(!expiry||['carte','barreRouge','divers','doc','devis'].includes(d.type))continue;
    const date=new Date(`${expiry}T23:59:59`); if(Number.isNaN(date.getTime()))continue;
    const days=Math.ceil((date.getTime()-now)/86400000);
    if(days<0)overdue++; else if(days<=30)within30++;
  }
  let ext30=0;
  for(const expiry of Object.values(extDates||{})){
    const m=String(expiry).match(/^(\d{4})-(\d{2})$/); if(!m)continue;
    const date=new Date(Number(m[1]),Number(m[2]),0,23,59,59); const days=Math.ceil((date.getTime()-now)/86400000);
    if(days<=30)ext30++;
  }
  return {overdue,within30,ext30};
}
async function driverList(){const {blobs}=await driverStore().list({prefix:'driver/'});const values=await Promise.all(blobs.map(b=>driverStore().get(b.key,{type:'json'}).catch(()=>null)));return values.filter(Boolean);}

function normPersonName(v){
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
async function findDriverByName(name){
  const target=normPersonName(name); if(!target)return null;
  const drivers=await driverList();
  return drivers.find(d=>normPersonName(d.name)===target)||null;
}
function randomDriverCode(){return String(Math.floor(100000+Math.random()*900000));}
async function listDriverFiles(id){
  const {blobs}=await driverStore().list({prefix:`docs/${id}/`});
  return blobs;
}
async function clearDriverDocuments(id){
  const blobs=await listDriverFiles(id);
  await Promise.all(blobs.map(b=>driverStore().delete(b.key)));
}
async function clearMachineDocuments(id){
  const {blobs}=await store().list({prefix:`${id}/`});
  await Promise.all(blobs.map(b=>store().delete(b.key)));
}
async function deleteDriverCompletely(id){
  await clearDriverDocuments(id);
  try{await driverStore().delete(`photo/${id}`);}catch{}
  try{await driverStore().delete(`driver/${id}.json`);}catch{}
}
function medicalVisitStatusAdmin(date){
  if(!date) return {class:'neutral',days:null};
  const d=new Date(`${date}T23:59:59`);
  if(Number.isNaN(d.getTime())) return {class:'neutral',days:null};
  const days=Math.ceil((d.getTime()-Date.now())/86400000);
  if(days<0) return {class:'red',days};
  if(days<=30) return {class:'orange',days};
  return {class:'green',days};
}

function shell(body){return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Administration THN</title><link rel="stylesheet" href="/style.css"><style>.driver-admin-row{padding:10px 0;border-bottom:1px solid #e5edf5}.driver-admin-row:last-child{border-bottom:0}.medical-date-form{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.medical-date-form label{margin:0}.medical-date-form input{min-width:170px}.medical-visit-admin{display:flex;justify-content:space-between;gap:16px;align-items:end;padding:14px 16px;margin:10px 0 16px;border:1px solid #d8e6f4;border-radius:12px;background:#f7fbff}.medical-visit-admin h4{margin:0 0 4px}.medical-visit-admin .medical-date-form{margin:0}.doc-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.replace-form{margin:0}.replace{background:#1976d2;color:#fff}.doc-card form{margin:0}.doc-card button{margin:0}.employee-admin-box{overflow:hidden}.employee-admin-head,.employee-list-head,.driver-admin-main{display:flex;justify-content:space-between;gap:16px;align-items:center}.employee-count{background:#eef6ff;color:#1264b0;border-radius:999px;padding:7px 12px;font-weight:700}.employee-add-card{margin:18px 0;padding:18px;border:1px solid #d8e6f4;border-radius:14px;background:linear-gradient(180deg,#f8fbff,#fff)}.employee-add-form{display:grid;grid-template-columns:1.3fr 1fr auto;gap:12px;align-items:end;margin-top:14px}.code-field{display:flex;gap:8px}.code-field input{flex:1}.secondary{background:#eef6ff;color:#1264b0}.primary{background:#1769d1;color:#fff}.employee-list-head{margin-top:22px}.employee-list-head input{max-width:280px}.driver-admin-row{padding:14px 0;border-bottom:1px solid #e5edf5}.driver-credentials{display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-top:8px}.driver-credentials label{margin:0}.driver-credentials input{min-width:170px}.driver-code-visible{background:#f7fbff;border:1px solid #cfe0ef;font-weight:700;letter-spacing:.06em}.driver-credentials .code-generate{background:#eef6ff;color:#1264b0}.driver-admin-row:last-child{border-bottom:0}.driver-name{margin:0 0 3px}.driver-access-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.driver-code-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:8px;background:#eef6ff;border:1px solid #cfe0ef;color:#1264b0;font-size:.84rem;letter-spacing:.03em}.driver-code-badge strong{font-size:.96rem;color:#0c4f8c}.medical-late-tab{display:inline-flex;align-items:center;margin-left:8px;padding:3px 8px;border-radius:999px;background:#fde8e8;color:#b42318;font-size:.72rem;font-weight:800;letter-spacing:.03em;text-transform:uppercase;vertical-align:middle}.small{font-size:.86rem}.medical-date-form{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.medical-date-form label{margin:0}.medical-date-form input{min-width:170px}.driver-photo-admin{display:flex;align-items:center;gap:14px;min-width:260px}.driver-photo-thumb{width:58px;height:58px;border-radius:50%;object-fit:cover;border:2px solid #d7e5f2;background:#eef6ff}.driver-photo-form{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.driver-photo-form input[type=file]{max-width:220px}.photo-hint{font-size:.8rem;color:#6b8299}.employee-add-form{grid-template-columns:1.2fr 1fr 1.1fr auto}.employee-add-form input[type=file]{max-width:240px}.driver-doc-form{display:grid;grid-template-columns:1fr 1.2fr 1fr auto;gap:10px;align-items:end}.driver-doc-form label{margin:0}.driver-doc-form input,.driver-doc-form select{min-width:0}
.admin-nav{position:sticky;top:8px;z-index:20;display:flex;gap:8px;flex-wrap:wrap;padding:10px 12px;margin:0 0 16px;background:#fff;border:1px solid #d8e6f4;border-radius:14px;box-shadow:0 6px 18px rgba(15,40,70,.07)}.admin-nav a{padding:8px 11px;border-radius:9px;background:#eef6ff;color:#1264b0;text-decoration:none;font-weight:700;font-size:.9rem}.admin-section{margin:0 0 16px}.admin-section>summary{cursor:pointer;list-style:none;padding:15px 18px;border:1px solid #d8e6f4;border-radius:14px;background:#fff;font-weight:800;font-size:1.05rem;box-shadow:0 5px 16px rgba(15,40,70,.05)}.admin-section>summary::-webkit-details-marker{display:none}.admin-section>summary:before{content:'▸';display:inline-block;margin-right:8px;color:#1769d1}.admin-section[open]>summary:before{transform:rotate(90deg)}.admin-section .box{margin-top:10px}.admin-driver-list{display:grid;gap:10px}.admin-driver-detail{border:1px solid #d8e6f4;border-radius:12px;background:#fff;overflow:hidden}.admin-driver-detail>summary{cursor:pointer;list-style:none;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;font-weight:800}.admin-driver-detail>summary::-webkit-details-marker{display:none}.admin-driver-detail>summary:before{content:'▸';color:#1769d1;margin-right:8px}.admin-driver-summary-main{display:flex;align-items:center;gap:9px;min-width:0}.admin-driver-summary-main img{width:36px;height:36px;border-radius:50%;object-fit:cover;border:1px solid #d7e5f2}.admin-driver-summary-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.admin-driver-summary-right{display:flex;align-items:center;gap:8px}.file-manager-callout{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 18px;margin:0 0 14px;border:1px solid #cfe0ef;border-radius:14px;background:#eef6ff}.file-manager-callout h3{margin:0 0 4px}.file-manager-callout p{margin:0}.file-manager-callout .admin-export{white-space:nowrap}.admin-files-cta,.admin-files-cta-large{background:#0b63ce!important;color:#fff!important;border:1px solid #0b63ce!important;box-shadow:0 4px 10px rgba(11,99,206,.18)}.admin-files-cta{font-weight:800}.admin-files-cta-large{display:inline-flex;align-items:center;justify-content:center;padding:11px 15px;border-radius:10px;text-decoration:none;font-weight:800}.admin-mini-code{font-size:.82rem;color:#0c4f8c;background:#eef6ff;border:1px solid #cfe0ef;border-radius:8px;padding:4px 8px}.admin-late-badge{background:#fde8e8;color:#b42318;border-radius:999px;padding:4px 8px;font-size:.72rem;font-weight:800}@media(max-width:850px){.driver-doc-form{grid-template-columns:1fr 1fr}.driver-doc-form button{grid-column:1/-1}}</style></head><body><main>${body}<div class="site-footer-copy" style="text-align:center;padding:18px;color:#6b7f95">THN — Administration &nbsp; | &nbsp; Version <strong>V112</strong></div></main></body></html>`;}
function errorPage(e){return shell(`<div class="box"><h2>Erreur Administration</h2><p class="bad">${esc(e?.message||String(e))}</p><p><a href="/admin.html">← Retour à l'accès administration</a></p></div>`);}
function page(docs,drivers,msg='',statuses={},extDates={},archives=[],alerts={}){
  const adminDrivers=[...drivers].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'fr',{sensitivity:'base'}));
  const groupLabels={camions:'Camions',pelles:'Matériel rail-route',vehicules:'Véhicules'};
  const fleetHtml=Object.entries(machines).map(([group,items])=>`<div class="machine-status-group"><h3>${esc(groupLabels[group]||group)}</h3>${items.map(([id,name])=>{
    const enabled=statuses[id]!==false;
    const extDate=extDates[id]||'';
    const extValue=/^\d{4}-\d{2}$/.test(extDate)?extDate:'';
    const parts=name.split(' - ');
    const code=parts[0]||id;
    const desc=parts.slice(1).join(' - ')||name;
    return `<div class="machine-status-row ${enabled?'':'is-off'}">
      <div class="machine-status-switch-wrap">
        <form method="post" action="/.netlify/functions/admin" class="machine-status-form">
          <input type="hidden" name="action" value="toggle-machine">
          <input type="hidden" name="id" value="${esc(id)}">
          <input type="hidden" name="enabled" value="${enabled?'0':'1'}">
          <button type="submit" class="machine-switch ${enabled?'is-on':'is-off'}" aria-label="${enabled?'Désactiver':'Activer'} ${esc(code)}">
            <span class="machine-switch-track"><span class="machine-switch-thumb"></span></span>
            <span class="machine-switch-label">${enabled?'ON':'OFF'}</span>
          </button>
        </form>
      </div>
      <div class="machine-status-name"><strong>${esc(code)}</strong><span>${esc(desc)}</span></div>
      <div class="machine-status-state">${enabled?'ON — échéances prises en compte':'OFF — échéances masquées'}</div>
      ${hasExtinguisher(id)?`<form method="post" action="/.netlify/functions/admin" class="extinguisher-form"><input type="hidden" name="action" value="set-extinguisher"><input type="hidden" name="id" value="${esc(id)}"><label class="extinguisher-label"><img src="/assets/extincteur.svg" alt="Extincteur"> Extincteur</label><input type="month" name="expiryMonth" value="${esc(extValue)}" title="Mois et année d’échéance de l’extincteur"><button type="submit">Enregistrer</button></form>`:''}
    </div>`;
  }).join('')}</div>`).join('');
  return shell(`<div class="box"><p><a href="/">← Accueil</a></p>${msg?`<p class="ok">${esc(msg)}</p>`:''}</div>
  <nav class="admin-nav" aria-label="Navigation administration"><a href="#parc">⚙️ Parc</a><a href="#documents">📄 Documents</a><a href="#salaries">👷 Salariés</a><a href="#echeances-salaries">📅 Échéances salariés</a><a href="/.netlify/functions/admin-qr" target="_blank" rel="noopener">📱 QR codes</a><a class="admin-files-cta" href="/.netlify/functions/driver-files">🗂️ GESTIONNAIRE DE FICHIERS SALARIÉS</a></nav>
  <div class="box admin-alerts"><h2>📊 Vue rapide</h2><div class="admin-alert-grid"><div><strong>${alerts.overdue||0}</strong><span>Échéances dépassées</span></div><div><strong>${alerts.within30||0}</strong><span>Échéances ≤ 30 jours</span></div><div><strong>${alerts.ext30||0}</strong><span>Extincteurs ≤ 30 jours</span></div><a class="admin-export" href="/export">📊 Export Excel</a><a class="admin-export" href="/.netlify/functions/admin-qr" target="_blank" rel="noopener">📱 Liste des QR codes</a></div></div>
  <details class="admin-section" id="parc" open><summary>⚙️ État du parc</summary><div class="box fleet-status-box"><div class="fleet-status-head"><div><h2>⚙️ État du parc</h2><p class="muted">Passez un matériel sur <strong>OFF</strong> lorsqu'il est au garage ou inutilisé. Ses échéances disparaissent de l'accueil et des listes d'échéances.</p></div></div>${fleetHtml}</div></details>
  <details class="admin-section" id="documents"><summary>📄 Documents et imports</summary>
  <div class="box"><h2>📄 Import d'un document</h2><p class="muted">Pour les rubriques avec échéance, un seul document actif est autorisé. Un nouveau chargement remplace l’ancien et le conserve dans l’archive.</p><form method="post" action="/.netlify/functions/admin" enctype="multipart/form-data"><label>Matériel</label><select name="id">${Object.values(MACHINES).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select><label>Type</label><select name="type" id="doc-type">${Object.entries(TYPES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select><label id="expiry-label">Date d'expiration</label><input id="expiry" type="date" name="expiry"><label>Fichier</label><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" required><button>Charger le document</button></form></div>
  <div class="box"><h2>📦 Import complet du parc et des salariés</h2><p class="muted">Sélectionne le dossier <strong>PARCMAT</strong> décompressé. Les sous-dossiers <strong>CAMIONS</strong>, <strong>PELLES</strong>, <strong>VL</strong> et <strong>SALARIES</strong> sont reconnus automatiquement.</p><label>Mot de passe administrateur</label><input id="bulk-password" type="password"><label>Dossier PARCMAT</label><input id="bulk-files" type="file" webkitdirectory directory multiple accept=".pdf,.jpg,.jpeg,.png,.json"><label style="display:flex;gap:8px;align-items:center;margin-top:12px"><input id="bulk-replace" type="checkbox" style="width:auto"> <strong>Remplacer les données actuelles du dossier importé</strong></label><p class="muted small">En remplacement, les documents actuels des matériels présents dans le dossier sont retirés avant import. Les salariés portant le même nom conservent leur code personnel et leur date de visite médicale. Les nouveaux salariés reçoivent automatiquement un code à 6 chiffres affiché dans le journal.</p><button type="button" id="bulk-start">Importer tout le parc et les salariés</button><div id="bulk-status" class="muted"></div><pre id="bulk-log"></pre></div>
  <div class="box"><h2>📄 Documents du parc</h2><input id="doc-search" type="search" placeholder="Rechercher un matériel ou document...">${docs.map(d=>`<div class="doc-card searchable" data-search="${esc((MACHINES[d.id].name+' '+d.label).toLowerCase())}"><span><b>${esc(MACHINES[d.id].name)}</b><br><span class="muted">${esc(TYPES[d.type]?.label||d.type)}</span><br>${esc(d.label)}</span><span class="doc-actions"><form method="post" action="/.netlify/functions/admin" enctype="multipart/form-data" class="replace-form"><input type="hidden" name="action" value="replace-doc"><input type="hidden" name="key" value="${esc(d.key)}"><input type="hidden" name="id" value="${esc(d.id)}"><input type="hidden" name="type" value="${esc(d.type)}"><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" required hidden onchange="this.form.submit()"><button type="button" class="replace" onclick="this.previousElementSibling.click()">Remplacer</button></form><form method="post" action="/.netlify/functions/admin" onsubmit="return confirm('Supprimer définitivement ce document ?')"><input type="hidden" name="action" value="delete-doc"><input type="hidden" name="key" value="${esc(d.key)}"><button class="danger">Supprimer</button></form></span></div>`).join('')||'<p>Aucun document.</p>'}</div>\n  <div class="box archive-box"><div class="archive-head"><div><h2>🗄️ Archive</h2><p class="muted">Les anciens fichiers sont conservés automatiquement lors d’un remplacement.</p></div><span class="archive-count">${archives.length} fichier(s)</span></div>${archives.length?archives.map(a=>`<div class="doc-card archive-card"><span><b>${esc(MACHINES[a.id]?.name||a.id)}</b><br><span class="muted">${esc(TYPES[a.type]?.label||a.type)}</span><br>${esc(a.label)}${a.archivedAt?`<br><small class="muted">Archivé le ${esc(new Date(a.archivedAt).toLocaleString('fr-FR'))}</small>`:''}</span><span class="doc-actions"><a class="replace" href="/.netlify/functions/archive?key=${encodeURIComponent(a.key)}" target="_blank" rel="noopener">👁️ Consulter</a></span></div>`).join(''):'<p class="muted">Aucun document archivé.</p>'}</div></details>
  <details class="admin-section" id="salaries"><summary>👷 Salariés</summary>
  <div class="box employee-admin-box"><div class="file-manager-callout"><div><h3>🗂️ Gestionnaire de fichiers salariés</h3><p class="muted small">Parcourez les salariés et leurs dossiers comme dans l’Explorateur Windows : charger, supprimer, renommer, copier et coller les fichiers.</p></div><a class="admin-export admin-files-cta-large" href="/.netlify/functions/driver-files">🗂️ Ouvrir le gestionnaire de fichiers</a></div><div class="employee-admin-head"><div><h2>👷 Gestion des salariés</h2><p class="muted">Ajoutez facilement un salarié, définissez son code personnel et sa prochaine visite médicale.</p></div><span class="employee-count">${drivers.length} salarié(s)</span></div>
    <div class="employee-add-card"><div><h3>➕ Ajouter un salarié</h3><p class="muted">Le code personnel permet au salarié d'accéder à son espace.</p></div><form method="post" action="/.netlify/functions/admin" enctype="multipart/form-data" class="employee-add-form"><input type="hidden" name="action" value="add-driver"><div><label>Nom et prénom</label><input name="name" placeholder="Ex. Jean Dupont" required></div><div><label>Code personnel</label><div class="code-field"><input id="new-driver-code" name="code" placeholder="6 chiffres" inputmode="numeric" minlength="4" required><button type="button" class="secondary" onclick="generateDriverCode()">Générer</button></div></div><div><label>Photo du salarié <span class="photo-hint">(facultatif)</span></label><input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></div><button class="primary" type="submit">Ajouter le salarié</button></form></div>
    <div class="employee-list-head"><h3>Salariés enregistrés</h3><input id="driver-search" type="search" placeholder="Rechercher un salarié..."></div>
    <div id="driver-list">${adminDrivers.map(d=>`<div class="driver-admin-row driver-searchable" data-driver-search="${esc(d.name.toLowerCase())}"><div class="driver-admin-main"><div class="driver-photo-admin"><img class="driver-photo-thumb" src="/.netlify/functions/driver-photo?id=${encodeURIComponent(d.id)}&v=${encodeURIComponent(d.photoVersion||'1')}" alt="Photo de ${esc(d.name)}"><div><p class="driver-name"><b>${esc(d.name)}</b>${medicalVisitStatusAdmin(d.medicalVisitDate).days<0?'<span class="medical-late-tab" title="Visite médicale en retard">Retard</span>':''}</p><div class="driver-access-line"><span class="driver-code-badge">🔑 Code : <strong>${esc(d.accessCode||d.code||'Non renseigné')}</strong></span><span class="muted small">Accès personnel à la fiche</span></div><form method="post" action="/.netlify/functions/admin" class="driver-credentials"><input type="hidden" name="action" value="set-driver-code"><input type="hidden" name="driver" value="${esc(d.id)}"><div><label>Code personnel</label><input id="driver-code-${esc(d.id)}" name="code" type="text" value="${esc(d.accessCode||d.code||'')}" placeholder="Code non renseigné" autocomplete="off" class="driver-code-visible"></div><button type="button" class="secondary code-generate" onclick="generateDriverCodeFor('${esc(d.id)}')">Générer</button><button type="submit" class="primary">Enregistrer</button></form><form method="post" action="/.netlify/functions/admin" enctype="multipart/form-data" class="driver-photo-form"><input type="hidden" name="action" value="upload-driver-photo"><input type="hidden" name="driver" value="${esc(d.id)}"><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required><button type="submit">${d.photoVersion?'Modifier la photo':'Ajouter la photo'}</button></form></div></div></div></div>`).join('')||'<p class="muted">Aucun salarié enregistré.</p>'}</div>
  </div>
  <details class="admin-section" id="echeances-salaries"><summary>📅 Documents et échéances des salariés</summary><div class="admin-driver-list">${adminDrivers.map(d=>`<details class="admin-driver-detail"><summary><span class="admin-driver-summary-main"><img src="/.netlify/functions/driver-photo?id=${encodeURIComponent(d.id)}&v=${encodeURIComponent(d.photoVersion||'1')}" alt=""><span class="admin-driver-summary-name">${esc(d.name)}</span></span><span class="admin-driver-summary-right">${medicalVisitStatusAdmin(d.medicalVisitDate).days<0?'<span class="admin-late-badge">Retard visite</span>':''}<span class="admin-mini-code">🔑 ${esc(d.accessCode||d.code||'—')}</span></span></summary><div class="box"><h3>📁 Documents et échéances — ${esc(d.name)}</h3><div class="medical-visit-admin"><div><h4>🩺 Visite médicale</h4><p class="muted small">Cette date est directement intégrée aux échéances du salarié.</p></div><form method="post" action="/.netlify/functions/admin" class="medical-date-form"><input type="hidden" name="action" value="set-medical-visit"><input type="hidden" name="driver" value="${esc(d.id)}"><div><label>Prochaine visite médicale</label><input type="date" name="medicalVisitDate" value="${esc(d.medicalVisitDate||'')}"></div><button type="submit">Enregistrer</button></form></div><form method="post" action="/.netlify/functions/admin" enctype="multipart/form-data" class="driver-doc-form"><input type="hidden" name="action" value="upload-driver"><input type="hidden" name="driver" value="${esc(d.id)}"><div><label>Type d'échéance</label><select name="cat">${Object.entries(DRIVER_CATEGORIES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select></div><div><label>Détail / intitulé</label><input name="detail" placeholder="Ex. CACES R482 Cat. A, Permis B, Badge chantier"></div><div><label>Date d'expiration</label><input type="date" name="expiry"></div><div><label>Document</label><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" required></div><button>Charger</button></form></div></details>`).join('')}</div></details></details>
  <script>const t=document.getElementById('doc-type'),e=document.getElementById('expiry'),no=${JSON.stringify([...NO_EXPIRY])};function sync(){e.style.display=no.includes(t.value)?'none':''}t.addEventListener('change',sync);sync();const q=document.getElementById('doc-search');q?.addEventListener('input',()=>document.querySelectorAll('.searchable').forEach(x=>x.style.display=!q.value||x.dataset.search.includes(q.value.toLowerCase())?'':'none'));const ds=document.getElementById('driver-search');ds?.addEventListener('input',()=>document.querySelectorAll('.driver-searchable').forEach(x=>x.style.display=!ds.value||x.dataset.driverSearch.includes(ds.value.toLowerCase())?'':'none'));function generateDriverCode(){const input=document.getElementById('new-driver-code');if(!input)return;input.value=String(Math.floor(100000+Math.random()*900000));input.select();}function generateDriverCodeFor(id){const input=document.getElementById('driver-code-'+id);if(!input)return;input.value=String(Math.floor(100000+Math.random()*900000));input.select();}document.querySelectorAll('.machine-status-form').forEach(form=>form.addEventListener('submit',async ev=>{ev.preventDefault();const btn=form.querySelector('.machine-switch');if(!btn||btn.disabled)return;const row=form.closest('.machine-status-row');const state=row?.querySelector('.machine-status-state');const label=btn.querySelector('.machine-switch-label');const hidden=form.querySelector('input[name=enabled]');btn.disabled=true;try{const r=await fetch('/api/machine-status',{method:'POST',body:new FormData(form),credentials:'same-origin',headers:{'Accept':'application/json'}});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d?.message||'Erreur');const on=!!d.enabled;row?.classList.toggle('is-off',!on);btn.classList.toggle('is-on',on);btn.classList.toggle('is-off',!on);btn.setAttribute('aria-label',(on?'Désactiver':'Activer')+' '+(form.querySelector('input[name=id]')?.value||''));if(label)label.textContent=on?'ON':'OFF';if(hidden)hidden.value=on?'0':'1';if(state)state.textContent=on?'ON — échéances prises en compte':'OFF — échéances masquées';showStatus(d.message);}catch(err){showStatus(err.message||'Erreur lors de la modification.',true);}finally{btn.disabled=false;}}));function showStatus(message,bad=false){let box=document.getElementById('fleet-status-message');if(!box){box=document.createElement('div');box.id='fleet-status-message';box.style.cssText='margin:10px 0;padding:10px 12px;border-radius:8px;background:#eef6ff;color:#123;';const fleet=document.querySelector('.fleet-status-box');fleet?.prepend(box);}box.textContent=message;box.style.background=bad?'#fff0f0':'#eef6ff';setTimeout(()=>{if(box)box.textContent='';},2500);}document.querySelectorAll('.admin-nav a[href^="#"]').forEach(a=>a.addEventListener('click',ev=>{const id=a.getAttribute('href')?.slice(1);const target=document.getElementById(id);if(!target)return;ev.preventDefault();const parent=target.closest('details.admin-section');if(parent)parent.open=true;target.scrollIntoView({behavior:'smooth',block:'start'});}));</script><script src="/bulk-import.js"></script>`);
}

async function loadAdminData(){
  const [docs,drivers,statuses,extDates,archives]=await Promise.all([
    docsList(),driverList(),machineStatuses(),getExtinguisherDates(),archiveList()
  ]);
  const alerts=await adminAlerts(docs,extDates);
  return {docs,drivers,statuses,extDates,archives,alerts};
}

export default async req=>{
  try{
    if(req.method==='GET'){
      if(!isAdmin(req)) return html(shell('<div class="box"><p><a href="/admin.html">← Accès administration</a></p><h2>Session administrateur</h2><p class="muted">Votre session a expiré.</p></div>'),401);
      {const d=await loadAdminData(); return html(page(d.docs,d.drivers,' ',d.statuses,d.extDates,d.archives,d.alerts));}
    }
    const fd=await req.formData();
    const action=String(fd.get('action')||'');

    if(action==='login'){
      if(!secret()) return html(shell('<div class="box"><p class="bad">La variable PARC_PASSWORD n\'est pas configurée dans Netlify.</p></div>'),500);
      if(String(fd.get('password')||'')!==secret()) return html(shell('<div class="box"><p class="bad">Mot de passe incorrect.</p><p><a href="/admin.html">Retour</a></p></div>'),401);
      const d=await loadAdminData(); return html(await page(d.docs,d.drivers,'Connexion administrateur réussie.',d.statuses,d.extDates,d.archives,d.alerts),200,{'Set-Cookie':cookie('PARC_ADMIN',makeToken('ADMIN'))});
    }


    if(action==='bulk-replace-prepare'){
      const okByPassword=String(fd.get('password')||'')===secret();
      if(!isAdmin(req)&&!okByPassword) return new Response('Mot de passe incorrect',{status:401});
      let machineIds=[]; let driverNames=[];
      try{machineIds=JSON.parse(String(fd.get('machineIds')||'[]'));}catch{}
      try{driverNames=JSON.parse(String(fd.get('driverNames')||'[]'));}catch{}
      machineIds=[...new Set(machineIds.map(x=>String(x||'').toUpperCase()).filter(x=>MACHINES[x]))];
      driverNames=[...new Set(driverNames.map(x=>String(x||'').trim()).filter(Boolean))];
      for(const id of machineIds) await clearMachineDocuments(id);
      const target=new Set(driverNames.map(normPersonName));
      const drivers=await driverList();
      for(const d of drivers){if(target.has(normPersonName(d.name))) await clearDriverDocuments(d.id);}
      return new Response(JSON.stringify({ok:true,machinesCleared:machineIds.length,driversPrepared:[...target]}),{status:200,headers:{'Content-Type':'application/json; charset=utf-8'}});
    }
    if(action==='bulk-driver-ensure-all'){
      const okByPassword=String(fd.get('password')||'')===secret();
      if(!isAdmin(req)&&!okByPassword) return new Response('Mot de passe incorrect',{status:401});
      let names=[]; try{names=JSON.parse(String(fd.get('driverNames')||'[]'));}catch{}
      names=[...new Set(names.map(x=>String(x||'').trim()).filter(Boolean))];
      const out=[];
      for(const name of names){
        let d=await findDriverByName(name); let createdCode='';
        if(!d){
          const code=randomDriverCode(); createdCode=code;
          const id=crypto.randomUUID();
          d={id,name,codeHash:hashSecret(code),accessCode:code,enabled:true,photoVersion:''};
          await driverStore().set(`driver/${id}.json`,JSON.stringify(d),{metadata:{type:'driver'}});
        }
        out.push({name:d.name,id:d.id,createdCode});
      }
      return new Response(JSON.stringify({ok:true,drivers:out}),{status:200,headers:{'Content-Type':'application/json; charset=utf-8'}});
    }
    if(action==='bulk-driver'){
      const okByPassword=String(fd.get('password')||'')===secret();
      if(!isAdmin(req)&&!okByPassword) return new Response('Mot de passe incorrect',{status:401});
      const name=String(fd.get('driverName')||'').trim();
      const cat=String(fd.get('cat')||'divers').trim();
      const detail=String(fd.get('detail')||'').trim();
      const expiry=String(fd.get('expiry')||'').trim();
      const kind=String(fd.get('kind')||'doc');
      const file=fd.get('file');
      if(!name||!DRIVER_CATEGORIES[cat]||!(file instanceof File))return new Response('Données salarié invalides',{status:400});
      if(expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry))return new Response('Date d\'expiration invalide',{status:400});
      let d=await findDriverByName(name); let createdCode='';
      if(!d){
        const code=randomDriverCode(); createdCode=code;
        const id=crypto.randomUUID();
        d={id,name,codeHash:hashSecret(code),accessCode:code,enabled:true,photoVersion:''};
        await driverStore().set(`driver/${id}.json`,JSON.stringify(d),{metadata:{type:'driver'}});
      }
      if(kind==='photo'){
        if(!/^image\/(jpeg|png|webp)$/.test(file.type||'') || file.size>5*1024*1024)return new Response('Photo invalide',{status:400});
        await driverStore().set(`photo/${d.id}`,await file.arrayBuffer(),{metadata:{contentType:file.type,label:`Photo de ${d.name}`,uploadedAt:new Date().toISOString()}});
        d.photoVersion=Date.now();
        await driverStore().set(`driver/${d.id}.json`,JSON.stringify(d),{metadata:{type:'driver'}});
      }else{
        const clean=file.name.replace(/[\\/]/g,'_');
        await driverStore().set(`docs/${d.id}/${cat}/${clean}`,await file.arrayBuffer(),{metadata:{label:detail||DRIVER_CATEGORIES[cat].label,detail:detail||DRIVER_CATEGORIES[cat].label,expiry,contentType:file.type,uploadedAt:new Date().toISOString()}});
      }
      return new Response(JSON.stringify({ok:true,driver:d.name,id:d.id,createdCode,kind,cat}),{status:200,headers:{'Content-Type':'application/json; charset=utf-8'}});
    }
    if(action==='bulk-replace-finalize'){
      const okByPassword=String(fd.get('password')||'')===secret();
      if(!isAdmin(req)&&!okByPassword) return new Response('Mot de passe incorrect',{status:401});
      let driverNames=[]; try{driverNames=JSON.parse(String(fd.get('driverNames')||'[]'));}catch{}
      const target=new Set(driverNames.map(normPersonName));
      const drivers=await driverList();
      let removed=0;
      for(const d of drivers){if(!target.has(normPersonName(d.name))){await deleteDriverCompletely(d.id);removed++;}}
      return new Response(JSON.stringify({ok:true,removedDrivers:removed}),{status:200,headers:{'Content-Type':'application/json; charset=utf-8'}});
    }

    // Import de gros fichiers par fragments. Netlify limite les requêtes de Functions à 6 Mo
    // et les uploads binaires à environ 4,5 Mo utiles à cause de l'encodage Base64.
    if(action==='bulk-large-start') {
      const okByPassword=String(fd.get('password')||'')===secret();
      if(!isAdmin(req)&&!okByPassword) return new Response('Mot de passe incorrect',{status:401});
      let meta={}; try{meta=JSON.parse(String(fd.get('meta')||'{}'));}catch{}
      const target=String(meta.target||'');
      if(!['machine','driver'].includes(target)) return new Response('Cible d’import invalide',{status:400});
      if(target==='machine' && !allowed(String(meta.id||'').toUpperCase(),String(meta.type||''))) return new Response('Matériel/type invalide',{status:400});
      if(target==='driver' && (!String(meta.driverName||'').trim() || !DRIVER_CATEGORIES[String(meta.cat||'')])) return new Response('Salarié/catégorie invalide',{status:400});
      if(!String(meta.fileName||'').trim()) return new Response('Nom de fichier manquant',{status:400});
      const uploadId=crypto.randomUUID();
      await importTmpStore().set(`upload/${uploadId}/manifest.json`,JSON.stringify({createdAt:Date.now(),...meta}),{metadata:{type:'bulk-import-manifest',target}});
      return new Response(JSON.stringify({ok:true,uploadId}),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
    }
    if(action==='bulk-large-chunk') {
      const okByPassword=String(fd.get('password')||'')===secret();
      if(!isAdmin(req)&&!okByPassword) return new Response('Mot de passe incorrect',{status:401});
      const uploadId=String(fd.get('uploadId')||'').trim();
      const index=Number(fd.get('index'));
      const file=fd.get('file');
      if(!/^[-_a-zA-Z0-9]{20,64}$/.test(uploadId)||!Number.isInteger(index)||index<0||!(file instanceof File)) return new Response('Fragment invalide',{status:400});
      if(file.size>3.5*1024*1024) return new Response('Fragment trop volumineux',{status:413});
      const manifest=await importTmpStore().get(`upload/${uploadId}/manifest.json`,{type:'json'}).catch(()=>null);
      if(!manifest) return new Response('Import temporaire introuvable',{status:404});
      await importTmpStore().set(`upload/${uploadId}/chunk-${String(index).padStart(6,'0')}`,await file.arrayBuffer(),{metadata:{index:String(index),uploadedAt:new Date().toISOString()}});
      return new Response(JSON.stringify({ok:true,index,size:file.size}),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
    }
    if(action==='bulk-large-abort') {
      const okByPassword=String(fd.get('password')||'')===secret();
      if(!isAdmin(req)&&!okByPassword) return new Response('Mot de passe incorrect',{status:401});
      const uploadId=String(fd.get('uploadId')||'').trim();
      if(!/^[-_a-zA-Z0-9]{20,64}$/.test(uploadId)) return new Response('Import temporaire invalide',{status:400});
      const {blobs}=await importTmpStore().list({prefix:`upload/${uploadId}/`});
      await Promise.all(blobs.map(b=>importTmpStore().delete(b.key)));
      return new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json; charset=utf-8'}});
    }
    if(action==='bulk-large-finish') {
      const okByPassword=String(fd.get('password')||'')===secret();
      if(!isAdmin(req)&&!okByPassword) return new Response('Mot de passe incorrect',{status:401});
      const uploadId=String(fd.get('uploadId')||'').trim();
      const totalChunks=Number(fd.get('totalChunks'));
      const expectedSize=Number(fd.get('totalBytes'));
      if(!/^[-_a-zA-Z0-9]{20,64}$/.test(uploadId)||!Number.isInteger(totalChunks)||totalChunks<1||!Number.isFinite(expectedSize)||expectedSize<0) return new Response('Paramètres de finalisation invalides',{status:400});
      const tmp=importTmpStore();
      const manifest=await tmp.get(`upload/${uploadId}/manifest.json`,{type:'json'}).catch(()=>null);
      if(!manifest) return new Response('Import temporaire introuvable',{status:404});
      const parts=[]; let total=0;
      for(let i=0;i<totalChunks;i++){
        const key=`upload/${uploadId}/chunk-${String(i).padStart(6,'0')}`;
        const buf=await tmp.get(key,{type:'arrayBuffer'}); if(!buf) return new Response(`Fragment ${i+1} manquant ou illisible`,{status:409});
        parts.push(new Uint8Array(buf)); total+=buf.byteLength;
      }
      if(total!==expectedSize) return new Response(`Taille reconstruite incorrecte : ${total} octets au lieu de ${expectedSize}`,{status:409});
      const bytes=new Uint8Array(total); let offset=0; for(const part of parts){bytes.set(part,offset); offset+=part.byteLength;}
      try{
        if(manifest.target==='machine'){
          const id=String(manifest.id||'').toUpperCase(); const type=String(manifest.type||'');
          if(!allowed(id,type)) return new Response('Matériel/type invalide',{status:400});
          const expiry=String(manifest.expiry||'')||expiryFor(type,manifest.fileName);
          const clean=String(manifest.fileName).replace(/[\\/]/g,'_');
          await replaceExistingExpiryDocs(id,type);
          const newKey=`${id}/${type}/${clean}`;
          await store().set(newKey,bytes,{metadata:{type,label:String(manifest.fileName),expiry,uploadedAt:new Date().toISOString()}});
          await replaceExistingExpiryDocs(id,type,newKey);
        } else {
          const name=String(manifest.driverName||'').trim(); const cat=String(manifest.cat||'divers').trim();
          const detail=String(manifest.detail||'').trim(); const expiry=String(manifest.expiry||'').trim(); const kind=String(manifest.kind||'doc');
          if(!name||!DRIVER_CATEGORIES[cat]) return new Response('Données salarié invalides',{status:400});
          if(expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return new Response('Date d’expiration invalide',{status:400});
          let d=await findDriverByName(name); let createdCode='';
          if(!d){const code=randomDriverCode(); createdCode=code; const id=crypto.randomUUID(); d={id,name,codeHash:hashSecret(code),accessCode:code,enabled:true,photoVersion:''}; await driverStore().set(`driver/${id}.json`,JSON.stringify(d),{metadata:{type:'driver'}});}
          if(kind==='photo'){
            if(!/^image\/(jpeg|png|webp)$/.test(String(manifest.mime||'')) || bytes.byteLength>5*1024*1024) return new Response('Photo invalide',{status:400});
            await driverStore().set(`photo/${d.id}`,bytes,{metadata:{contentType:String(manifest.mime||''),label:`Photo de ${d.name}`,uploadedAt:new Date().toISOString()}});
            d.photoVersion=Date.now(); await driverStore().set(`driver/${d.id}.json`,JSON.stringify(d),{metadata:{type:'driver'}});
          } else {
            const clean=String(manifest.fileName).replace(/[\\/]/g,'_');
            await driverStore().set(`docs/${d.id}/${cat}/${clean}`,bytes,{metadata:{label:detail||DRIVER_CATEGORIES[cat].label,detail:detail||DRIVER_CATEGORIES[cat].label,expiry,contentType:String(manifest.mime||''),uploadedAt:new Date().toISOString()}});
          }
          return new Response(JSON.stringify({ok:true,target:'driver',driver:d.name,id:d.id,createdCode,kind,cat,size:bytes.byteLength}),{status:200,headers:{'Content-Type':'application/json; charset=utf-8'}});
        }
        return new Response(JSON.stringify({ok:true,target:manifest.target,size:bytes.byteLength}),{status:200,headers:{'Content-Type':'application/json; charset=utf-8'}});
      } finally {
        const deletes=[tmp.delete(`upload/${uploadId}/manifest.json`)];
        for(let i=0;i<totalChunks;i++) deletes.push(tmp.delete(`upload/${uploadId}/chunk-${String(i).padStart(6,'0')}`));
        await Promise.allSettled(deletes);
      }
    }

    // Import en masse : l'ancien bulk-import.js envoie le mot de passe à chaque fichier.
    if(String(fd.get('bulk')||'')==='1'){
      if(String(fd.get('password')||'')!==secret()) return new Response('Mot de passe incorrect',{status:401});
      const id=String(fd.get('id')||'').toUpperCase(),type=String(fd.get('type')||''),file=fd.get('file');
      if(!allowed(id,type)||!(file instanceof File)) return new Response('Données invalides',{status:400});
      const expiry=String(fd.get('expiry')||'')||expiryFor(type,file.name),clean=file.name.replace(/[\\/]/g,'_');
      await replaceExistingExpiryDocs(id,type);
      const newKey=`${id}/${type}/${clean}`;
      await store().set(newKey,await file.arrayBuffer(),{metadata:{type,label:file.name,expiry,uploadedAt:new Date().toISOString()}});
      await replaceExistingExpiryDocs(id,type,newKey);
      return new Response('OK',{status:200});
    }

    if(!isAdmin(req)) return html(shell('<div class="box"><p class="bad">Session administrateur absente ou expirée.</p><p><a href="/admin.html">Se reconnecter</a></p></div>'),401);

    if(action==='toggle-machine'){
      const id=String(fd.get('id')||'').toUpperCase();
      const enabled=String(fd.get('enabled')||'1')!=='0';
      if(!MACHINES[id]) return html(shell('<p class="bad">Matériel inconnu.</p>'),400);
      await statusStore().set(`machine/${id}.json`,JSON.stringify({id,enabled,updatedAt:new Date().toISOString()}),{metadata:{id,type:'machine-status',enabled:String(enabled)}});
      return new Response(JSON.stringify({ok:true,id,enabled,message:`${MACHINES[id].name} : ${enabled?'ON — les échéances sont prises en compte.':'OFF — les échéances sont masquées.'}`}),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
    }

    if(action==='set-all-extinguishers'){
      const expiry='2026-12';
      const ids=Object.keys(MACHINES).filter(hasExtinguisher);
      await Promise.all(ids.map(id=>extinguisherStore().set(`machine/${id}.json`,JSON.stringify({id,expiry,updatedAt:new Date().toISOString()}),{metadata:{id,type:'extinguisher',expiry}})));
      const d=await loadAdminData();
      return html(page(d.docs,d.drivers,`Toutes les échéances d’extincteurs ont été réglées au 12/2026 (${ids.length} matériel(s)).`,d.statuses,d.extDates,d.archives,d.alerts));
    }

    if(action==='set-extinguisher'){
      const id=String(fd.get('id')||'').toUpperCase();
      const expiry=String(fd.get('expiryMonth')||'');
      if(!hasExtinguisher(id) || !/^\d{4}-\d{2}$/.test(expiry)) return html(shell('<p class="bad">Mois et année d’échéance invalides.</p>'),400);
      await extinguisherStore().set(`machine/${id}.json`,JSON.stringify({id,expiry,updatedAt:new Date().toISOString()}),{metadata:{id,type:'extinguisher',expiry}});
      const d=await loadAdminData(); return html(page(d.docs,d.drivers,`Échéance extincteur enregistrée pour ${MACHINES[id].name} : ${expiry.slice(5,7)}/${expiry.slice(0,4)}.`,d.statuses,d.extDates,d.archives,d.alerts));
    }

    if(action==='replace-doc'){
      const oldKey=String(fd.get('key')||'');
      const id=String(fd.get('id')||'').toUpperCase();
      const type=String(fd.get('type')||'');
      const file=fd.get('file');
      if(!oldKey||!allowed(id,type)||!(file instanceof File)) return html(shell('<p class="bad">Données invalides pour le remplacement.</p>'),400);
      const clean=file.name.replace(/[\\/]/g,'_');
      const newKey=`${id}/${type}/${clean}`;
      const oldBytes=await store().get(oldKey,{type:'arrayBuffer'}).catch(()=>null);
      if(!oldBytes) return html(shell('<div class="box"><h2>Remplacement impossible</h2><p class="bad">L’ancien document n’a pas pu être lu avant archivage. Aucun fichier n’a été modifié.</p><p><a href="/admin">← Retour</a></p></div>'),500);
      const archiveKey=`${id}/${type}/${Date.now()}_${clean}`;
      let oldMeta={}; try{ oldMeta=(await store().getMetadata(oldKey,{consistency:'strong'}))?.metadata||{}; }catch{}
      await archiveStore().set(archiveKey,oldBytes,{metadata:{id,type,label:oldMeta.label||oldKey.split('/').pop()||oldKey,expiry:oldMeta.expiry||'',archivedAt:new Date().toISOString(),replacedFrom:oldKey}});
      let expiry=expiryFor(type,file.name);
      if(!expiry){
        try{
          const meta=await store().getMetadata(oldKey);
          expiry=String(meta?.metadata?.expiry||meta?.expiry||'');
        }catch{}
      }
      const bytes=await file.arrayBuffer();
      const oldLabel=oldKey.split('/').slice(2).join('/') || oldKey;
      const newLabel=clean;
      // V34 : écrire et vérifier le nouveau blob AVANT de supprimer l'ancien.
      // Ainsi, si l'écriture échoue, l'ancien document reste intact.
      const writeResult=await store().set(newKey,bytes,{metadata:{type,label:file.name,expiry,uploadedAt:new Date().toISOString(),replacedFrom:oldKey}});

      // Vérification forte du nouveau blob : existence + contenu réel + taille.
      let newData=null;
      let newMeta=null;
      try{
        const checked=await store().getWithMetadata(newKey,{consistency:'strong',type:'arrayBuffer'});
        if(checked){ newData=checked.data; newMeta=checked; }
      }catch{}
      if(!newData){
        return html(shell(`<div class="box"><h2>Erreur de remplacement</h2><p class="bad">Le nouveau fichier n’a pas été retrouvé après l’écriture dans Netlify Blobs.</p><p>Clé demandée : <code>${esc(newKey)}</code></p><p>Ancien conservé : ${esc(oldLabel)}</p><p>Nouveau demandé : ${esc(newLabel)}</p><p><a href="/admin">← Retour à l'administration</a></p></div>`),500);
      }
      const newSize=newData.byteLength;
      if(newSize!==bytes.byteLength){
        return html(shell(`<div class="box"><h2>Erreur de remplacement</h2><p class="bad">Le nouveau fichier a été retrouvé mais sa taille ne correspond pas.</p><p>Écrit : ${bytes.byteLength} octets — relu : ${newSize} octets.</p><p>Clé : <code>${esc(newKey)}</code></p><p>Ancien conservé : ${esc(oldLabel)}</p><p><a href="/admin">← Retour à l'administration</a></p></div>`),500);
      }

      // V35 : ne pas utiliser list() comme preuve immédiate d'écriture.
      // Netlify documente que list() peut être éventuellement cohérent, alors que
      // getMetadata/getWithMetadata permet de vérifier directement la clé.
      // Le nouveau blob a déjà été vérifié ci-dessus par getMetadata.

      // Seulement maintenant, supprimer l'ancien fichier.
      const archivedStillThere=!!(await archiveStore().get(archiveKey,{type:'arrayBuffer',consistency:'strong'}).catch(()=>null));
      if(!archivedStillThere)return html(shell('<div class="box"><h2>Remplacement interrompu</h2><p class="bad">L’archive n’a pas pu être vérifiée. L’ancien document est conservé.</p><p><a href="/admin">← Retour</a></p></div>'),500);
      if(oldKey && oldKey!==newKey) await store().delete(oldKey);
      await replaceExistingExpiryDocs(id,type,newKey);

      // Vérifier que l'ancien a disparu et que le nouveau est toujours présent, contenu compris.
      let oldGone=true,newStillThere=true;
      if(oldKey && oldKey!==newKey){ try{ const m=await store().getMetadata(oldKey,{consistency:'strong'}); if(m) oldGone=false; }catch{} }
      try{ const checked=await store().getWithMetadata(newKey,{consistency:'strong',type:'arrayBuffer'}); if(!checked || !checked.data || checked.data.byteLength!==bytes.byteLength) newStillThere=false; }catch{ newStillThere=false; }
      if(!oldGone || !newStillThere){
        return html(shell(`<div class="box"><h2>Remplacement partiellement effectué</h2><p class="bad">La vérification finale n'est pas conforme.</p><p>Ancien supprimé : ${oldGone?'oui':'NON'}</p><p>Nouveau présent et taille correcte : ${newStillThere?'oui':'NON'}</p><p>Ancien : ${esc(oldLabel)}</p><p>Nouveau : ${esc(newLabel)}</p><p><a href="/admin">← Retour à l'administration</a></p></div>`),500);
      }

      // Relire le store après l'opération pour afficher exactement la nouvelle clé.
      let refreshedDocs=await docsList();
      // list() peut encore être temporairement en retard. Reflète donc immédiatement
      // le résultat confirmé par getMetadata dans la page de réponse.
      refreshedDocs=refreshedDocs.filter(d=>d.key!==oldKey && d.key!==newKey);
      refreshedDocs.push({key:newKey,id,type,label:newLabel});
      refreshedDocs.sort((a,b)=>`${MACHINES[a.id].name}${a.label}`.localeCompare(`${MACHINES[b.id].name}${b.label}`,'fr'));
      const refreshedDrivers=await driverList();
      const d=await loadAdminData(); return html(page(d.docs,d.drivers,`Document remplacé : ${oldLabel} → ${newLabel}. Vérification Blobs OK : ${newSize} octets écrits et relus. Ancien fichier archivé.`,d.statuses,d.extDates,d.archives,d.alerts));
    }
    if(action==='delete-doc'){
      const key=String(fd.get('key')||'');if(key)await store().delete(key);
      const d=await loadAdminData(); return html(page(d.docs,d.drivers,'Document supprimé.',d.statuses,d.extDates,d.archives,d.alerts));
    }
    if(action==='add-driver'){
      const name=String(fd.get('name')||'').trim(),code=String(fd.get('code')||'').trim(),photo=fd.get('photo');
      if(!name||!code)return html(shell('<p class="bad">Nom et code obligatoires.</p>'),400);
      if(photo instanceof File && photo.size>0 && (!/^image\/(jpeg|png|webp)$/.test(photo.type)||photo.size>5*1024*1024))return html(shell('<p class="bad">Photo invalide. Utilisez JPG, PNG ou WebP (5 Mo maximum).</p>'),400);
      const id=crypto.randomUUID();
      const record={id,name,codeHash:hashSecret(code),accessCode:code,enabled:true,photoVersion:photo instanceof File && photo.size>0?Date.now():''};
      await driverStore().set(`driver/${id}.json`,JSON.stringify(record),{metadata:{type:'driver'}});
      if(photo instanceof File && photo.size>0) await driverStore().set(`photo/${id}`,await photo.arrayBuffer(),{metadata:{contentType:photo.type,label:`Photo de ${name}`,uploadedAt:new Date().toISOString()}});
      const d=await loadAdminData(); return html(page(d.docs,d.drivers,'Salarié ajouté.',d.statuses,d.extDates,d.archives,d.alerts));
    }
    if(action==='set-driver-code'){
      const did=String(fd.get('driver')||'').trim();
      const code=String(fd.get('code')||'').trim();
      if(!did)return html(shell('<p class="bad">Salarié introuvable.</p>'),400);
      const existing=await driverStore().get(`driver/${did}.json`,{type:'json'}).catch(()=>null);
      if(!existing)return html(shell('<p class="bad">Salarié introuvable.</p>'),404);
      if(!code)return html(shell(`<p class="bad">Veuillez saisir un nouveau mot de passe ou code pour ${esc(existing.name)}.</p>`),400);
      if(code.length<4)return html(shell('<p class="bad">Le mot de passe / code doit comporter au moins 4 caractères.</p>'),400);
      const updated={...existing,codeHash:hashSecret(code),accessCode:code};
      await driverStore().set(`driver/${did}.json`,JSON.stringify(updated),{metadata:{type:'driver'}});
      const d=await loadAdminData(); return html(page(d.docs,d.drivers,`Mot de passe / code mis à jour pour ${existing.name}.`,d.statuses,d.extDates,d.archives,d.alerts));
    }
    if(action==='set-medical-visit'){
      const did=String(fd.get('driver')||'').trim();
      const medicalVisitDate=String(fd.get('medicalVisitDate')||'').trim();
      if(!did)return html(shell('<p class="bad">Salarié introuvable.</p>'),400);
      const existing=await driverStore().get(`driver/${did}.json`,{type:'json'}).catch(()=>null);
      if(!existing)return html(shell('<p class="bad">Salarié introuvable.</p>'),404);
      if(medicalVisitDate && !/^\d{4}-\d{2}-\d{2}$/.test(medicalVisitDate))return html(shell('<p class="bad">Date de visite médicale invalide.</p>'),400);
      const updated={...existing,medicalVisitDate};
      await driverStore().set(`driver/${did}.json`,JSON.stringify(updated),{metadata:{type:'driver'}});
      const d=await loadAdminData(); return html(page(d.docs,d.drivers,medicalVisitDate?`Prochain RDV de visite médicale enregistré pour ${existing.name}.`:`Date de visite médicale supprimée pour ${existing.name}.`,d.statuses,d.extDates,d.archives,d.alerts));
    }
    if(action==='upload-driver-photo'){
      const did=String(fd.get('driver')||''),photo=fd.get('photo');
      const existing=await driverStore().get(`driver/${did}.json`,{type:'json'}).catch(()=>null);
      if(!existing || !(photo instanceof File) || !photo.size || !/^image\/(jpeg|png|webp)$/.test(photo.type) || photo.size>5*1024*1024) return html(shell('<p class="bad">Photo invalide. Utilisez JPG, PNG ou WebP (5 Mo maximum).</p>'),400);
      await driverStore().set(`photo/${did}`,await photo.arrayBuffer(),{metadata:{contentType:photo.type,label:`Photo de ${existing.name}`,uploadedAt:new Date().toISOString()}});
      existing.photoVersion=Date.now();
      await driverStore().set(`driver/${did}.json`,JSON.stringify(existing),{metadata:{type:'driver'}});
      const d=await loadAdminData(); return html(page(d.docs,d.drivers,`Photo de ${existing.name} mise à jour.`,d.statuses,d.extDates,d.archives,d.alerts));
    }
    if(action==='upload-driver'){
      const did=String(fd.get('driver')||''),cat=String(fd.get('cat')||'divers'),detail=String(fd.get('detail')||'').trim(),expiry=String(fd.get('expiry')||'').trim(),file=fd.get('file');
      if(!did||!DRIVER_CATEGORIES[cat]||!(file instanceof File))return html(shell('<p class="bad">Données invalides.</p>'),400);
      if(expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry))return html(shell(`<p class="bad">Date d'expiration invalide.</p>`),400);
      const clean=file.name.replace(/[\\/]/g,'_');
      await driverStore().set(`docs/${did}/${cat}/${clean}`,await file.arrayBuffer(),{metadata:{label:detail||DRIVER_CATEGORIES[cat].label,detail:detail||DRIVER_CATEGORIES[cat].label,expiry,contentType:file.type,uploadedAt:new Date().toISOString()}});
      const d=await loadAdminData(); return html(page(d.docs,d.drivers,'Document chauffeur chargé.',d.statuses,d.extDates,d.archives,d.alerts));
    }
    const id=String(fd.get('id')||'').toUpperCase(),type=String(fd.get('type')||''),file=fd.get('file');
    if(file instanceof File){
      if(!allowed(id,type))return html(shell('<p class="bad">Ce type de document ne correspond pas à ce matériel.</p>'),400);
      let expiry=String(fd.get('expiry')||'');if(!expiry)expiry=expiryFor(type,file.name);
      const clean=file.name.replace(/[\\/]/g,'_');
      await replaceExistingExpiryDocs(id,type);
      const newKey=`${id}/${type}/${clean}`;
      await store().set(newKey,await file.arrayBuffer(),{metadata:{type,label:file.name,expiry,uploadedAt:new Date().toISOString()}});
      await replaceExistingExpiryDocs(id,type,newKey);
      const d=await loadAdminData(); return html(page(d.docs,d.drivers,'Document chargé.',d.statuses,d.extDates,d.archives,d.alerts));
    }
    {const d=await loadAdminData(); return html(page(d.docs,d.drivers,' ',d.statuses,d.extDates,d.archives,d.alerts));}
  }catch(e){
    console.error('ADMIN ERROR',e);
    return html(errorPage(e),500);
  }
};
