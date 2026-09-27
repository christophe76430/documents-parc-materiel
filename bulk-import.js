const SKIP = /(^|\/)thumbs\.db$/i;
const NO_MACHINE_EXPIRY = new Set(['carte','barreRouge','divers','doc','devis']);
const EXP_DRIVER_CATS = new Set(['identite','permis','formation','acces','sante']);

const status = document.getElementById('bulk-status');
const log = document.getElementById('bulk-log');
const start = document.getElementById('bulk-start');
const filesInput = document.getElementById('bulk-files');
const replaceBox = document.getElementById('bulk-replace');

function pathParts(path){ return String(path||'').split('/').filter(Boolean); }
function lower(v){ return String(v||'').toLocaleLowerCase('fr-FR').trim(); }
function norm(v){ return lower(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
function cleanPathName(v){ return String(v||'').replace(/\\/g,'/'); }
function slugDate(value){
  const m=String(value||'').match(/\b(\d{2})[ ._-](\d{2})[ ._-](\d{2}|\d{4})\b/);
  if(!m)return '';
  const day=Number(m[1]), month=Number(m[2]); let year=Number(m[3]); if(year<100)year+=2000;
  const d=new Date(Date.UTC(year,month-1,day));
  if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)return '';
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function detailFromFile(fileName, driverName, subfolder){
  let base=String(fileName||'').replace(/\.[^.]+$/,'').trim();
  base=base.replace(/^\s*\d{2}[ ._-]\d{2}[ ._-](?:\d{2}|\d{4})\s*/,'');
  if(driverName){
    const re=new RegExp(driverName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
    base=base.replace(re,'');
  }
  base=base.replace(/^\s*[-–—_:]+\s*/,'').replace(/\s+/g,' ').trim();
  return base || subfolder || 'Document';
}

let machineMapPromise=null;
async function getMachineMap(){
  if(machineMapPromise)return machineMapPromise;
  machineMapPromise=(async()=>{
    const r=await fetch('/machines.json',{cache:'no-store'}); if(!r.ok)throw new Error('Impossible de charger la liste du parc.');
    const data=await r.json(); const plateMap=new Map();
    for(const items of Object.values(data||{})) for(const [id,name] of items||[]){
      for(const m of String(name).matchAll(/\b[A-Z]{2}-\d{3}-[A-Z]{2}\b/g)) plateMap.set(norm(m[0].replace(/-/g,' ')),id);
      plateMap.set(norm(id),id);
    }
    return {data,plateMap};
  })();
  return machineMapPromise;
}

function machineIdFromPath(path,map){
  const parts=pathParts(path);
  for(const p of parts){
    let m=p.match(/\b(T\d{2}|REM\d{2}|P\d{1,2}|RRA\d{3}|RRAT\d{3})\b/i);
    if(m){ const raw=m[1].toUpperCase(); if(raw==='REM09') return 'ANSEMS'; if(/^P\d+$/.test(raw)) return 'P'+raw.slice(1).padStart(2,'0'); return raw; }
    m=p.match(/\bPelle\s+(\d{1,2})\b/i);
    if(m)return 'P'+m[1].padStart(2,'0');
    if(/anssems/i.test(p))return 'ANSEMS';
    m=p.match(/\bAGT\s*(24|26)\s*(\d{3})\b/i);
    if(m)return `${m[1]==='26'?'RRAT':'RRA'}${m[2]}`;
    for(const plate of p.matchAll(/\b[A-Z]{2}[- ]\d{3}[- ]?[A-Z]{2}\b/gi)){
      const id=map.plateMap.get(norm(plate[0].replace(/-/g,' ')));
      if(id)return id;
    }
  }
  return null;
}

function machineTypeFromPath(path){
  const parts=pathParts(path); const folder=lower(parts.at(-2)); const file=lower(parts.at(-1));
  if(folder==='assurance')return'assurance';
  if(folder==='vgp'||folder.startsWith('vgp '))return'vgp';
  if(folder==='mines'||folder.includes('contrôle technique')||folder.includes('controle technique')||folder==='ct')return'mines';
  if(folder.includes('barre shunt')||folder.includes('barre de shunt'))return'shunt';
  if(folder==='agrement'||folder==='agrément')return'agrement';
  if(folder==='carte grise'||folder==='carte')return'carte';
  if(folder.includes('barre rouge')||folder.includes('barré rouge'))return'barreRouge';
  if(folder==='doc'||folder==='docs')return'doc';
  if(folder==='devis')return'devis';
  if(/\b(agrément|agrement|agt)\b/i.test(file))return'agrement';
  if(/\b(vgp|rapport de vérification|inspection)\b/i.test(file))return'vgp';
  if(/\b(mines|contrôle technique|controle technique|ct)\b/i.test(file))return'mines';
  if(/\b(shunt|barre de shunt)\b/i.test(file))return'shunt';
  if(/\b(carte grise|\bcg\b)\b/i.test(file))return'carte';
  if(/\b(barré rouge|barre rouge)\b/i.test(file))return'barreRouge';
  return'divers';
}

function isSalaryPath(path){ return pathParts(path).some(p=>lower(p)==='04 - salaries'); }
function driverInfo(path){
  const parts=pathParts(path); const idx=parts.findIndex(p=>lower(p)==='04 - salaries');
  if(idx<0||!parts[idx+1])return null;
  const name=parts[idx+1];
  const categoryFolder=lower(parts[idx+2]||'');
  const subfolder=parts[idx+3]||'';
  const file=parts[idx+4]||parts.at(-1)||'';
  if(SKIP.test(path))return null;
  const sub=lower(subfolder);
  if(sub==='photo') return {name,kind:'photo',cat:'identite',detail:'Photo',expiry:''};
  let cat='divers';
  if(categoryFolder.startsWith('1 .')||categoryFolder.includes('identite'))cat='identite';
  else if(categoryFolder.startsWith('2 .')||categoryFolder.includes('permis'))cat='permis';
  else if(categoryFolder.startsWith('3 .')||categoryFolder.includes('formation')){
    if(/badge|accès|acces|carte pro btp/i.test(subfolder))cat='acces'; else cat='formation';
  }
  else if(categoryFolder.startsWith('4 .')||categoryFolder.includes('diplome'))cat='diplomes';
  else if(categoryFolder.startsWith('5 .')||categoryFolder.includes('sante')||categoryFolder.includes('santé'))cat='sante';
  else if(categoryFolder.startsWith('6 .')||categoryFolder.includes('divers'))cat='divers';
  if(/carte pro btp/i.test(subfolder))cat='acces';
  if(cat==='divers' && /habilitation|aipr|caces|sst|n1|n2/i.test(file))cat='formation';
  const expiry=EXP_DRIVER_CATS.has(cat)?slugDate(file):'';
  return {name,kind:'doc',cat,detail:detailFromFile(file,name,subfolder),expiry};
}

async function readImportManifest(files){
  const f=files.find(x=>x.name==='THN_IMPORT_MANIFEST.json');
  if(!f)return {employees:[]};
  try{return JSON.parse(await f.text());}catch{return {employees:[]};}
}

async function postForm(fields){
  const fd=new FormData(); for(const [k,v] of Object.entries(fields)){fd.append(k,typeof v==='string'?v:JSON.stringify(v));}
  const r=await fetch('/.netlify/functions/admin',{method:'POST',body:fd,credentials:'same-origin'});
  const txt=await r.text(); let data=null; try{data=JSON.parse(txt);}catch{}
  if(!r.ok)throw new Error(data?.message||txt||`HTTP ${r.status}`);
  return data||{ok:true};
}

if(start)start.addEventListener('click',async()=>{
  const files=[...filesInput.files].filter(f=>!(SKIP.test(f.webkitRelativePath||f.name)));
  const password=document.getElementById('bulk-password').value;
  if(!password){alert('Entre le mot de passe administrateur.');return;}
  if(!files.length){alert('Sélectionne le dossier PARCMAT décompressé.');return;}
  start.disabled=true; log.textContent='';
  try{
    const {plateMap}=await getMachineMap();
    const machineIds=new Set(), driverNames=new Set(); const machineFiles=[],driverFiles=[],unknown=[];
    const manifest=await readImportManifest(files);
    for(const name of (manifest.employees||[]))if(String(name).trim())driverNames.add(String(name).trim());
    for(const f of files){
      const path=cleanPathName(f.webkitRelativePath||f.name);
      if(path.split('/').some(p=>p.toLowerCase()==='parcmat') && path.toLowerCase().endsWith('thumbs.db'))continue;
      if(isSalaryPath(path)){
        const info=driverInfo(path); if(info){driverFiles.push({f,path,info});driverNames.add(info.name);} else unknown.push(path);
      }else{
        const id=machineIdFromPath(path,{plateMap});
        if(id){machineIds.add(id); machineFiles.push({f,path,id,type:machineTypeFromPath(path)});} else unknown.push(path);
      }
    }
    log.textContent+=`Pré-analyse : ${machineFiles.length} documents matériel, ${driverFiles.length} documents salariés, ${driverNames.size} salarié(s), ${unknown.length} fichier(s) ignoré(s).\n`;
    if(unknown.length){ log.textContent+=unknown.slice(0,40).map(x=>'IGNORÉ : '+x).join('\n')+'\n'; if(unknown.length>40)log.textContent+=`… ${unknown.length-40} autres fichiers ignorés.\n`; }
    const replace=!!replaceBox?.checked;
    if(replace){
      const confirmText=`Remplacer les documents actuels de ${machineIds.size} matériels et synchroniser ${driverNames.size} salarié(s) ?`;
      if(!confirm(confirmText)){start.disabled=false;return;}
      status.textContent='Nettoyage préalable…';
      await postForm({action:'bulk-replace-prepare',password,machineIds:[...machineIds],driverNames:[...driverNames]});
      log.textContent+='OK : préparation du remplacement terminée.\n';
    }
    const codes={};
    // Crée aussi les salariés dont le dossier est vide.
    if(driverNames.size){
      status.textContent=`Création/vérification des ${driverNames.size} salariés…`;
      const ensured=await postForm({action:'bulk-driver-ensure-all',password,driverNames:[...driverNames]});
      for(const x of (ensured?.drivers||[]))if(x.createdCode)codes[x.name]=x.createdCode;
      log.textContent+=`OK : ${driverNames.size} salarié(s) préparé(s).\n`;
      for(const [name,code] of Object.entries(codes)) log.textContent+=`CODE À COMMUNIQUER — ${name} : ${code}\n`;
    }
    let total=machineFiles.length+driverFiles.length, done=0, ok=0, fail=0;
    for(const item of machineFiles){
      done++; status.textContent=`Import ${done}/${total} — ${item.path}`;
      const fd=new FormData(); fd.append('password',password); fd.append('id',item.id); fd.append('type',item.type); fd.append('file',item.f,item.f.name); fd.append('bulk','1');
      try{
        const r=await fetch('/.netlify/functions/admin',{method:'POST',body:fd,credentials:'same-origin'});
        if(r.ok){ok++;log.textContent+=`OK : ${item.path}\n`;}else{fail++;log.textContent+=`ERREUR HTTP ${r.status} : ${item.path}\n`;}
      }catch(e){fail++;log.textContent+=`ERREUR réseau : ${item.path} — ${e.message}\n`;}
      log.scrollTop=log.scrollHeight;
    }
    for(const item of driverFiles){
      done++; status.textContent=`Import ${done}/${total} — ${item.path}`;
      const fd=new FormData();
      fd.append('action','bulk-driver'); fd.append('password',password); fd.append('driverName',item.info.name); fd.append('cat',item.info.cat); fd.append('detail',item.info.detail); fd.append('expiry',item.info.expiry); fd.append('kind',item.info.kind); fd.append('file',item.f,item.f.name);
      try{
        const r=await fetch('/.netlify/functions/admin',{method:'POST',body:fd,credentials:'same-origin'}); const txt=await r.text(); let d=null;try{d=JSON.parse(txt);}catch{}
        if(r.ok){ok++;log.textContent+=`OK : ${item.path}${d?.createdCode?' — code '+d.createdCode:''}\n`;}
        else{fail++;log.textContent+=`ERREUR HTTP ${r.status} : ${item.path} — ${txt}\n`;}
      }catch(e){fail++;log.textContent+=`ERREUR réseau : ${item.path} — ${e.message}\n`;}
      log.scrollTop=log.scrollHeight;
    }
    if(replace && fail===0){
      status.textContent='Finalisation du remplacement…';
      const fin=await postForm({action:'bulk-replace-finalize',password,driverNames:[...driverNames]});
      log.textContent+=`OK : synchronisation salariés terminée (${fin.removedDrivers||0} ancien(s) supprimé(s)).\n`;
    }else if(replace && fail>0){
      log.textContent+='ATTENTION : le remplacement n’a pas été finalisé car certaines importations ont échoué. Les éléments restants n’ont pas été supprimés.\n';
    }
    status.textContent=`Terminé : ${ok} importé(s), ${fail} erreur(s), ${unknown.length} ignoré(s).${Object.keys(codes).length?' Codes nouveaux affichés dans le journal.':''}`;
  }catch(e){status.textContent='Erreur : '+(e?.message||e);log.textContent+='ERREUR : '+(e?.stack||e)+'\n';}
  start.disabled=false;
});
