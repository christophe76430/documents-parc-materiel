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

function parseExpiryFromFilename(filename){
  const s=String(filename||'').replace(/_/g,' ');
  const m=s.match(/\b(0?[1-9]|[12]\d|3[01])[\s.-]+(0?[1-9]|1[0-2])[\s.-]+(\d{2})\b/);
  if(!m)return '';
  const day=Number(m[1]), month=Number(m[2]), yy=Number(m[3]);
  const year=yy<=69?2000+yy:1900+yy;
  const d=new Date(year,month-1,day);
  if(d.getFullYear()!==year||d.getMonth()!==month-1||d.getDate()!==day)return '';
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function formatDateFR(value){
  if(!value)return '';
  const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m)return `${m[3]} ${m[2]} ${m[1].slice(-2)}`;
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  return `${String(d.getDate()).padStart(2,'0')} ${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getFullYear()).slice(-2)}`;
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
      const hasExpiryType=!NO_EXPIRY.has(t);
      const missingText=hasExpiryType?'Pas de document':'Document non chargé';
      out+=`<div class="doc-row doc-row-missing">${docIcon(t)}<div class="doc-main">${dot('none')}<span class="${hasExpiryType?'doc-missing-expiry':''}">${esc(missingText)}</span></div></div>`;
      continue;
    }

    for(const x of list){
      const filename=x.key.split('/').pop();
      const name=encodeURIComponent(filename);
      const legacy=x.key.split('/').length===2?'legacy':t;
      const expiry=x.expiry||parseExpiryFromFilename(filename);
      const a=alertState(expiry,t);
      const hasExpiryType=!NO_EXPIRY.has(t);
      const state=hasExpiryType ? (expiry ? a.state : 'bad') : 'ok';
      const detail= t==='carte'
        ? ''
        : hasExpiryType
          ? (expiry
              ? `<span class="doc-detail ${a.state}">Échéance : ${esc(formatDateFR(expiry))}</span>`
              : `<span class="doc-detail red">Échéance non renseignée</span>`)
          : `<span class="doc-file">${esc(filename)}</span>`;
      out+=`<div class="doc-row">
        ${docIcon(t)}
        <div class="doc-main">${dot(state)}<div><span class="doc-title">${esc(meta.label)}</span>${detail}</div></div>
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
