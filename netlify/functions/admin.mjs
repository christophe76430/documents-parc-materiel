import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import machines from '../../machines.json' with { type: 'json' };

const STORE = 'parc-documents';
const DRIVER_STORE = 'parc-chauffeurs';
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
const secret = () => process.env.PARC_PASSWORD || '';

function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function html(s,status=200,headers={}){return new Response(s,{status,headers:{'Content-Type':'text/html; charset=utf-8',...headers}});}
function parseCookies(req){const out={};for(const p of (req.headers.get('cookie')||'').split(';')){const i=p.indexOf('=');if(i>0)out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1));}return out;}
function makeToken(id){const exp=Date.now()+TTL;const payload=`${id}.${exp}`;const sig=crypto.createHmac('sha256',secret()).update(payload).digest('hex');return Buffer.from(`${payload}.${sig}`).toString('base64url');}
function validToken(token,id){try{if(!token||!secret())return false;const raw=Buffer.from(token,'base64url').toString();const [tid,exp,sig]=raw.split('.');if(tid!==id||!Number.isFinite(Number(exp))||Number(exp)<=Date.now())return false;const expected=crypto.createHmac('sha256',secret()).update(`${tid}.${exp}`).digest('hex');return !!sig&&crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected));}catch{return false;}}
function cookie(name,value){return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL/1000}`;}
function isAdmin(req){return validToken(parseCookies(req).PARC_ADMIN,'ADMIN');}
function parseDate(s){const t=String(s||'').replace(/_/g,' ').replace(/\s+/g,' ');let m=t.match(/\b(\d{2})[-./ ](\d{2})[-./ ](\d{4})\b/);if(m)return new Date(+m[3],+m[2]-1,+m[1]);m=t.match(/\b(\d{4})[-./](\d{2})[-./](\d{2})\b/);if(m)return new Date(+m[1],+m[2]-1,+m[3]);const months={janvier:0,janv:0,'février':1,fevr:1,'févr':1,fevrier:1,mars:2,avril:3,avr:3,mai:4,juin:5,juillet:6,juil:6,'août':7,aout:7,septembre:8,sept:8,octobre:9,oct:9,novembre:10,nov,'décembre':11,decembre:11,'déc':11,dec:11};m=t.toLowerCase().match(/\b(\d{1,2})\s+(janvier|janv|février|fevr|févr|fevrier|mars|avril|avr|mai|juin|juillet|juil|août|aout|septembre|sept|octobre|oct|novembre|nov|décembre|decembre|déc|dec)\s+(\d{4})\b/);if(m)return new Date(+m[3],months[m[2]],+m[1]);return null;}
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
async function driverList(){const {blobs}=await driverStore().list({prefix:'driver/'});const values=await Promise.all(blobs.map(b=>driverStore().get(b.key,{type:'json'}).catch(()=>null)));return values.filter(Boolean);}
function shell(body){return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Administration THN</title><link rel="stylesheet" href="/style.css"></head><body><main>${body}</main></body></html>`;}
function errorPage(e){return shell(`<div class="box"><h2>Erreur Administration</h2><p class="bad">${esc(e?.message||String(e))}</p><p><a href="/admin.html">← Retour à l'accès administration</a></p></div>`);}
function page(docs,drivers,msg=''){return shell(`<div class="box"><p><a href="/">← Accueil</a></p>${msg?`<p class="ok">${esc(msg)}</p>`:''}</div><div class="box"><h2>📄 Import d'un document</h2><form method="post" action="/.netlify/functions/admin" enctype="multipart/form-data"><label>Matériel</label><select name="id">${Object.values(MACHINES).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select><label>Type</label><select name="type" id="doc-type">${Object.entries(TYPES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select><label id="expiry-label">Date d'expiration</label><input id="expiry" type="date" name="expiry"><label>Fichier</label><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" required><button>Charger le document</button></form></div><div class="box"><h2>📦 Import de tout le parc</h2><p class="muted">Sélectionne le dossier <strong>PARCMAT</strong>. Les sous-dossiers sont reconnus automatiquement.</p><label>Mot de passe administrateur</label><input id="bulk-password" type="password"><label>Dossier PARCMAT</label><input id="bulk-files" type="file" webkitdirectory directory multiple accept=".pdf,.jpg,.jpeg,.png"><button type="button" id="bulk-start">Importer tout le parc</button><div id="bulk-status" class="muted"></div><pre id="bulk-log"></pre></div><div class="box"><h2>🗑️ Documents du parc</h2><input id="doc-search" type="search" placeholder="Rechercher un matériel ou document...">${docs.map(d=>`<div class="doc-card searchable" data-search="${esc((MACHINES[d.id].name+' '+d.label).toLowerCase())}"><span><b>${esc(MACHINES[d.id].name)}</b><br><span class="muted">${esc(TYPES[d.type]?.label||d.type)}</span><br>${esc(d.label)}</span><form method="post" action="/.netlify/functions/admin" onsubmit="return confirm('Supprimer définitivement ce document ?')"><input type="hidden" name="action" value="delete-doc"><input type="hidden" name="key" value="${esc(d.key)}"><button class="danger">Supprimer</button></form></div>`).join('')||'<p>Aucun document.</p>'}</div><div class="box"><h2>👷 Gestion des chauffeurs</h2>${drivers.map(d=>`<p><b>${esc(d.name)}</b> — code personnel enregistré</p>`).join('')||'<p class="muted">Aucun chauffeur.</p>'}<form method="post" action="/.netlify/functions/admin"><input type="hidden" name="action" value="add-driver"><label>Nom du chauffeur</label><input name="name" required><label>Code personnel</label><input name="code" required><button>Ajouter le chauffeur</button></form></div>${drivers.map(d=>`<div class="box"><h3>📁 Documents — ${esc(d.name)}</h3><form method="post" action="/.netlify/functions/admin" enctype="multipart/form-data"><input type="hidden" name="action" value="upload-driver"><input type="hidden" name="driver" value="${esc(d.id)}"><label>Rubrique</label><select name="cat">${Object.entries(DRIVER_CATEGORIES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select><label>Fichier</label><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" required><button>Charger</button></form></div>`).join('')}<script>const t=document.getElementById('doc-type'),e=document.getElementById('expiry'),no=${JSON.stringify([...NO_EXPIRY])};function sync(){e.style.display=no.includes(t.value)?'none':''}t.addEventListener('change',sync);sync();const q=document.getElementById('doc-search');q?.addEventListener('input',()=>document.querySelectorAll('.searchable').forEach(x=>x.style.display=!q.value||x.dataset.search.includes(q.value.toLowerCase())?'':'none'));</script><script src="/bulk-import.js"></script>`);}

export default async req=>{
  try{
    if(req.method==='GET'){
      if(!isAdmin(req)) return html(shell('<div class="box"><p><a href="/admin.html">← Accès administration</a></p><h2>Session administrateur</h2><p class="muted">Votre session a expiré.</p></div>'),401);
      return html(page(await docsList(),await driverList()));
    }
    const fd=await req.formData();
    const action=String(fd.get('action')||'');

    if(action==='login'){
      if(!secret()) return html(shell('<div class="box"><p class="bad">La variable PARC_PASSWORD n\'est pas configurée dans Netlify.</p></div>'),500);
      if(String(fd.get('password')||'')!==secret()) return html(shell('<div class="box"><p class="bad">Mot de passe incorrect.</p><p><a href="/admin.html">Retour</a></p></div>'),401);
      return html(await page(await docsList(),await driverList(),'Connexion administrateur réussie.'),200,{'Set-Cookie':cookie('PARC_ADMIN',makeToken('ADMIN'))});
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

    if(action==='delete-doc'){
      const key=String(fd.get('key')||'');if(key)await store().delete(key);
      return html(page(await docsList(),await driverList(),'Document supprimé.'));
    }
    if(action==='add-driver'){
      const name=String(fd.get('name')||'').trim(),code=String(fd.get('code')||'').trim();
      if(!name||!code)return html(shell('<p class="bad">Nom et code obligatoires.</p>'),400);
      const id=crypto.randomUUID();
      await driverStore().set(`driver/${id}.json`,JSON.stringify({id,name,codeHash:hashSecret(code),enabled:true}),{metadata:{type:'driver'}});
      return html(page(await docsList(),await driverList(),'Chauffeur ajouté.'));
    }
    if(action==='upload-driver'){
      const did=String(fd.get('driver')||''),cat=String(fd.get('cat')||'divers'),file=fd.get('file');
      if(!did||!DRIVER_CATEGORIES[cat]||!(file instanceof File))return html(shell('<p class="bad">Données invalides.</p>'),400);
      await driverStore().set(`docs/${did}/${cat}/${file.name.replace(/[\\/]/g,'_')}`,await file.arrayBuffer(),{metadata:{label:DRIVER_CATEGORIES[cat].label,contentType:file.type,uploadedAt:new Date().toISOString()}});
      return html(page(await docsList(),await driverList(),'Document chauffeur chargé.'));
    }
    const id=String(fd.get('id')||'').toUpperCase(),type=String(fd.get('type')||''),file=fd.get('file');
    if(file instanceof File){
      if(!allowed(id,type))return html(shell('<p class="bad">Ce type de document ne correspond pas à ce matériel.</p>'),400);
      let expiry=String(fd.get('expiry')||'');if(!expiry)expiry=expiryFor(type,file.name);
      const clean=file.name.replace(/[\\/]/g,'_');
      await store().set(`${id}/${type}/${clean}`,await file.arrayBuffer(),{metadata:{type,label:file.name,expiry,uploadedAt:new Date().toISOString()}});
      return html(page(await docsList(),await driverList(),'Document chargé.'));
    }
    return html(page(await docsList(),await driverList()));
  }catch(e){
    console.error('ADMIN ERROR',e);
    return html(errorPage(e),500);
  }
};
