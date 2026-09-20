import { MACHINES,TYPES,expectedTypes,store,parseCookies,validToken,cookie,makeToken,html,esc,alertState } from './_shared.mjs';
import filters from '../../filters.json' with { type:'json' };
export const config={path:'/machine/:id'};
const NO_EXPIRY=new Set(['carte','barreRouge','divers','doc','devis']);

function page(m,body,headers={}){
  return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.name)} — Parc THN</title><link rel="stylesheet" href="/style.css"></head><body><main><p><a href="/">← Accueil</a></p><h1>🏗️ ${esc(m.name)}</h1>${body}</main></body></html>`,200,headers)
}

function login(m,error=''){
  return page(m,`<div class="box"><h2>Accès aux documents</h2>${error?`<p class="bad">${esc(error)}</p>`:''}<form method="post"><label>Mot de passe</label><input type="password" name="password" required autofocus><button>Accéder</button></form></div>`)
}

async function loadItems(id){
  const {blobs}=await store().list({prefix:`${id}/`});
  return Promise.all(blobs.map(async b=>{
    const p=b.key.split('/');
    let type=p[1]||'',label=p.slice(2).join('/')||p[1],expiry='';
    const meta=await store().getMetadata(b.key).catch(()=>null);
    type=meta?.metadata?.type||type;
    label=meta?.metadata?.label||label;
    expiry=meta?.metadata?.expiry||'';
    return {key:b.key,type,label,expiry}
  }))
}

function dot(state){
  return `<span class="status-dot ${state==='ok'?'green':state==='warn'?'orange':state==='bad'?'red':'gray'}" aria-hidden="true"></span>`
}

function docIcon(type){
  const icons={
    carte:'CG',
    assurance:'🛡️',
    mines:'📋',
    vgp:'🏗️',
    ct:'🔧',
    shunt:'⚡',
    agrement:'📜',
    barreRouge:'📕',
    divers:'📄',
    doc:'📄',
    devis:'🧾'
  };
  const value=icons[type]||'📄';
  const cls=type==='carte'?' doc-type-icon-carte':'';
  return `<span class="doc-type-icon${cls}" aria-hidden="true">${value}</span>`;
}

function filterTable(m){
  const data=filters[m.id];
  if(!data)return `<div class="box"><h2>🔧 Filtration</h2><p class="muted">Aucune fiche de filtration documentée pour cet engin dans la source fournie.</p></div>`;
  const rows=(data.filters||[]).map(([a,b])=>`<tr><td>${esc(a)}</td><td><b>${esc(b)}</b></td></tr>`).join('');
  return `<div class="box"><h2>🔧 Filtration</h2><p class="muted">${esc(data.source_label||m.name)}</p><div style="overflow-x:auto"><table class="filter-table"><thead><tr><th>Fonction</th><th>Référence</th></tr></thead><tbody>${rows}</tbody></table></div>${data.adblue?`<p><b>AdBlue :</b> ${esc(data.adblue)}</p>`:''}${data.note?`<p class="muted"><b>⚠️ Remarque :</b> ${esc(data.note)}</p>`:''}</div>`
}

function docs(m,items){
  const by={};
  for(const x of items)(by[x.type]??=[]).push(x);
  const types=[...expectedTypes(m),...Object.keys(by).filter(t=>TYPES[t]&&!expectedTypes(m).includes(t))];

  let out=`<div class="status-legend"><span>${dot('ok')} Document valide</span><span>${dot('warn')} Échéance proche</span><span>${dot('bad')} Échéance très proche ou dépassée</span><span>${dot('none')} Document non chargé</span></div><div class="box"><h2>📄 Documents</h2>`;

  for(const t of types){
    const meta=TYPES[t],list=by[t]||[];
    out+=`<section class="doc-section"><h3>${esc(meta.label)}</h3>`;

    if(!list.length){
      out+=`<div class="doc-row doc-row-missing">${docIcon(t)}<div class="doc-main">${dot('none')}<span>${esc(meta.label)}</span></div></div>`;
      continue;
    }

    for(const x of list){
      const a=alertState(x.expiry,t);
      const name=encodeURIComponent(x.key.split('/').pop());
      const legacy=x.key.split('/').length===2?'legacy':t;
      const state=x.expiry?a.state:'ok';
      out+=`<div class="doc-row">
        ${docIcon(t)}
        <div class="doc-main">${dot(state)}<span class="doc-title">${esc(meta.label)}</span></div>
        <a class="doc-consult" href="/document/${encodeURIComponent(m.id)}/${encodeURIComponent(legacy)}/${name}" target="_blank" rel="noopener">👁️ Consulter</a>
      </div>`;
    }
  }

  return out+'</div>'+filterTable(m)+'<p class="muted">Accès valable 8 heures sur cet équipement.</p>'
}

export default async(req,context)=>{
  const id=String(context.params?.id||'').toUpperCase(),m=MACHINES[id];
  if(!m)return html('<h1>Matériel introuvable</h1>',404);
  const c=parseCookies(req);
  if(validToken(c.PARC_AUTH,id)||validToken(c.PARC_ADMIN,'ADMIN'))return page(m,docs(m,await loadItems(id)),validToken(c.PARC_AUTH,id)?{'Set-Cookie':cookie('PARC_AUTH',makeToken(id))}:{});
  if(req.method==='POST'){
    const fd=await req.formData();
    if(String(fd.get('password')||'')===(process.env.PARC_PASSWORD||''))return page(m,docs(m,await loadItems(id)),{'Set-Cookie':cookie('PARC_AUTH',makeToken(id))});
    return login(m,'Mot de passe incorrect.')
  }
  return login(m)
};
