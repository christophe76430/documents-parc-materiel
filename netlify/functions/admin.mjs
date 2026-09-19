import { MACHINES,TYPES,store,html,esc,parseDate,iso } from './_shared.mjs';

const NO_EXPIRY_TYPES = new Set(['carte','carteGrise','barreRouge','divers','doc','devis','Carte grise','Barré rouge','Divers','Doc','Devis']);
const hasExpiryDate = (type) => !NO_EXPIRY_TYPES.has(String(type || '').trim());

const MACHINE_PATHS = {
  'T01 - EW-610-MD - Man TGS 35.420 8x4 Grue':'T01','T04 - EB-837-AD - Man TGS 28.440':'T04','T08 - BE-763-WR - Man TGS 35.400':'T08','T09 - DY-847-PK - Man TGS 35.440':'T09','T21 - FJ-210-WY - VOLVO FM (4)':'T21','T22 - FT-812-DM - VOLVO FM 6x4':'T22','T23 - GF-353-RM - MERCEDES AROCS':'T23','T24 - GP-257-GM Mercedes':'T24',
  'REM05 - EW-638-MH - Benne 3 essieux':'REM05','REM06 - CB-024-NG - Plateau Extensible':'REM06','REM08 - GQ-842-HQ':'REM08','REM09 -  ANSSEMS N GK-005-XL':'ANSEMS',
  'Pelle 3 -  Pelle à chenilles VOLVO Nr Serie 221447':'P03','Pelle 10 - Pelle à pneus  DOOSAN Nr Serie 50932':'P10','Pelle 11 - Pelle à chenilles CASE CX 145 CSR Serie 1592':'P11','Pelle 12 - Pelle à pneus DOOSAN DX165W-5 Nr Serie 1225':'P12','Pelle 16 - Pelle RR ACX 160 WRR A1P13007':'P16','Pelle 17 - Pelle RR ACX 160 WRR A1P13012':'P17','Pelle 18 - Pelle RR ACX 160 WRR A1P13013':'P18','Pelle 19 - Pelle RR ACX 105 RR M1P160009':'P19','Pelle 20 - Pelle RR ACX 23 RR A2P180013':'P20','Pelle 21 - Pelle RR ACX 23 RR A2P190038':'P21','Pelle 24 -Pelle  RR ATLAS 21 RR 243Z301276':'P24','Pelle 25- Pelle RR ATLAS 21 RR 243Z301279':'P25',
  'Remorque RR acx  AGT 24 319':'RRA319','Remorque RR acx AGT 24 034':'RRA034','Remorque RR acx AGT 24 035':'RRA035','Remorque RR acx AGT 24 318':'RRA318','remorque RR atlas AGT 26 064':'RRAT064','remorque RR atlas AGT 26 089':'RRAT089',
  '1. DL 884 QM - MERCEDES Sprinter 3T5 benne':'DL884QM','1. DT-494-VJ - CITROEN C3':'DT494VJ','1. DV-098-KA - CITROEN Jumpy':'DV098KA','1. EQ-811-AX - CITROEN Berlingo':'EQ811AX','1. FE-191-ZT - RENAULT Clio':'FE191ZT','1. FE-798-ZS - RENAULT Clio':'FE798ZS','1. FG-520-PX - RENAULT Kangoo':'FG520PX','1. FH-458-MR - RENAULT Clio':'FH458MR','1. FL-238-XW - RENAULT Kangoo':'FL238XW','1. FL-865-XW - RENAULT Kangoo':'FL865XW','1. FM-019-PV - RENAULT Kangoo long cargo':'FM019PV','1. FV-628-AN - RENAULT Kangoo':'FV628AN','1. FV-643-AN - RENAULT Kangoo':'FV643AN','1. FZ-856-BY - SEAT':'FZ856BY'
};
const MACHINE_ALIASES = Object.entries(MACHINE_PATHS).map(([name,id])=>[name.toLowerCase(),id]);
const NO_UPLOAD = /(^|\/)(archives?|archive|thumbs\.db)(\/|$)/i;

