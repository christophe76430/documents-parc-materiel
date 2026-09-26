import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import machines from '../../machines.json' with { type: 'json' };

const STORE = 'parc-documents';
const DRIVER_STORE = 'parc-chauffeurs';
const STATUS_STORE = 'parc-materiel-status';
const EXTINGUISHER_STORE = 'parc-extincteurs';
const ARCHIVE_STORE = 'parc-documents-archive';
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
  identite:{label:'Identité',icon:'👤'},
  formation:{label:'Formation',icon:'🎓'},
  divers:{label:'Divers',icon:'📂'}
};
const NO_EXPIRY = new Set(['carte','barreRouge','divers','doc','devis']);
const AGR = new Set(['P16','P17','P18','P19','P20','P21','P24','P25','RRA319','RRA034','RRA035','RRA318','RRAT064','RRAT089']);

const store = () => getStore({name:STORE,region:REGION,consistency:'strong'});
const driverStore = () => getStore({name:DRIVER_STORE,region:REGION,consistency:'strong'});
const statusStore = () => getStore({name:STATUS_STORE,region:REGION,consistency:'strong'});
const extinguisherStore = () => getStore({name:EXTINGUISHER_STORE,region:REGION,consistency:'strong'});
const archiveStore = () => getStore({name:ARCHIVE_STORE,region:REGION,consistency:'strong'});
const hasExtinguisher = id => { const m=MACHINES[id]; if(!m) return false; if(/^(REM|RRA|RRAT|ANSEMS)/i.test(id) || /\bremorque\b/i.test(m.name)) return false; return m.group==='pelles' || /^T\d+$/.test(id); };
async function getExtinguisherDates(){const out={};for(const id of Object.keys(MACHINES)){if(!hasExtinguisher(id))continue;try{const r=await extinguisherStore().get(`machine/${id}.json`,{type:'json',consistency:'strong'});if(r?.expiry)out[id]=String(r.expiry);}catch{}}return out;}
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

