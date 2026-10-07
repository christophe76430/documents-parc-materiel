import crypto from 'node:crypto';
import {MACHINES,driverStore,store,DRIVER_CATEGORIES,parseCookies,validToken,makeToken,cookie,TTL,html,esc,getMachineStatuses,sharedDossierStore} from './_shared.mjs';

export const config={path:'/locations-chauffeur'};
const ADMIN_ID='ADMIN';
const ADMIN_COOKIE='PARC_ADMIN';
const DOSSIER_TTL=7*24*60*60*1000;

function adminCookie(){return `${ADMIN_COOKIE}=${makeToken(ADMIN_ID)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL/1000}`}
function isAdmin(req){const c=parseCookies(req);return validToken(c[ADMIN_COOKIE],ADMIN_ID)}
function page(body,title='Dossiers clients'){
 return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — THN</title><link rel="stylesheet" href="/style.css"><style>
body{background:#f7fbff}.rental-wrap{max-width:1250px;margin:24px auto;padding:0 18px}.rental-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:18px}.rental-head h1{margin:0 0 6px}.rental-head p{margin:0;color:#527292}.rental-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.rental-card{background:#fff;border:1px solid #d7e5f2;border-radius:14px;padding:18px;box-shadow:0 5px 18px rgba(20,57,90,.07)}.rental-card h2{margin:0 0 12px;font-size:20px}.choice-list{display:grid;gap:8px;max-height:430px;overflow:auto}.choice{display:flex;gap:10px;align-items:flex-start;border:1px solid #e0ebf4;border-radius:10px;padding:10px 12px;background:#fbfdff}.choice:hover{border-color:#aac6e2;background:#f6fbff}.choice input{width:auto;margin-top:4px}.choice-main{display:flex;flex-direction:column;min-width:0}.choice-main strong{overflow:hidden;text-overflow:ellipsis}.choice-main small{color:#66829e}.doc-section{margin-top:12px}.doc-section h3{font-size:15px;margin:12px 0 8px;color:#254f78}.doc-list{display:grid;gap:6px}.doc-option{display:flex;gap:8px;align-items:flex-start;border:1px solid #e5edf4;border-radius:8px;padding:8px 10px}.doc-option input{width:auto;margin-top:3px}.doc-option span{display:flex;flex-direction:column}.doc-option small{color:#69839d}.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:16px}.primary{background:#075fb4;color:#fff}.secondary{background:#edf5fc;color:#1559a3;border:1px solid #c8d9e9}.notice{padding:12px 14px;border-radius:10px;background:#fff8e8;border:1px solid #f3d18a;color:#855600}.success{padding:16px;border-radius:12px;background:#edf9f0;border:1px solid #b8dfc1;color:#17652a}.share-url{display:flex;gap:8px}.share-url input{flex:1}.muted{color:#667f97}.tiny{font-size:12px}.@media(max-width:850px){.rental-grid{grid-template-columns:1fr}.meta-grid{grid-template-columns:1fr}.rental-head{display:block}}
.choice-tabs{display:flex;gap:8px;margin:0 0 12px}.type-tab{flex:1;border:1px solid #c9dbea;background:#f6faff;color:#185c9e;border-radius:10px;padding:10px 12px;font-weight:700;cursor:pointer}.type-tab.active{background:#075fb4;color:#fff;border-color:#075fb4}.type-tab:hover{border-color:#8eb2d5}</style></head><body><main class="rental-wrap">${body}<footer class="site-footer"><div>THN — Dossiers clients</div><div>Version <strong>V124</strong></div></footer></main></body></html>`);
}
function loginPage(error=''){return page(`<div class="rental-head"><div><p><a href="/">← Accueil</a></p><h1>📁 Dossiers clients</h1><p>Préparez les documents du personnel et des machines à transmettre au client.</p></div></div><div class="rental-card"><h2>🔐 Accès administration</h2>${error?`<p class="bad">${esc(error)}</p>`:''}<form method="post"><input type="hidden" name="action" value="login"><label>Mot de passe administrateur</label><input type="password" name="password" required autocomplete="current-password"><button class="primary">Accéder</button></form></div>`)}
async function listDrivers(){const {blobs}=await driverStore().list({prefix:'driver/'});const ds=await Promise.all(blobs.filter(b=>b.key.endsWith('.json')).map(async b=>driverStore().get(b.key,{type:'json'}).catch(()=>null)));return ds.filter(d=>d&&d.enabled!==false).sort((a,b)=>String(a.name).localeCompare(String(b.name),'fr'))}
async function loadMachineDocs(id){const {blobs}=await store().list({prefix:`${id}/`});const out=await Promise.all(blobs.map(async b=>{const p=b.key.split('/');const type=p[1]||'document';const name=p.slice(2).join('/')||p[p.length-1];const md=await store().getMetadata(b.key).catch(()=>null);return {kind:'machine',key:b.key,name,label:md?.metadata?.label||name,expiry:md?.metadata?.expiry||'',type,machineName:MACHINES[id]?.name||id}}));return out.sort((a,b)=>`${a.type} ${a.label}`.localeCompare(`${b.type} ${b.label}`,'fr'))}
async function loadDriverDocs(id){const {blobs}=await driverStore().list({prefix:`docs/${id}/`});const out=await Promise.all(blobs.map(async b=>{const p=b.key.split('/');const cat=p[2]||'divers';const name=p.slice(3).join('/')||p[p.length-1];const md=await driverStore().getMetadata(b.key).catch(()=>null);return {kind:'driver',key:b.key,name,label:md?.metadata?.label||DRIVER_CATEGORIES[cat]?.label||cat,expiry:md?.metadata?.expiry||'',category:cat,type:cat}}));return out.sort((a,b)=>`${a.category} ${a.label}`.localeCompare(`${b.category} ${b.label}`,'fr'))}
function escAttr(s){return esc(s).replace(/\n/g,' ')}
async function formPage(req,message=''){
 const drivers=await listDrivers(); const statuses=await getMachineStatuses(); const machines=Object.values(MACHINES).filter(m=>statuses[m.id]!==false).sort((a,b)=>`${a.group} ${a.name}`.localeCompare(`${b.group} ${b.name}`,'fr'));
 const camions=machines.filter(m=>m.group==='camions');
 const pelles=machines.filter(m=>m.group==='pelles');
 const PELLES_RR_IDS=new Set(['P16','P17','P18','P19','P20','P21','P24','P25']);
 const RR_TRAILER_IDS=new Set(['RRA319','RRA034','RRA035','RRA318','RRAT064','RRAT089']);
 const pellesRR=pelles.filter(m=>PELLES_RR_IDS.has(String(m.id)));
 const PELLES_TP_IDS=new Set(['P03','P10','P11','P12','P23']);
 const pellesTP=pelles.filter(m=>PELLES_TP_IDS.has(String(m.id)));
 const rrTrailers=pelles.filter(m=>RR_TRAILER_IDS.has(String(m.id))); 
 const truckOpts=camions.map(m=>`<option value="${escAttr(m.id)}">${esc(m.name)} (${esc(m.id)})</option>`).join('');
 const rrOpts=pellesRR.map(m=>`<option value="${escAttr(m.id)}">${esc(m.name)} (${esc(m.id)})</option>`).join('');
 const tpOpts=pellesTP.map(m=>`<option value="${escAttr(m.id)}">${esc(m.name)} (${esc(m.id)})</option>`).join('');
 const rrTrailerOpts=rrTrailers.map(m=>`<option value="${escAttr(m.id)}">${esc(m.name)} (${esc(m.id)})</option>`).join('');
 const driverOpts=drivers.map(d=>`<option value="${escAttr(d.id)}">${esc(d.name)}</option>`).join('');
 return page(`<div class="rental-head"><div><p><a href="/">← Accueil</a></p><h1>📁 Dossiers clients</h1><p>Sélectionnez un camion ou une pelle rail-route (les remorques RR sont regroupées avec les pelles RR), puis le chauffeur affecté. Les documents sélectionnés pourront être transmis au client via un lien sécurisé.</p></div></div>${message?`<div class="success">${message}</div>`:''}<form method="post" id="rentalForm" autocomplete="off"><input type="hidden" name="action" value="prepare"><div class="rental-grid"><section class="rental-card"><h2>1. Matériel loué</h2><div class="choice-tabs"><button type="button" class="type-tab active" data-type="rr" id="tab-rr">🚜 Pelles RR + remorques RR</button><button type="button" class="type-tab" data-type="tp" id="tab-tp">🚜 Pelles TP</button><button type="button" class="type-tab" data-type="truck" id="tab-truck">🚛 Camions</button></div><div id="machineChooser"><label for="machineId">Pelle RR</label><select name="machineId" id="machineId" required><option value="">Choisir...</option>${rrOpts}</select></div><div id="rrTrailerBox" style="display:none;margin-top:12px;padding:14px;border:1px solid #cfe0ef;border-radius:12px;background:#f8fbff"><div style="font-weight:800;color:#254f78;margin-bottom:7px">🛞 Remorque RR — dans la rubrique Pelles RR</div><label for="trailerId" style="font-size:13px;color:#527292">Remorque RR associée (facultatif)</label><select name="trailerId" id="trailerId"><option value="">Aucune remorque RR</option>${rrTrailerOpts}</select><p class="muted tiny" style="margin:7px 0 0">Les remorques RR sont disponibles ici uniquement pour compléter le dossier d'une pelle RR. Elles restent bien présentes dans <strong>Matériel rail-route</strong> du menu principal.</p><div id="trailerDocs" class="doc-section"></div></div><div id="machineDocs" class="doc-section"><p class="muted">Choisissez un matériel pour afficher ses documents.</p></div></section><section class="rental-card"><h2>2. Chauffeur</h2><label>Salarié / chauffeur</label><select name="driverId" id="driverId" required><option value="">Choisir...</option>${driverOpts}</select><div id="driverDocs" class="doc-section"><p class="muted">Choisissez un chauffeur pour afficher ses documents.</p></div></section><section class="rental-card" style="grid-column:1/-1"><h2>3. Informations client</h2><div class="meta-grid"><div><label>Client</label><input name="clientName" required placeholder="Nom du client"></div><div><label>Chantier / affaire</label><input name="siteName" placeholder="Nom du chantier"></div><div><label>Date de début</label><input name="startDate" type="date"></div><div><label>Date de fin</label><input name="endDate" type="date"></div></div><div class="notice" style="margin-top:12px">Les documents de santé / aptitude du salarié sont décochés par défaut. Ne les incluez que si cela est nécessaire et approprié.</div><div class="actions"><button class="primary" type="submit">📁 Créer le dossier client</button><a class="secondary" href="/">Retour à l'accueil</a></div></section></div></form><script>
const esc=(s)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function loadDocs(id,kind){const r=await fetch('/locations-chauffeur?docs=1&kind='+encodeURIComponent(kind)+'&id='+encodeURIComponent(id));const d=await r.json();return d.docs||[]}
function normalizeText(s){return String(s??'').toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function defaultDriverChecked(d){
  if(String(d.category||'').toLowerCase()==='divers') return false;
  const hay=normalizeText([d.name,d.label,d.category,d.type].join(' '));
  if(d.category==='formation' && /\bcaces\b/.test(hay)) return true;
  if(d.category==='identite' && /(piece[\s_-]*identite|carte[\s_-]*identite|cni|passeport)/.test(hay)) return true;
  if(/autorisation[\s_-]*de[\s_-]*conduite/.test(hay)) return true;
  if(d.category==='permis' && /permis[\s_-]*(de[\s_-]*)?conduire|\bpermis\b/.test(hay)) return true;
  return false;
}
function defaultMachineChecked(d,machineId){
  const id=String(machineId||'').toUpperCase();
  const name=normalizeText(d.machineName||'');
  const isPelle=id.startsWith('P') && /\bpelle\b/.test(name);
  return isPelle && ['vgp','agrement','shunt'].includes(String(d.type||''));
}
function renderDocs(root,docs,prefix,contextId=''){
  if(!docs.length){root.innerHTML='<p class="muted">Aucun document disponible.</p>';return}
  const grouped={};
  for(const d of docs){const key=d.category||d.type||'documents';(grouped[key]??=[]).push(d)}
  let html='';
  for(const [group,list] of Object.entries(grouped)){
    html+='<div class="doc-section"><h3>'+esc(group)+'</h3><div class="doc-list">'+list.map(d=>{
      const checked=prefix==='driver'?defaultDriverChecked(d):defaultMachineChecked(d,contextId);
      return '<label class="doc-option"><input type="checkbox" name="'+(prefix==='trailer'?'trailerDoc':'machineDoc')+'" value="'+esc(d.key)+'" '+(checked?'checked':'')+'><span><strong>'+esc(d.label||d.name)+'</strong><small>'+esc(d.name)+(d.expiry?' — échéance '+esc(d.expiry):'')+'</small></span></label>';
    }).join('')+'</div></div>';
  }
  root.innerHTML=html;
}
const rrOptions=${JSON.stringify(rrOpts)};
const tpOptions=${JSON.stringify(tpOpts)};
const truckOptions=${JSON.stringify(truckOpts)};
const tabs=[document.getElementById('tab-rr'),document.getElementById('tab-tp'),document.getElementById('tab-truck')];
function setMachineType(type){tabs.forEach(t=>t.classList.toggle('active',t.dataset.type===type));const wrap=document.getElementById('machineChooser');wrap.querySelector('label').textContent=type==='rr'?'Pelle rail-route':(type==='tp'?'Pelle TP':'Camion');const sel=document.getElementById('machineId');const opts=type==='rr'?rrOptions:(type==='tp'?tpOptions:truckOptions);sel.innerHTML='<option value="">Choisir...</option>'+opts;document.getElementById('rrTrailerBox').style.display=type==='rr'?'block':'none';document.getElementById('trailerDocs').innerHTML='';document.getElementById('machineDocs').innerHTML='<p class="muted">Choisissez un matériel pour afficher ses documents.</p>'; }
tabs.forEach(t=>t.addEventListener('click',()=>setMachineType(t.dataset.type)));
setMachineType('rr');
document.getElementById('machineId').addEventListener('change',async e=>{const id=e.target.value;const root=document.getElementById('machineDocs');root.innerHTML='<p class="muted">Chargement...</p>';if(!id){root.innerHTML='<p class="muted">Choisissez un matériel pour afficher ses documents.</p>';return}try{renderDocs(root,await loadDocs(id,'machine'),'machine',id)}catch{root.innerHTML='<p class="bad">Impossible de charger les documents du matériel.</p>'}});
document.getElementById('trailerId').addEventListener('change',async e=>{const id=e.target.value;const root=document.getElementById('trailerDocs');root.innerHTML='';if(!id)return;try{renderDocs(root,await loadDocs(id,'machine'),'trailer',id)}catch{root.innerHTML='<p class="bad">Impossible de charger les documents de la remorque.</p>'}});
document.getElementById('driverId').addEventListener('change',async e=>{const id=e.target.value;const root=document.getElementById('driverDocs');root.innerHTML='<p class="muted">Chargement...</p>';if(!id){root.innerHTML='<p class="muted">Choisissez un chauffeur pour afficher ses documents.</p>';return}try{renderDocs(root,await loadDocs(id,'driver'),'driver',id)}catch{root.innerHTML='<p class="bad">Impossible de charger les documents du chauffeur.</p>'}});
</script>`);
}
async function docsJson(req){const url=new URL(req.url);const id=String(url.searchParams.get('id')||'');const kind=String(url.searchParams.get('kind')||'');if(!isAdmin(req)) return new Response(JSON.stringify({error:'forbidden'}),{status:403,headers:{'Content-Type':'application/json'}});let docs=[];if(kind==='machine'&&MACHINES[id]) docs=await loadMachineDocs(id); if(kind==='driver'){const ds=await listDrivers();if(ds.some(d=>d.id===id)) docs=await loadDriverDocs(id)} return new Response(JSON.stringify({docs}),{headers:{'Content-Type':'application/json'}})}
function safeSlug(s){return String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80)||'dossier'}
export default async req=>{
 if(new URL(req.url).searchParams.get('docs')==='1') return docsJson(req);
 if(req.method==='POST'){
  const fd=await req.formData(); const action=String(fd.get('action')||'');
  if(action==='login'){const password=String(fd.get('password')||''); if(password!==(process.env.PARC_PASSWORD||'')) return loginPage('Mot de passe incorrect.'); return new Response('',{status:303,headers:{Location:'/locations-chauffeur','Set-Cookie':adminCookie()}})}
  if(action==='prepare'){
   if(!isAdmin(req)) return loginPage('Session administrateur expirée.');
   const machineId=String(fd.get('machineId')||''); const driverId=String(fd.get('driverId')||''); const clientName=String(fd.get('clientName')||'').trim(); const siteName=String(fd.get('siteName')||'').trim(); const startDate=String(fd.get('startDate')||''); const endDate=String(fd.get('endDate')||'');
   if(!MACHINES[machineId]||!driverId||!clientName) return formPage('Veuillez sélectionner le matériel, le chauffeur et le client.');
   const drivers=await listDrivers(); const driver=drivers.find(d=>d.id===driverId); if(!driver) return formPage('Chauffeur introuvable.');
   const machineDocs=await loadMachineDocs(machineId); const trailerId=String(fd.get('trailerId')||''); const trailerDocs=trailerId&&MACHINES[trailerId] ? await loadMachineDocs(trailerId) : []; const driverDocs=await loadDriverDocs(driverId); const allowed=new Map([...machineDocs,...trailerDocs,...driverDocs].map(d=>[`${d.kind}:${d.key}`,d]));
   const selectedKeys=[...fd.getAll('machineDoc').map(v=>`machine:${String(v)}`),...fd.getAll('trailerDoc').map(v=>`machine:${String(v)}`),...fd.getAll('driverDoc').map(v=>`driver:${String(v)}`)];
   const selected=selectedKeys.map(k=>allowed.get(k)).filter(Boolean);
   if(!selected.length) return formPage('Sélectionnez au moins un document à transmettre.');
   const token=crypto.randomBytes(24).toString('base64url'); const createdAt=new Date().toISOString(); const expiresAt=new Date(Date.now()+DOSSIER_TTL).toISOString();
   const manifest={token,createdAt,expiresAt,clientName,siteName,startDate,endDate,machine:{id:machineId,name:MACHINES[machineId].name,group:MACHINES[machineId].group},trailer:trailerId&&MACHINES[trailerId]?{id:trailerId,name:MACHINES[trailerId].name}:null,driver:{id:driver.id,name:driver.name},documents:selected.map(d=>({kind:d.kind,key:d.key,name:d.name,label:d.label,expiry:d.expiry,category:d.category||d.type||''}))};
   await sharedDossierStore().set(`dossier/${token}.json`,JSON.stringify(manifest),{metadata:{type:'client-dossier',client:clientName,machineId,driverId,expiresAt}});
   const origin=new URL(req.url).origin; const share=`${origin}/dossier-client/${token}`; const link=esc(share); const rows=manifest.documents.map(d=>`<li><strong>${esc(d.label)}</strong> <span class="tiny">${esc(d.name)}</span></li>`).join('');
   return page(`<div class="rental-head"><div><p><a href="/locations-chauffeur">← Nouvelle location</a></p><h1>✅ Dossier client créé</h1><p>Le lien ci-dessous reste valable 7 jours.</p></div></div><div class="success"><h2 style="margin-top:0">${esc(clientName)}</h2><p><strong>Matériel :</strong> ${esc(manifest.machine.name)}${manifest.trailer?` &nbsp; | &nbsp; <strong>Remorque RR :</strong> ${esc(manifest.trailer.name)}`:''} &nbsp; | &nbsp; <strong>Chauffeur :</strong> ${esc(manifest.driver.name)}</p>${siteName?`<p><strong>Chantier :</strong> ${esc(siteName)}</p>`:''}<p><strong>Documents :</strong> ${manifest.documents.length}</p><div class="share-url"><input id="share" value="${link}" readonly><button type="button" class="secondary" id="copy">Copier le lien</button></div><p class="tiny">Expiration : ${new Date(expiresAt).toLocaleDateString('fr-FR')} à ${new Date(expiresAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</p></div><div class="rental-card"><h2>Documents transmis</h2><ul>${rows}</ul><div class="actions"><a class="secondary" href="${esc(share)}" target="_blank">Ouvrir le dossier client</a><a class="secondary" href="/">Retour accueil</a></div></div><script>document.getElementById('copy')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(document.getElementById('share').value);document.getElementById('copy').textContent='Copié ✓'}catch{document.getElementById('share').select();document.execCommand('copy');document.getElementById('copy').textContent='Copié ✓'}})</script>`);
  }
 }
 if(!isAdmin(req)) return loginPage();
 return formPage(req);
};
