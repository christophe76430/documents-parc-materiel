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
function employeeHome(drivers){
  const enabled=drivers.filter(d=>d.enabled!==false).sort((a,b)=>String(a.name).localeCompare(String(b.name),'fr'));
  const cards=enabled.map(d=>`<a class="employee-card" href="/chauffeurs?id=${encodeURIComponent(d.id)}"><span class="employee-avatar"><img src="/driver-photo/${encodeURIComponent(d.id)}?v=${encodeURIComponent(d.photoVersion||'1')}" alt="Photo de ${esc(d.name)}"></span><span class="employee-card-main"><strong>${esc(d.name)}</strong><small>Accéder à mon espace</small></span><span class="employee-arrow">→</span></a>`).join('');
  const deadlineRows=enabled.map(d=>{const mv=medicalVisitStatus(d.medicalVisitDate);return `<tr><td><strong>${esc(d.name)}</strong></td><td>Visite médicale</td><td>${esc(formatDate(d.medicalVisitDate))}</td><td><span class="table-status ${mv.class}"><span class="dot ${mv.class}"></span>${esc(mv.label)}</span></td></tr>`}).join('');
  return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Espaces salariés — THN</title><link rel="stylesheet" href="/style.css"></head><body><main><div class="employee-home-head"><div><p><a href="/">← Accueil</a></p><p class="eyebrow">Espace personnel THN</p><h1>Espaces salariés</h1><p class="muted">Choisissez votre nom pour accéder à votre page d’accueil personnelle.</p></div><div class="employee-home-badge">👥 ${enabled.length} salarié${enabled.length>1?'s':''}</div></div><div class="box employee-selection-intro"><h2>👷 Sélectionnez votre profil</h2><p class="muted">Votre code personnel sera demandé après votre sélection. Les informations personnelles détaillées restent accessibles uniquement dans l’espace du salarié.</p></div><div class="employee-list">${cards||'<div class="box"><p class="muted">Aucun salarié disponible.</p></div>'}</div><section class="box employee-all-deadlines"><div class="deadlines-head"><div><h2>📅 Échéances des salariés</h2><p class="muted">Vue d’ensemble des prochaines visites médicales de tous les salariés.</p></div><div class="employee-home-badge">${enabled.filter(d=>d.medicalVisitDate).length} date${enabled.filter(d=>d.medicalVisitDate).length>1?'s':''}</div></div><div class="deadline-fixed-head"><table><thead><tr><th>Salarié</th><th>Échéance</th><th>Date</th><th>Statut</th></tr></thead></table></div><div class="deadline-scroll-body employee-deadline-body"><table><tbody>${deadlineRows||'<tr><td colspan="4" class="muted">Aucune visite médicale renseignée.</td></tr>'}</tbody></table></div></section></main></body></html>`)
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
  const medicalHtml=`<div class="box employee-deadlines"><div class="deadlines-head"><div><h2>📅 Mes échéances</h2><p class="muted">Retrouvez ici les échéances qui vous concernent.</p></div></div><div class="deadline-fixed-head"><table><thead><tr><th>Échéance</th><th>Date</th><th>Statut</th></tr></thead></table></div><div class="deadline-scroll-body employee-deadline-body"><table><tbody><tr><td><strong>Visite médicale</strong></td><td>${esc(formatDate(d.medicalVisitDate))}</td><td><span class="table-status ${mv.class}"><span class="dot ${mv.class}"></span>${esc(mv.label)}</span></td></tr></tbody></table></div></div>`;
  const summaryLabel=d.medicalVisitDate?formatDate(d.medicalVisitDate):'À renseigner';
  const summaryClass=d.medicalVisitDate?mv.class:'neutral';
  const summaryText=d.medicalVisitDate?mv.label:'Aucune date enregistrée';
  const dashboard=`<section class="employee-dashboard"><div class="employee-welcome"><div><p class="eyebrow">Ma page d’accueil</p><h1>Bonjour ${esc(d.name)}</h1><p class="muted">Voici le résumé de vos informations et de vos échéances.</p></div><a class="employee-change" href="/chauffeurs">Changer de salarié</a></div><div class="employee-summary-title"><h2>📊 Résumé de mes échéances</h2><p class="muted">Les échéances qui vous concernent uniquement.</p></div><div class="employee-summary-grid"><div class="employee-summary-card"><span class="summary-icon">📅</span><div><span>Prochaine visite médicale</span><strong>${esc(summaryLabel)}</strong><small class="${summaryClass}">${esc(summaryText)}</small></div></div><div class="employee-summary-card"><span class="summary-icon">📁</span><div><span>Documents personnels</span><strong>${docs.length}</strong><small>document${docs.length>1?'s':''} disponible${docs.length>1?'s':''}</small></div></div><div class="employee-summary-card"><span class="summary-icon">🎓</span><div><span>Formations</span><strong>${docs.filter(x=>x.cat==='formation').length}</strong><small>document${docs.filter(x=>x.cat==='formation').length>1?'s':''}</small></div></div></div></section>`;
  return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Espace salarié — THN</title><link rel="stylesheet" href="/style.css"></head><body><main>${dashboard}${medicalHtml}${sections}</main></body></html>`,200,headers)
}
export default async req=>{const c=parseCookies(req),drivers=await listDrivers();globalThis.__drivers=drivers;const url=new URL(req.url);const selectedId=String(url.searchParams.get('id')||'');if(req.method==='POST'){const fd=await req.formData(),code=String(fd.get('code')||''),requestedId=String(fd.get('driverId')||'');const d=drivers.find(x=>x.enabled!==false&&(!requestedId||x.id===requestedId)&&driverCodeMatches(code,x.codeHash||x.code));if(!d)return login('Code incorrect.',requestedId);return portal(d,{'Set-Cookie':cookie('DRIVER_AUTH',makeToken('DRIVER:'+d.id))})}if(!selectedId)return employeeHome(drivers);const d=drivers.find(x=>x.enabled!==false&&x.id===selectedId&&validToken(c.DRIVER_AUTH,'DRIVER:'+x.id));if(d)return portal(d);return login('',selectedId)};
