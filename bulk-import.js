const MACHINE_PATHS = {
  'T01 - EW-610-MD - Man TGS 35.420 8x4 Grue':'T01','T04 - EB-837-AD - Man TGS 28.440':'T04','T08 - BE-763-WR - Man TGS 35.400':'T08','T09 - DY-847-PK - Man TGS 35.440':'T09','T21 - FJ-210-WY - VOLVO FM (4)':'T21','T22 - FT-812-DM - VOLVO FM 6x4':'T22','T23 - GF-353-RM - MERCEDES AROCS':'T23','T24 - GP-257-GM Mercedes':'T24',
  'REM05 - EW-638-MH - Benne 3 essieux':'REM05','REM06 - CB-024-NG - Plateau Extensible':'REM06','REM08 - GQ-842-HQ':'REM08','REM09 -  ANSSEMS N GK-005-XL':'ANSEMS',
  'Pelle 3 -  Pelle à chenilles VOLVO Nr Serie 221447':'P03','Pelle 10 - Pelle à pneus  DOOSAN Nr Serie 50932':'P10','Pelle 11 - Pelle à chenilles CASE CX 145 CSR Serie 1592':'P11','Pelle 12 - Pelle à pneus DOOSAN DX165W-5 Nr Serie 1225':'P12','Pelle 16 - Pelle RR ACX 160 WRR A1P13007':'P16','Pelle 17 - Pelle RR ACX 160 WRR A1P13012':'P17','Pelle 18 - Pelle RR ACX 160 WRR A1P13013':'P18','Pelle 19 - Pelle RR ACX 105 RR M1P160009':'P19','Pelle 20 - Pelle RR ACX 23 RR A2P180013':'P20','Pelle 21 - Pelle RR ACX 23 RR A2P190038':'P21','Pelle 24 -Pelle  RR ATLAS 21 RR 243Z301276':'P24','Pelle 25- Pelle RR ATLAS 21 RR 243Z301279':'P25',
  'Remorque RR acx  AGT 24 319':'RRA319','Remorque RR acx AGT 24 034':'RRA034','Remorque RR acx AGT 24 035':'RRA035','Remorque RR acx AGT 24 318':'RRA318','remorque RR atlas AGT 26 064':'RRAT064','remorque RR atlas AGT 26 089':'RRAT089',
  '1. DL 884 QM - MERCEDES Sprinter 3T5 benne':'DL884QM','1. DT-494-VJ - CITROEN C3':'DT494VJ','1. DV-098-KA - CITROEN Jumpy':'DV098KA','1. EQ-811-AX - CITROEN Berlingo':'EQ811AX','1. FE-191-ZT - RENAULT Clio':'FE191ZT','1. FE-798-ZS - RENAULT Clio':'FE798ZS','1. FG-520-PX - RENAULT Kangoo':'FG520PX','1. FH-458-MR - RENAULT Clio':'FH458MR','1. FL-238-XW - RENAULT Kangoo':'FL238XW','1. FL-865-XW - RENAULT Kangoo':'FL865XW','1. FM-019-PV - RENAULT Kangoo long cargo':'FM019PV','1. FV-628-AN - RENAULT Kangoo':'FV628AN','1. FV-643-AN - RENAULT Kangoo':'FV643AN','1. FZ-856-BY - SEAT':'FZ856BY'
};
const AGREMENT_IDS = new Set(['P16','P17','P18','P19','P20','P21','P24','P25','RRA319','RRA034','RRA035','RRA318','RRAT064','RRAT089']);
const NO_EXPIRY = new Set(['carte','barreRouge','divers','doc','devis']);
const norm = s => String(s||'').toLowerCase().trim();
const typeFromPath = path => {
  const parts=String(path||'').split('/').filter(Boolean); const folder=norm(parts[parts.length-2]); const file=norm(parts[parts.length-1]);
  if(folder==='assurance') return 'assurance'; if(folder==='vgp') return 'vgp'; if(folder==='mines') return 'mines';
  if(folder==='ct'||folder==='contrôle technique'||folder==='controle technique') return 'ct';
  if(folder==='barre shunt'||folder==='barre de shunt') return 'shunt'; if(folder==='agrement'||folder==='agrément') return 'agrement';
  if(folder==='carte grise'||folder==='carte') return 'carte'; if(folder==='barre rouge'||folder==='barré rouge'||folder==='barre-rouge') return 'barreRouge';
  if(folder==='divers') return 'divers'; if(folder==='doc'||folder==='docs') return 'doc'; if(folder==='devis') return 'devis';
  if(/\b(vgp|rapport de vérification|rapportprovisoire|inspection)\b/i.test(file)) return 'vgp';
  if(/\b(mines|contrôle technique|controle technique|ct)\b/i.test(file)) return 'mines';
  if(/\b(assurance|carte verte)\b/i.test(file)) return 'assurance';
  if(/\b(shunt|barre de shunt)\b/i.test(file)) return 'shunt';
  if(/\b(agrément|agrement|agt)\b/i.test(file)) return 'agrement';
  if(/\b(carte grise|\bcg\b)\b/i.test(file)) return 'carte';
  if(/\b(barré rouge|barre rouge)\b/i.test(file)) return 'barreRouge';
  return 'divers';
};
const machineIdFromPath = path => {
  const parts=String(path||'').split('/').filter(Boolean).map(norm);
  for(const [name,id] of Object.entries(MACHINE_PATHS)) if(parts.includes(norm(name))) return id;
  return null;
};
const shouldSkip = path => !/\.pdf$/i.test(path) || /(^|\/)(archives?|archive|thumbs\.db)(\/|$)/i.test(path);
const status = document.getElementById('bulk-status'), log = document.getElementById('bulk-log');
const start = document.getElementById('bulk-start'), filesInput = document.getElementById('bulk-files');
if(start) start.addEventListener('click', async()=>{
  const files=[...filesInput.files], password=document.getElementById('bulk-password').value;
  if(!password){alert('Entre le mot de passe administrateur.');return}
  if(!files.length){alert('Sélectionne le dossier PARCMAT.');return}
  start.disabled=true; log.textContent=''; let ok=0,skip=0,fail=0;
  for(let i=0;i<files.length;i++){
    const f=files[i], path=f.webkitRelativePath||f.name;
    if(shouldSkip(path)){skip++;continue}
    const id=machineIdFromPath(path), type=typeFromPath(path);
    if(!id){skip++;log.textContent+='IGNORÉ (matériel non reconnu) : '+path+'\n';continue}
    if(type==='agrement'&&!AGREMENT_IDS.has(id)){skip++;log.textContent+='IGNORÉ (agrément non suivi) : '+path+'\n';continue}
    const fd=new FormData(); fd.append('password',password); fd.append('id',id); fd.append('type',type); fd.append('file',f,f.name); fd.append('bulk','1');
    try{const r=await fetch('/admin',{method:'POST',body:fd}); if(r.ok){ok++;log.textContent+='OK : '+path+'\n';}else{fail++;log.textContent+='ERREUR HTTP '+r.status+' : '+path+'\n';}}catch(e){fail++;log.textContent+='ERREUR réseau : '+path+'\n';}
    status.textContent='Import : '+(i+1)+'/'+files.length+' — '+ok+' chargés, '+skip+' ignorés, '+fail+' erreurs';
  }
  status.textContent='Terminé : '+ok+' chargés, '+skip+' ignorés, '+fail+' erreurs.'; start.disabled=false;
});