function machineIdFromPath(path){
  const parts=String(path||'').split('/').filter(Boolean);
  for(const part of parts){ const hit=MACHINE_ALIASES.find(([name])=>name===part.toLowerCase()); if(hit) return hit[1]; }
  return null;
}
function typeFromPath(path){
  const parts=String(path||'').split('/').filter(Boolean).map(x=>x.toLowerCase().trim());
  const folder=parts[parts.length-2]||'';
  if(folder==='assurance') return 'assurance';
  if(folder==='vgp') return 'vgp';
  if(folder==='mines') return 'mines';
  if(folder==='ct' || folder==='contrôle technique' || folder==='controle technique') return 'ct';
  if(folder==='barre shunt' || folder==='barre de shunt') return 'shunt';
  if(folder==='agrement' || folder==='agrément') return 'agrement';
  if(folder==='carte grise' || folder==='carte') return 'carte';
  if(folder==='barre rouge' || folder==='barré rouge' || folder==='barre-rouge') return 'barreRouge';
  if(folder==='divers') return 'divers';
  if(folder==='doc' || folder==='docs') return 'doc';
  if(folder==='devis') return 'devis';
  return null;
}
function allowedForMachine(id,type){
  if(!MACHINES[id] || !TYPES[type]) return false;
  if(type==='agrement' && !['P16','P17','P18','P19','P20','P21','P24','P25','RRA319','RRA034','RRA035','RRA318','RRAT064','RRAT089'].includes(id)) return false;
  return true;
}
function displayDate(type,fileName){ return hasExpiryDate(type) ? iso(parseDate(fileName)) : ''; }

export const config={path:'/admin'};
function shell(body){return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Administration</title><link rel="stylesheet" href="/style.css"></head><body><main><h1>Administration parc matériel</h1>${body}</main></body></html>`}

function formPage(){
 return shell(`<div class="box">
  <h2>Import d'un document</h2>
  <form method="post" enctype="multipart/form-data">
   <label>Mot de passe administrateur</label><input type="password" name="password" required>
   <label>Matériel</label><select name="id">${Object.values(MACHINES).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
   <label>Type</label><select name="type">${Object.entries(TYPES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select>
   <div id="expiry-wrap"><label>Date d'expiration</label><input type="date" name="expiry"></div>
   <label>PDF</label><input type="file" name="file" accept="application/pdf,.pdf" required>
   <button>Charger le document</button>
  </form>
 </div>
 <div class="box" style="margin-top:20px">
  <h2>Import de tout le parc</h2>
  <p class="muted">Sélectionne le dossier <strong>PARCMAT</strong> de ton ordinateur. Les sous-dossiers sont analysés automatiquement. Les archives et fichiers inutiles sont ignorés.</p>
  <label>Mot de passe administrateur</label><input id="bulk-password" type="password" autocomplete="off">
  <label>Dossier PARCMAT</label><input id="bulk-files" type="file" webkitdirectory directory multiple accept="application/pdf,.pdf">
  <button type="button" id="bulk-start">Importer tout le parc</button>
  <div id="bulk-status" class="muted" style="margin-top:12px"></div>
  <pre id="bulk-log" style="max-height:320px;overflow:auto;white-space:pre-wrap"></pre>
 </div>
 <script>
  const noExpiry=${JSON.stringify([...NO_EXPIRY_TYPES])};
  const type=document.querySelector('[name=type]'); const wrap=document.getElementById('expiry-wrap');
  function sync(){wrap.style.display=noExpiry.includes(type.value)?'none':''} type.addEventListener('change',sync); sync();
 </script>
 <script src="/bulk-import.js"></script>`);
}

export default async(req)=>{
 if(req.method==='GET') return html(formPage());
 const fd=await req.formData();
 if(String(fd.get('password')||'')!==(process.env.PARC_PASSWORD||'')) return html(shell('<p class="bad">Mot de passe incorrect.</p>'),401);
 const id=String(fd.get('id')||'').toUpperCase(), type=String(fd.get('type')||''), file=fd.get('file');
 if(!MACHINES[id]||!TYPES[type]||!(file instanceof File)) return html(shell('<p class="bad">Données invalides.</p>'),400);
 if(!allowedForMachine(id,type)) return html(shell('<p class="bad">Ce type de document ne correspond pas à ce matériel.</p>'),400);
 let expiry=''; if(hasExpiryDate(type)){ expiry=String(fd.get('expiry')||''); if(!expiry) expiry=iso(parseDate(file.name)); }
 const clean=file.name.replace(/[\\/]/g,'_'); const key=`${id}/${type}/${clean}`;
 await store().set(key,await file.arrayBuffer(),{metadata:{type,label:file.name,expiry,uploadedAt:new Date().toISOString()}});
 if(String(fd.get('bulk')||'')==='1') return new Response('OK',{status:200,headers:{'Content-Type':'text/plain; charset=utf-8'}});
 return html(shell(`<p class="ok">Document chargé pour ${esc(MACHINES[id].name)}.</p><p>${esc(file.name)}${expiry?` — expiration ${new Date(expiry+'T00:00:00').toLocaleDateString('fr-FR')}`:hasExpiryDate(type)?' — date à renseigner':' — sans date'}</p><p><a href="/machine/${id}">Voir le matériel</a></p>`));
};
