import {driverStore,DRIVER_CATEGORIES,esc,html,parseCookies,validToken,makeToken,cookie,driverCodeMatches,hashSecret} from './_shared.mjs';
export const config={path:'/chauffeurs'};
async function listDrivers(){const {blobs}=await driverStore().list({prefix:'driver/'});const out=[];for(const b of blobs){if(!b.key.endsWith('.json'))continue;const d=await driverStore().get(b.key,{type:'json'}).catch(()=>null);if(d)out.push(d)}return out}
function login(error='', selectedId=''){
  const drivers = globalThis.__drivers || [];
  const selected = selectedId ? drivers.find(x=>x.id===selectedId && x.enabled!==false) : null;
  const target = selected ? `<input type="hidden" name="driverId" value="${esc(selected.id)}">` : '';
  const title = selected ? `👷 Accès à l’espace de ${esc(selected.name)}` : '👷 Espace salariés';
  const intro = selected ? 'Entrez votre code personnel pour accéder à votre profil.' : 'Sélectionnez votre profil puis utilisez votre code personnel.';
  return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Espace salariés — THN</title><link rel="stylesheet" href="/style.css"></head><body><main><div class="box driver-login">${selected?`<p><a href="/chauffeurs">← Retour à la liste des salariés</a></p>`:''}<h1>${title}</h1><p>${intro}</p>${error?`<p class="bad">${esc(error)}</p>`:''}<form method="post">${target}<label>Code personnel</label><input name="code" type="password" required autocomplete="current-password"><button>Accéder à mon espace</button></form><p><a href="/">← Accueil</a></p></div></main></body></html>`)
}
async function getDriverPhotoDataUrl(d){
  try{
    const data=await driverStore().get(`photo/${d.id}`,{type:'arrayBuffer'});
    if(!data)return '';
    const meta=await driverStore().getMetadata(`photo/${d.id}`).catch(()=>null);
    const type=meta?.metadata?.contentType||'image/jpeg';
    return `data:${type};base64,${Buffer.from(data).toString('base64')}`;
  }catch{return '';}
}
async function employeeHome(drivers){
  const enabled=drivers.filter(d=>d.enabled!==false).sort((a,b)=>String(a.name).localeCompare(String(b.name),'fr'));
  const photoUrls=await Promise.all(enabled.map(getDriverPhotoDataUrl));
  const cards=enabled.map((d,i)=>{
    const src=photoUrls[i]||`/.netlify/functions/driver-photo?id=${encodeURIComponent(d.id)}&v=${encodeURIComponent(d.photoVersion||'1')}`;
    const initial=esc((d.name||'?').trim().charAt(0).toUpperCase());
    return `<div class="employee-card"><button type="button" class="employee-photo-preview" data-photo="${src}" data-name="${esc(d.name)}" aria-label="Agrandir la photo de ${esc(d.name)}"><span class="employee-avatar"><img src="${src}" alt="Photo de ${esc(d.name)}" onerror="this.style.display='none';this.parentElement.classList.add('avatar-fallback');this.parentElement.textContent='${initial}'"></span></button><a class="employee-card-main" href="/chauffeurs?id=${encodeURIComponent(d.id)}"><strong>${esc(d.name)}</strong><small>Accéder à mon espace</small></a><a class="employee-arrow" href="/chauffeurs?id=${encodeURIComponent(d.id)}" aria-label="Accéder à l’espace de ${esc(d.name)}">→</a></div>`;
  }).join('');
  const rows=[];
  for(const d of enabled){
    const mv=medicalVisitStatus(d.medicalVisitDate);
    if(d.medicalVisitDate) rows.push({name:d.name,type:'Visite médicale',detail:'Visite périodique',date:d.medicalVisitDate,status:mv});
    const {blobs}=await driverStore().list({prefix:`docs/${d.id}/`});
    for(const b of blobs){
      const meta=await driverStore().getMetadata(b.key).catch(()=>null); const m=meta?.metadata||{}; if(!m.expiry) continue;
      const cat=b.key.split('/')[2]||'divers'; const info=medicalVisitStatus(m.expiry);
      const label=m.detail||m.label||DRIVER_CATEGORIES[cat]?.label||cat;
      rows.push({name:d.name,type:DRIVER_CATEGORIES[cat]?.label||'Document',detail:label,date:m.expiry,status:info});
    }
  }
  rows.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const deadlineRows=rows.map(r=>`<tr><td><strong>${esc(r.name)}</strong></td><td>${esc(r.type)}</td><td>${esc(r.detail)}</td><td>${esc(formatDate(r.date))}</td><td><span class="table-status ${r.status.class}"><span class="dot ${r.status.class}"></span>${esc(r.status.label)}</span></td></tr>`).join('');
  return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Espaces salariés — THN</title><link rel="stylesheet" href="/style.css"></head><body><main><div class="employee-overview-grid"><section><div class="employee-home-head"><div><p><a href="/">← Accueil</a></p><h1>Espaces salariés</h1></div></div><div class="employee-list">${cards||'<div class="box"><p class="muted">Aucun salarié disponible.</p></div>'}</div></section><section class="box employee-all-deadlines"><div class="deadlines-head"><div><h2>📅 Échéances des salariés</h2><p class="muted">Visites médicales, formations et autres titres obligatoires</p></div><select class="employee-deadline-filter"><option>Tous les salariés</option>${enabled.map(d=>`<option>${esc(d.name)}</option>`).join('')}</select></div><div class="deadline-fixed-head"><table><thead><tr><th>Nom du salarié</th><th>Type d'échéance</th><th>Détail</th><th>Date d'échéance</th><th>Statut</th></tr></thead></table></div><div class="deadline-scroll-body employee-deadline-body"><table><tbody>${deadlineRows||'<tr><td colspan="5" class="muted">Aucune échéance renseignée.</td></tr>'}</tbody></table></div></section></div><div class="photo-lightbox" id="employeePhotoLightbox" hidden role="dialog" aria-modal="true" aria-label="Photo du salarié"><div class="photo-lightbox-backdrop" data-close-photo></div><div class="photo-lightbox-panel"><button type="button" class="photo-lightbox-close" data-close-photo aria-label="Fermer">×</button><img id="employeePhotoLarge" src="" alt=""><strong id="employeePhotoName"></strong></div></div></main><script>const sel=document.querySelector('.employee-deadline-filter');const body=document.querySelector('.employee-deadline-body tbody');if(sel&&body){const all=[...body.querySelectorAll('tr')];sel.addEventListener('change',()=>{const v=sel.value;all.forEach(r=>{r.style.display=!v||v==='Tous les salariés'||r.cells[0]?.innerText.trim()===v?'':'none';});});}const lightbox=document.getElementById('employeePhotoLightbox'),large=document.getElementById('employeePhotoLarge'),photoName=document.getElementById('employeePhotoName');document.querySelectorAll('.employee-photo-preview').forEach(btn=>btn.addEventListener('click',()=>{const src=btn.dataset.photo;if(!src||btn.querySelector('img')?.style.display==='none')return;large.src=src;large.alt='Photo de '+btn.dataset.name;photoName.textContent=btn.dataset.name;lightbox.hidden=false;document.body.classList.add('photo-modal-open');btn.blur();}));document.querySelectorAll('[data-close-photo]').forEach(el=>el.addEventListener('click',()=>{lightbox.hidden=true;large.src='';document.body.classList.remove('photo-modal-open');}));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!lightbox.hidden){lightbox.hidden=true;large.src='';document.body.classList.remove('photo-modal-open');}});</script></body></html>`)
}
function medicalVisitStatus(date){
  if(!date) return {class:'neutral',label:'Date non renseignée',days:null};
  const d=new Date(`${date}T23:59:59`);
  if(Number.isNaN(d.getTime())) return {class:'neutral',label:'Date non renseignée',days:null};
  const days=Math.ceil((d.getTime()-Date.now())/86400000);
  if(days<0) return {class:'red',label:'En retard',days};
  if(days<=30) return {class:'orange',label:`Dans ${days} jours`,days};
  return {class:'green',label:'À jour',days};
}
function formatDate(date){
  if(!date)return '—';
  const d=new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime())?'—':d.toLocaleDateString('fr-FR');
}
async function portal(d,headers={}){
  const {blobs}=await driverStore().list({prefix:`docs/${d.id}/`});
  const docs=[];
  for(const b of blobs){const p=b.key.split('/');const cat=p[2]||'divers',name=p.slice(3).join('/');const meta=await driverStore().getMetadata(b.key).catch(()=>null);docs.push({cat,name,label:meta?.metadata?.label||DRIVER_CATEGORIES[cat]?.label||cat})}
  const sections=Object.entries(DRIVER_CATEGORIES).map(([k,v])=>`<div class="box"><h2>${v.icon} ${v.label}</h2>${docs.filter(x=>x.cat===k).map(x=>`<div class="doc-card"><span>${v.icon} ${esc(x.name)}</span><a href="/driver-document/${encodeURIComponent(d.id)}/${encodeURIComponent(k)}/${encodeURIComponent(x.name)}">Voir</a></div>`).join('')||'<p class="muted">Aucun document.</p>'}</div>`).join('');
  const mv=medicalVisitStatus(d.medicalVisitDate);
  const personalRows=[]; if(d.medicalVisitDate) personalRows.push({type:'Visite médicale',detail:'Visite périodique',date:d.medicalVisitDate,status:mv}); for(const x of docs){const meta=await driverStore().getMetadata(`docs/${d.id}/${x.cat}/${x.name}`).catch(()=>null);const m=meta?.metadata||{};if(m.expiry) personalRows.push({type:DRIVER_CATEGORIES[x.cat]?.label||'Document',detail:m.detail||m.label||x.label,date:m.expiry,status:medicalVisitStatus(m.expiry)});} personalRows.sort((a,b)=>String(a.date).localeCompare(String(b.date))); const medicalHtml=`<div class="box employee-deadlines"><div class="deadlines-head"><div><h2>📅 Mes échéances</h2><p class="muted">Visites médicales, formations et autres titres obligatoires qui vous concernent.</p></div></div><div class="deadline-fixed-head"><table><thead><tr><th>Type</th><th>Détail</th><th>Date</th><th>Statut</th></tr></thead></table></div><div class="deadline-scroll-body employee-deadline-body"><table><tbody>${personalRows.map(r=>`<tr><td><strong>${esc(r.type)}</strong></td><td>${esc(r.detail)}</td><td>${esc(formatDate(r.date))}</td><td><span class="table-status ${r.status.class}"><span class="dot ${r.status.class}"></span>${esc(r.status.label)}</span></td></tr>`).join('')||'<tr><td colspan="4" class="muted">Aucune échéance renseignée.</td></tr>'}</tbody></table></div></div>`;
  const summaryLabel=d.medicalVisitDate?formatDate(d.medicalVisitDate):'À renseigner';
  const summaryClass=d.medicalVisitDate?mv.class:'neutral';
  const summaryText=d.medicalVisitDate?mv.label:'Aucune date enregistrée';
  const dashboard=`<section class="employee-dashboard"><div class="employee-welcome"><div><p class="eyebrow">Ma page d’accueil</p><h1>Bonjour ${esc(d.name)}</h1><p class="muted">Voici le résumé de vos informations et de vos échéances.</p></div><a class="employee-change" href="/chauffeurs">← Retour à l’accueil des salariés</a></div><div class="employee-summary-title"><h2>📊 Résumé de mes échéances</h2><p class="muted">Les échéances qui vous concernent uniquement.</p></div><div class="employee-summary-grid"><div class="employee-summary-card"><span class="summary-icon">📅</span><div><span>Prochaine visite médicale</span><strong>${esc(summaryLabel)}</strong><small class="${summaryClass}">${esc(summaryText)}</small></div></div><div class="employee-summary-card"><span class="summary-icon">📁</span><div><span>Documents personnels</span><strong>${docs.length}</strong><small>document${docs.length>1?'s':''} disponible${docs.length>1?'s':''}</small></div></div><div class="employee-summary-card"><span class="summary-icon">🎓</span><div><span>Formations</span><strong>${docs.filter(x=>x.cat==='formation').length}</strong><small>document${docs.filter(x=>x.cat==='formation').length>1?'s':''}</small></div></div></div></section>`;
  return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Espace salarié — THN</title><link rel="stylesheet" href="/style.css"></head><body><main>${dashboard}${medicalHtml}${sections}</main></body></html>`,200,headers)
}
export default async req=>{const c=parseCookies(req),drivers=await listDrivers();globalThis.__drivers=drivers;const url=new URL(req.url);const selectedId=String(url.searchParams.get('id')||'');if(req.method==='POST'){const fd=await req.formData(),code=String(fd.get('code')||''),requestedId=String(fd.get('driverId')||'');const d=drivers.find(x=>x.enabled!==false&&(!requestedId||x.id===requestedId)&&driverCodeMatches(code,x.codeHash||x.code));if(!d)return login('Code incorrect.',requestedId);return portal(d,{'Set-Cookie':cookie('DRIVER_AUTH',makeToken('DRIVER:'+d.id))})}if(!selectedId)return employeeHome(drivers);const d=drivers.find(x=>x.enabled!==false&&x.id===selectedId&&validToken(c.DRIVER_AUTH,'DRIVER:'+x.id));if(d)return portal(d);return login('',selectedId)};
