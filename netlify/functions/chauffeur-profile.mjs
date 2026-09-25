import {driverStore,DRIVER_CATEGORIES,esc,html,parseCookies,validToken,makeToken,cookie,driverCodeMatches} from './_shared.mjs';
export const config={path:'/chauffeur/:id'};

async function getDriver(id){
  return await driverStore().get(`driver/${id}.json`,{type:'json'}).catch(()=>null);
}

async function login(id,d,error=''){
  return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Profil chauffeur — THN</title><link rel="stylesheet" href="/style.css"></head><body><main><div class="box driver-login"><p><a href="/chauffeurs">← Liste des chauffeurs</a></p><h1>🔐 Profil de ${esc(d.name)}</h1><p>Ce profil est protégé. Entrez le mot de passe personnel du chauffeur.</p>${error?`<p class="bad">${esc(error)}</p>`:''}<form method="post"><label>Mot de passe</label><input name="code" type="password" autocomplete="current-password" required><button>Accéder au profil</button></form></div></main></body></html>`)}

async function portal(d,headers={}){
  const {blobs}=await driverStore().list({prefix:`docs/${d.id}/`});
  const docs=await Promise.all(blobs.map(async b=>{
    const p=b.key.split('/');const cat=p[2]||'divers',name=p.slice(3).join('/')||p.at(-1)||'';
    const meta=(await driverStore().getMetadata(b.key).catch(()=>null))?.metadata||{};
    return {cat,name,label:meta.label||DRIVER_CATEGORIES[cat]?.label||cat};
  }));
  const sections=Object.entries(DRIVER_CATEGORIES).map(([k,v])=>`<div class="box"><h2>${v.icon} ${v.label}</h2>${docs.filter(x=>x.cat===k).map(x=>`<div class="doc-card"><span>${v.icon} ${esc(x.name)}</span><a href="/driver-document/${encodeURIComponent(d.id)}/${encodeURIComponent(k)}/${encodeURIComponent(x.name)}">Voir</a></div>`).join('')||'<p class="muted">Aucun document.</p>'}</div>`).join('');
  return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Profil chauffeur — THN</title><link rel="stylesheet" href="/style.css"></head><body><main><div class="box"><p><a href="/chauffeurs">← Liste des chauffeurs</a></p><h1>👷 ${esc(d.name)}</h1><p class="muted">Profil personnel protégé.</p></div>${sections}</main></body></html>`,200,headers);
}

export default async(req,context)=>{
  const id=String(context.params?.id||'');
  const d=await getDriver(id);
  if(!d||d.enabled===false)return html('<main><div class="box"><p class="bad">Chauffeur introuvable.</p><p><a href="/chauffeurs">Retour à la liste</a></p></div></main>',404);
  const c=parseCookies(req);
  if(req.method==='POST'){
    const fd=await req.formData();
    const code=String(fd.get('code')||'');
    if(!driverCodeMatches(code,d.codeHash||d.code))return login(id,d,'Mot de passe incorrect.');
    return portal(d,{'Set-Cookie':cookie('DRIVER_AUTH',makeToken('DRIVER:'+d.id))});
  }
  if(validToken(c.DRIVER_AUTH,'DRIVER:'+d.id))return portal(d);
  return login(id,d);
};