async function docsList(){const {blobs}=await store().list({prefix:''});const out=[];for(const b of blobs){const p=b.key.split('/');if(!MACHINES[p[0]])continue;out.push({key:b.key,id:p[0],type:p[1]||'',label:p.slice(2).join('/')});}return out.sort((a,b)=>`${MACHINES[a.id].name}${a.label}`.localeCompare(`${MACHINES[b.id].name}${b.label}`,'fr'));}
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
  const out={};
  for(const id of Object.keys(MACHINES)) out[id]=true;
  for(const b of blobs){
    const id=b.key.slice('machine/'.length).replace(/\.json$/,'').toUpperCase();
    if(!MACHINES[id])continue;
    try{const v=await statusStore().get(b.key,{type:'json',consistency:'strong'});out[id]=v?.enabled!==false;}catch{}
  }
  return out;
}
async function adminAlerts(docs,extDates){
  const now=Date.now();
  const metas=await Promise.all(docs.map(async d=>(await store().getMetadata(d.key,{consistency:'strong'}).catch(()=>null))?.metadata||{}));
  let overdue=0,within30=0;
  for(let i=0;i<docs.length;i++){
    const d=docs[i], expiry=metas[i]?.expiry||'';
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
function shell(body){return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Administration THN</title><link rel="stylesheet" href="/style.css"><style>.driver-admin-row{padding:10px 0;border-bottom:1px solid #e5edf5}.driver-admin-row:last-child{border-bottom:0}.medical-date-form{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.medical-date-form label{margin:0}.medical-date-form input{min-width:170px}.doc-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.replace-form{margin:0}.replace{background:#1976d2;color:#fff}.doc-card form{margin:0}.doc-card button{margin:0}.employee-admin-box{overflow:hidden}.employee-admin-head,.employee-list-head,.driver-admin-main{display:flex;justify-content:space-between;gap:16px;align-items:center}.employee-count{background:#eef6ff;color:#1264b0;border-radius:999px;padding:7px 12px;font-weight:700}.employee-add-card{margin:18px 0;padding:18px;border:1px solid #d8e6f4;border-radius:14px;background:linear-gradient(180deg,#f8fbff,#fff)}.employee-add-form{display:grid;grid-template-columns:1.3fr 1fr auto;gap:12px;align-items:end;margin-top:14px}.code-field{display:flex;gap:8px}.code-field input{flex:1}.secondary{background:#eef6ff;color:#1264b0}.primary{background:#1769d1;color:#fff}.employee-list-head{margin-top:22px}.employee-list-head input{max-width:280px}.driver-admin-row{padding:14px 0;border-bottom:1px solid #e5edf5}.driver-admin-row:last-child{border-bottom:0}.driver-name{margin:0 0 3px}.small{font-size:.86rem}.medical-date-form{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.medical-date-form label{margin:0}.medical-date-form input{min-width:170px}</style></head><body><main>${body}<div class="site-footer-copy" style="text-align:center;padding:18px;color:#6b7f95">THN — Administration &nbsp; | &nbsp; Version <strong>V60</strong></div></main></body></html>`;}
function errorPage(e){return shell(`<div class="box"><h2>Erreur Administration</h2><p class="bad">${esc(e?.message||String(e))}</p><p><a href="/admin.html">← Retour à l'accès administration</a></p></div>`);}
function page(docs,drivers,msg='',statuses={},extDates={},archives=[],alerts={}){
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
  <div class="box admin-alerts"><h2>📊 Vue rapide</h2><div class="admin-alert-grid"><div><strong>${alerts.overdue||0}</strong><span>Échéances dépassées</span></div><div><strong>${alerts.within30||0}</strong><span>Échéances ≤ 30 jours</span></div><div><strong>${alerts.ext30||0}</strong><span>Extincteurs ≤ 30 jours</span></div><a class="admin-export" href="/export">📊 Export Excel</a></div></div>
  <div class="box fleet-status-box"><div class="fleet-status-head"><div><h2>⚙️ État du parc</h2><p class="muted">Passez un matériel sur <strong>OFF</strong> lorsqu'il est au garage ou inutilisé. Ses échéances disparaissent de l'accueil et des listes d'échéances.</p></div></div>${fleetHtml}</div>
  <div class="box"><h2>📄 Import d'un document</h2><form method="post" action="/.netlify/functions/admin" enctype="multipart/form-data"><label>Matériel</label><select name="id">${Object.values(MACHINES).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select><label>Type</label><select name="type" id="doc-type">${Object.entries(TYPES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select><label id="expiry-label">Date d'expiration</label><input id="expiry" type="date" name="expiry"><label>Fichier</label><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" required><button>Charger le document</button></form></div>
  <div class="box"><h2>📦 Import de tout le parc</h2><p class="muted">Sélectionne le dossier <strong>PARCMAT</strong>. Les sous-dossiers sont reconnus automatiquement.</p><label>Mot de passe administrateur</label><input id="bulk-password" type="password"><label>Dossier PARCMAT</label><input id="bulk-files" type="file" webkitdirectory directory multiple accept=".pdf,.jpg,.jpeg,.png"><button type="button" id="bulk-start">Importer tout le parc</button><div id="bulk-status" class="muted"></div><pre id="bulk-log"></pre></div>
  <div class="box"><h2>📄 Documents du parc</h2><input id="doc-search" type="search" placeholder="Rechercher un matériel ou document...">${docs.map(d=>`<div class="doc-card searchable" data-search="${esc((MACHINES[d.id].name+' '+d.label).toLowerCase())}"><span><b>${esc(MACHINES[d.id].name)}</b><br><span class="muted">${esc(TYPES[d.type]?.label||d.type)}</span><br>${esc(d.label)}</span><span class="doc-actions"><form method="post" action="/.netlify/functions/admin" enctype="multipart/form-data" class="replace-form"><input type="hidden" name="action" value="replace-doc"><input type="hidden" name="key" value="${esc(d.key)}"><input type="hidden" name="id" value="${esc(d.id)}"><input type="hidden" name="type" value="${esc(d.type)}"><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" required hidden onchange="this.form.submit()"><button type="button" class="replace" onclick="this.previousElementSibling.click()">Remplacer</button></form><form method="post" action="/.netlify/functions/admin" onsubmit="return confirm('Supprimer définitivement ce document ?')"><input type="hidden" name="action" value="delete-doc"><input type="hidden" name="key" value="${esc(d.key)}"><button class="danger">Supprimer</button></form></span></div>`).join('')||'<p>Aucun document.</p>'}</div>\n  <div class="box archive-box"><div class="archive-head"><div><h2>🗄️ Archive</h2><p class="muted">Les anciens fichiers sont conservés automatiquement lors d’un remplacement.</p></div><span class="archive-count">${archives.length} fichier(s)</span></div>${archives.length?archives.map(a=>`<div class="doc-card archive-card"><span><b>${esc(MACHINES[a.id]?.name||a.id)}</b><br><span class="muted">${esc(TYPES[a.type]?.label||a.type)}</span><br>${esc(a.label)}${a.archivedAt?`<br><small class="muted">Archivé le ${esc(new Date(a.archivedAt).toLocaleString('fr-FR'))}</small>`:''}</span><span class="doc-actions"><a class="replace" href="/.netlify/functions/archive?key=${encodeURIComponent(a.key)}" target="_blank" rel="noopener">👁️ Consulter</a></span></div>`).join(''):'<p class="muted">Aucun document archivé.</p>'}</div>
  <div class="box employee-admin-box"><div class="employee-admin-head"><div><h2>👷 Gestion des salariés</h2><p class="muted">Ajoutez facilement un salarié, définissez son code personnel et sa prochaine visite médicale.</p></div><span class="employee-count">${drivers.length} salarié(s)</span></div>
    <div class="employee-add-card"><div><h3>➕ Ajouter un salarié</h3><p class="muted">Le code personnel permet au salarié d'accéder à son espace.</p></div><form method="post" action="/.netlify/functions/admin" class="employee-add-form"><input type="hidden" name="action" value="add-driver"><div><label>Nom et prénom</label><input name="name" placeholder="Ex. Jean Dupont" required></div><div><label>Code personnel</label><div class="code-field"><input id="new-driver-code" name="code" placeholder="6 chiffres" inputmode="numeric" minlength="4" required><button type="button" class="secondary" onclick="generateDriverCode()">Générer</button></div></div><button class="primary" type="submit">Ajouter le salarié</button></form></div>
    <div class="employee-list-head"><h3>Salariés enregistrés</h3><input id="driver-search" type="search" placeholder="Rechercher un salarié..."></div>
    <div id="driver-list">${drivers.map(d=>`<div class="driver-admin-row driver-searchable" data-driver-search="${esc(d.name.toLowerCase())}"><div class="driver-admin-main"><div><p class="driver-name"><b>${esc(d.name)}</b></p><p class="muted small">Code personnel enregistré</p></div><form method="post" action="/.netlify/functions/admin" class="medical-date-form"><input type="hidden" name="action" value="set-medical-visit"><input type="hidden" name="driver" value="${esc(d.id)}"><div><label>Prochaine visite médicale</label><input type="date" name="medicalVisitDate" value="${esc(d.medicalVisitDate||'')}"></div><button type="submit">Enregistrer</button></form></div></div>`).join('')||'<p class="muted">Aucun salarié enregistré.</p>'}</div>
  </div>${drivers.map(d=>`<div class="box"><h3>📁 Documents — ${esc(d.name)}</h3><form method="post" action="/.netlify/functions/admin" enctype="multipart/form-data"><input type="hidden" name="action" value="upload-driver"><input type="hidden" name="driver" value="${esc(d.id)}"><label>Rubrique</label><select name="cat">${Object.entries(DRIVER_CATEGORIES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select><label>Fichier</label><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" required><button>Charger</button></form></div>`).join('')}
  <script>const t=document.getElementById('doc-type'),e=document.getElementById('expiry'),no=${JSON.stringify([...NO_EXPIRY])};function sync(){e.style.display=no.includes(t.value)?'none':''}t.addEventListener('change',sync);sync();const q=document.getElementById('doc-search');q?.addEventListener('input',()=>document.querySelectorAll('.searchable').forEach(x=>x.style.display=!q.value||x.dataset.search.includes(q.value.toLowerCase())?'':'none'));const ds=document.getElementById('driver-search');ds?.addEventListener('input',()=>document.querySelectorAll('.driver-searchable').forEach(x=>x.style.display=!ds.value||x.dataset.driverSearch.includes(ds.value.toLowerCase())?'':'none'));function generateDriverCode(){const input=document.getElementById('new-driver-code');if(!input)return;input.value=String(Math.floor(100000+Math.random()*900000));input.select();}document.querySelectorAll('.machine-status-form').forEach(form=>form.addEventListener('submit',async ev=>{ev.preventDefault();const btn=form.querySelector('.machine-switch');if(!btn||btn.disabled)return;const row=form.closest('.machine-status-row');const state=row?.querySelector('.machine-status-state');const label=btn.querySelector('.machine-switch-label');const hidden=form.querySelector('input[name=enabled]');btn.disabled=true;try{const r=await fetch('/api/machine-status',{method:'POST',body:new FormData(form),credentials:'same-origin',headers:{'Accept':'application/json'}});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d?.message||'Erreur');const on=!!d.enabled;row?.classList.toggle('is-off',!on);btn.classList.toggle('is-on',on);btn.classList.toggle('is-off',!on);btn.setAttribute('aria-label',(on?'Désactiver':'Activer')+' '+(form.querySelector('input[name=id]')?.value||''));if(label)label.textContent=on?'ON':'OFF';if(hidden)hidden.value=on?'0':'1';if(state)state.textContent=on?'ON — échéances prises en compte':'OFF — échéances masquées';showStatus(d.message);}catch(err){showStatus(err.message||'Erreur lors de la modification.',true);}finally{btn.disabled=false;}}));function showStatus(message,bad=false){let box=document.getElementById('fleet-status-message');if(!box){box=document.createElement('div');box.id='fleet-status-message';box.style.cssText='margin:10px 0;padding:10px 12px;border-radius:8px;background:#eef6ff;color:#123;';const fleet=document.querySelector('.fleet-status-box');fleet?.prepend(box);}box.textContent=message;box.style.background=bad?'#fff0f0':'#eef6ff';setTimeout(()=>{if(box)box.textContent='';},2500);}</script><script src="/bulk-import.js"></script>`);
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

    // Import en masse : l'ancien bulk-import.js envoie le mot de passe à chaque fichier.
    if(String(fd.get('bulk')||'')==='1'){
      if(String(fd.get('password')||'')!==secret()) return new Response('Mot de passe incorrect',{status:401});
      const id=String(fd.get('id')||'').toUpperCase(),type=String(fd.get('type')||''),file=fd.get('file');
      if(!allowed(id,type)||!(file instanceof File)) return new Response('Données invalides',{status:400});
      const expiry=String(fd.get('expiry')||'')||expiryFor(type,file.name),clean=file.name.replace(/[\\/]/g,'_');
      await store().set(`${id}/${type}/${clean}`,await file.arrayBuffer(),{metadata:{type,label:file.name,expiry,uploadedAt:new Date().toISOString()}});
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
      const name=String(fd.get('name')||'').trim(),code=String(fd.get('code')||'').trim();
      if(!name||!code)return html(shell('<p class="bad">Nom et code obligatoires.</p>'),400);
      const id=crypto.randomUUID();
      await driverStore().set(`driver/${id}.json`,JSON.stringify({id,name,codeHash:hashSecret(code),enabled:true}),{metadata:{type:'driver'}});
      const d=await loadAdminData(); return html(page(d.docs,d.drivers,'Chauffeur ajouté.',d.statuses,d.extDates,d.archives,d.alerts));
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
    if(action==='upload-driver'){
      const did=String(fd.get('driver')||''),cat=String(fd.get('cat')||'divers'),file=fd.get('file');
      if(!did||!DRIVER_CATEGORIES[cat]||!(file instanceof File))return html(shell('<p class="bad">Données invalides.</p>'),400);
      await driverStore().set(`docs/${did}/${cat}/${file.name.replace(/[\\/]/g,'_')}`,await file.arrayBuffer(),{metadata:{label:DRIVER_CATEGORIES[cat].label,contentType:file.type,uploadedAt:new Date().toISOString()}});
      const d=await loadAdminData(); return html(page(d.docs,d.drivers,'Document chauffeur chargé.',d.statuses,d.extDates,d.archives,d.alerts));
    }
    const id=String(fd.get('id')||'').toUpperCase(),type=String(fd.get('type')||''),file=fd.get('file');
    if(file instanceof File){
      if(!allowed(id,type))return html(shell('<p class="bad">Ce type de document ne correspond pas à ce matériel.</p>'),400);
      let expiry=String(fd.get('expiry')||'');if(!expiry)expiry=expiryFor(type,file.name);
      const clean=file.name.replace(/[\\/]/g,'_');
      await store().set(`${id}/${type}/${clean}`,await file.arrayBuffer(),{metadata:{type,label:file.name,expiry,uploadedAt:new Date().toISOString()}});
      const d=await loadAdminData(); return html(page(d.docs,d.drivers,'Document chargé.',d.statuses,d.extDates,d.archives,d.alerts));
    }
    {const d=await loadAdminData(); return html(page(d.docs,d.drivers,' ',d.statuses,d.extDates,d.archives,d.alerts));}
  }catch(e){
    console.error('ADMIN ERROR',e);
    return html(errorPage(e),500);
  }
};
