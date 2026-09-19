import { MACHINES,TYPES,expectedTypes,store,parseCookies,validToken,cookie,html,esc,alertState,iso } from './_shared.mjs';

export const config={path:'/machine/:id'};

function page(m,content){return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.name)}</title><link rel="stylesheet" href="/style.css"></head><body><main><h1>🏗️ ${esc(m.name)}</h1>${content}</main></body></html>`}
function login(m){return page(m,`<div class="box"><label>Mot de passe :</label><form method="post"><input name="password" type="password" autocomplete="current-password" required><button>Accéder aux documents</button></form></div>`)}
function docs(m,items){
  const by={}; for(const t of expectedTypes(m)) by[t]=[]; for(const x of items){if(by[x.type])by[x.type].push(x)}
  let s='<h2>Documents</h2>';
  for(const t of expectedTypes(m)){const meta=TYPES[t], list=by[t]||[];s+=`<section><h3>${meta.label}</h3>`;if(!list.length)s+='<p class="muted">Document non chargé.</p>';for(const x of list){const a=alertState(x.expiry,t);s+=`<div class="doc"><a href="/document/${m.id}/${x.key.startsWith(m.id+'/') && x.key.split('/').length===2 ? 'legacy' : t}/${encodeURIComponent(x.key.split('/').pop())}">${esc(x.label||x.key)}</a>${x.expiry?` — <span class="${a.state}">${a.text} (${new Date(x.expiry+'T00:00:00').toLocaleDateString('fr-FR')})</span>`:''}</div>`}s+='</section>'}
  return s+`<p class="muted">Accès valable 8 heures sur cet équipement.</p>`;
}
export default async (req,context)=>{
 const id=String(context.params?.id||'').toUpperCase(); const m=MACHINES[id]; if(!m)return html('<h1>Matériel introuvable</h1>',404);
 const cookies=parseCookies(req); if(validToken(cookies.PARC_AUTH,id)){
   const {blobs}=await store().list({prefix:`${id}/`});
   const items=await Promise.all(blobs.map(async b=>{const parts=b.key.split('/');let type=parts[1],label=parts[2]||b.key,expiry=''; try{const meta=await store().getMetadata(b.key);expiry=meta?.metadata?.expiry||'';type=meta?.metadata?.type||type;label=meta?.metadata?.label||label;}catch{} return {key:b.key,type,label,expiry}}));
   const legacyTypes=['carte-grise','assurance','mines','vgp','barre-rouge'];
   if(id==='T01'){ for(const t of legacyTypes){ const key=`${id}/${t}.pdf`; if(!items.some(x=>x.key===key)){ const exists=await store().getMetadata(key); if(exists) items.push({key,type:t==='carte-grise'?'carte':t==='barre-rouge'?'barreRouge':t,label:t==='carte-grise'?'Carte grise':t==='barre-rouge'?'Barre rouge':t.toUpperCase(),expiry:exists.metadata?.expiry||''}); } } }
   return html(page(m,docs(m,items)),200,{'Set-Cookie':cookie(id)});
 }
 if(req.method==='POST'){
   const fd=await req.formData(); if(String(fd.get('password')||'')===(process.env.PARC_PASSWORD||'')) return html(page(m,docs(m,[])),200,{'Set-Cookie':cookie(id)});
   return html(page(m,`<p class="bad">Mot de passe incorrect.</p>${login(m)}`),401);
 }
 return html(login(m));
};
