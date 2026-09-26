import {driverStore,DRIVER_CATEGORIES,esc,html,parseCookies,validToken,makeToken,cookie,driverCodeMatches,hashSecret} from './_shared.mjs';
export const config={path:'/chauffeurs'};
async function listDrivers(){const {blobs}=await driverStore().list({prefix:'driver/'});const out=[];for(const b of blobs){if(!b.key.endsWith('.json'))continue;const d=await driverStore().get(b.key,{type:'json'}).catch(()=>null);if(d)out.push(d)}return out}
function login(error=''){return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Espace chauffeurs</title><link rel="stylesheet" href="/style.css"></head><body><main><div class="box driver-login"><h1>👷 Espace chauffeurs</h1><p>Entrez votre code personnel pour accéder à votre espace.</p>${error?`<p class="bad">${esc(error)}</p>`:''}<form method="post"><label>Code personnel</label><input name="code" type="password" required><button>Accéder à mon espace</button></form><p><a href="/">← Accueil</a></p></div></main></body></html>`)}
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
  const medicalHtml=`<div class="box employee-deadlines"><div class="deadlines-head"><div><h2>📅 Échéances</h2><p class="muted">Vos prochaines échéances personnelles.</p></div></div><div class="deadline-fixed-head"><table><thead><tr><th>Échéance</th><th>Date</th><th>Statut</th></tr></thead></table></div><div class="deadline-scroll-body"><table><tbody><tr><td><strong>Visite médicale</strong></td><td>${esc(formatDate(d.medicalVisitDate))}</td><td><span class="table-status ${mv.class}"><span class="dot ${mv.class}"></span>${esc(mv.label)}</span></td></tr></tbody></table></div></div>`;
  return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Espace salarié — THN</title><link rel="stylesheet" href="/style.css"></head><body><main><div class="box"><p><a href="/">← Accueil</a></p><h1>👷 Bonjour ${esc(d.name)}</h1><p>Votre espace personnel.</p></div>${medicalHtml}${sections}</main></body></html>`,200,headers)
}
export default async req=>{const c=parseCookies(req),drivers=await listDrivers();if(req.method==='POST'){const fd=await req.formData(),code=String(fd.get('code')||'');const d=drivers.find(x=>x.enabled!==false&&driverCodeMatches(code,x.codeHash||x.code));if(!d)return login('Code incorrect.');return portal(d,{'Set-Cookie':cookie('DRIVER_AUTH',makeToken('DRIVER:'+d.id))})}const d=drivers.find(x=>x.enabled!==false&&validToken(c.DRIVER_AUTH,'DRIVER:'+x.id));return d?portal(d):login()};
