import {driverStore,DRIVER_CATEGORIES,esc,html,parseDate,iso} from './_shared.mjs';
export const config={path:'/chauffeurs'};

async function listDrivers(){
  const {blobs}=await driverStore().list({prefix:'driver/'});
  const values=await Promise.all(blobs.filter(b=>b.key.endsWith('.json')).map(b=>driverStore().get(b.key,{type:'json'}).catch(()=>null)));
  return values.filter(d=>d&&d.enabled!==false).sort((a,b)=>String(a.name).localeCompare(String(b.name),'fr'));
}

function driverDate(filename,meta){
  if(meta?.expiry && /^\d{4}-\d{2}-\d{2}$/.test(String(meta.expiry))) return String(meta.expiry);
  const d=parseDate(filename);
  return iso(d);
}

async function driverDeadlines(drivers){
  const rows=[];
  await Promise.all(drivers.map(async d=>{
    const {blobs}=await driverStore().list({prefix:`docs/${d.id}/`});
    await Promise.all(blobs.map(async b=>{
      const p=b.key.split('/');
      const cat=p[2]||'divers';
      const name=p.slice(3).join('/')||p.at(-1)||'';
      const meta=(await driverStore().getMetadata(b.key).catch(()=>null))?.metadata||{};
      const expiry=driverDate(name,meta);
      if(!expiry)return;
      const date=new Date(`${expiry}T23:59:59`);
      if(Number.isNaN(date.getTime()))return;
      const days=Math.ceil((date-Date.now())/86400000);
      rows.push({driver:d.name,driverId:d.id,category:DRIVER_CATEGORIES[cat]?.label||cat,document:name,expiry,days});
    }));
  }));
  return rows.sort((a,b)=>a.days-b.days||a.driver.localeCompare(b.driver,'fr'));
}

function status(days){
  if(days<0)return ['red','EXPIRÉ'];
  if(days<=30)return ['orange','À renouveler bientôt'];
  return ['green','Valide'];
}

export default async()=>{
  try{
    const drivers=await listDrivers();
    const deadlines=await driverDeadlines(drivers);
    const rows=deadlines.map(x=>{const [cls,label]=status(x.days);return `<tr><td><strong>${esc(x.driver)}</strong></td><td>${esc(x.category)}</td><td>${esc(x.document)}</td><td>${new Date(`${x.expiry}T00:00:00`).toLocaleDateString('fr-FR')}</td><td class="days ${cls}">${x.days<0?Math.abs(x.days)+' jours de retard':x.days+' jours'}</td><td><span class="table-status"><span class="dot ${cls}"></span>${label}</span></td></tr>`}).join('');
    const driverCards=drivers.map(d=>`<div class="doc-card"><div><strong>👷 ${esc(d.name)}</strong><br><span class="muted">Accès au profil personnel protégé par mot de passe</span></div><a class="replace" href="/chauffeur/${encodeURIComponent(d.id)}">Voir le profil →</a></div>`).join('');
    return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chauffeurs — THN</title><link rel="stylesheet" href="/style.css"><style>.driver-list{display:grid;gap:8px}.driver-deadline-table{overflow:auto}.driver-deadline-table table{min-width:760px}.days.red{color:#c62828}.days.orange{color:#d47a00}.days.green{color:#16803a}</style></head><body><main>
      <p><a href="/">← Accueil</a></p>
      <div class="box"><h1>👷 Chauffeurs</h1><p class="muted">Liste des chauffeurs et suivi des échéances de leurs documents.</p></div>
      <div class="box"><h2>Liste des chauffeurs</h2><div class="driver-list">${driverCards||'<p class="muted">Aucun chauffeur enregistré.</p>'}</div></div>
      <div class="box"><h2>📅 Échéances des chauffeurs</h2><p class="muted">Les échéances sont classées de la plus urgente à la plus éloignée. Les documents sans date d’échéance ne figurent pas dans ce tableau.</p><div class="driver-deadline-table">${rows?`<table><thead><tr><th>Chauffeur</th><th>Rubrique</th><th>Document</th><th>Échéance</th><th>Délai</th><th>Statut</th></tr></thead><tbody>${rows}</tbody></table>`:'<p class="muted">Aucune échéance renseignée pour le moment.</p>'}</div></div>
      </main></body></html>`);
  }catch(e){return html(`<main><div class="box"><p class="bad">Impossible de charger les chauffeurs.</p></div></main>`,500)}
};
