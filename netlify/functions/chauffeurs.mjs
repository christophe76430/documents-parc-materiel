import {driverStore,DRIVER_CATEGORIES,esc,html,parseCookies,validToken,makeToken,cookie,driverCodeMatches,parseDate,iso} from './_shared.mjs';
export const config={path:'/chauffeurs'};
async function listDrivers(){const {blobs}=await driverStore().list({prefix:'driver/'});const out=[];for(const b of blobs){if(!b.key.endsWith('.json'))continue;const d=await driverStore().get(b.key,{type:'json'}).catch(()=>null);if(d)out.push(d)}return out}
function login(error=''){return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Espace chauffeurs</title><link rel="stylesheet" href="/style.css"></head><body><main><div class="box driver-login"><h1>👷 Espace chauffeurs</h1><p>Entrez votre code personnel pour accéder à votre espace.</p>${error?`<p class="bad">${esc(error)}</p>`:''}<form method="post"><label>Code personnel</label><input name="code" type="password" required><button>Accéder à mon espace</button></form><p><a href="/">← Accueil</a></p></div></main></body></html>`)}
function driverExpiry(name,meta){
  const explicit=String(meta?.metadata?.expiry||'').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const parsed=parseDate(name);
  return parsed ? iso(parsed) : '';
}
function driverDeadlineStatus(expiry){
  if(!expiry) return {class:'muted',label:'Date non renseignée',days:null};
  const d=new Date(expiry+'T23:59:59'), now=new Date();
  if(Number.isNaN(d.getTime())) return {class:'muted',label:'Date non renseignée',days:null};
  const days=Math.ceil((d-now)/86400000);
  if(days<0) return {class:'red',label:'EXPIRÉ',days};
  if(days<=30) return {class:'orange',label:'À renouveler bientôt',days};
  return {class:'green',label:'Valide',days};
}
async function portal(d,headers={}){
  const {blobs}=await driverStore().list({prefix:`docs/${d.id}/`});
  const docs=await Promise.all(blobs.map(async b=>{
    const p=b.key.split('/'),cat=p[2]||'divers',name=p.slice(3).join('/');
    const meta=await driverStore().getMetadata(b.key).catch(()=>null);
    const expiry=driverExpiry(name,meta);
    return {cat,name,label:meta?.metadata?.label||DRIVER_CATEGORIES[cat]?.label||cat,expiry};
  }));
  const sections=Object.entries(DRIVER_CATEGORIES).map(([k,v])=>`<div class="box"><h2>${v.icon} ${v.label}</h2>${docs.filter(x=>x.cat===k).map(x=>`<div class="doc-card"><span>${v.icon} ${esc(x.name)}${x.expiry?`<br><small class="muted">Échéance : ${esc(new Date(x.expiry+'T00:00:00').toLocaleDateString('fr-FR'))}</small>`:''}</span><a href="/driver-document/${encodeURIComponent(d.id)}/${encodeURIComponent(k)}/${encodeURIComponent(x.name)}">Voir</a></div>`).join('')||'<p class="muted">Aucun document.</p>'}</div>`).join('');
  const deadlines=docs.filter(x=>x.expiry).map(x=>{const s=driverDeadlineStatus(x.expiry);return {...x,status:s}}).sort((a,b)=>a.status.days-b.status.days);
  const deadlineRows=deadlines.map(x=>`<tr><td>${esc(x.label)}</td><td>${esc(x.name)}</td><td>${esc(new Date(x.expiry+'T00:00:00').toLocaleDateString('fr-FR'))}</td><td class="${x.status.class}">${x.status.days<0?Math.abs(x.status.days)+' jours de retard':x.status.days+' jours'} — ${x.status.label}</td></tr>`).join('');
  const deadlineBox=`<div class="box"><h2>📅 Échéances</h2>${deadlineRows?`<div class="deadline-scroll-body"><table><thead><tr><th>Rubrique</th><th>Document</th><th>Date d'échéance</th><th>Statut</th></tr></thead><tbody>${deadlineRows}</tbody></table></div>`:'<p class="muted">Aucune échéance renseignée pour vos documents.</p>'}</div>`;
  return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Espace chauffeur — THN</title><link rel="stylesheet" href="/style.css"></head><body><main><div class="box"><p><a href="/">← Accueil</a></p><h1>👷 Bonjour ${esc(d.name)}</h1><p>Votre espace personnel.</p></div>${deadlineBox}${sections}</main></body></html>`,200,headers)
}
export default async req=>{const c=parseCookies(req),drivers=await listDrivers();if(req.method==='POST'){const fd=await req.formData(),code=String(fd.get('code')||'');const d=drivers.find(x=>x.enabled!==false&&driverCodeMatches(code,x.codeHash||x.code));if(!d)return login('Code incorrect.');return portal(d,{'Set-Cookie':cookie('DRIVER_AUTH',makeToken('DRIVER:'+d.id))})}const d=drivers.find(x=>x.enabled!==false&&validToken(c.DRIVER_AUTH,'DRIVER:'+x.id));return d?portal(d):login()};
