import {MACHINES,TYPES,store,status,esc,html,getMachineStatuses,getExtinguisherDates,hasExtinguisher} from './_shared.mjs';
export const config={path:'/echeances'};

function extinguisherDate(expiry){
  const m=String(expiry||'').match(/^(\d{4})-(\d{2})$/);
  if(!m)return null;
  const year=Number(m[1]), month=Number(m[2]);
  if(month<1||month>12)return null;
  return new Date(year,month,0,23,59,59);
}

function parseExpiryFromFilename(filename){
  const s=String(filename||'').replace(/_/g,' ');
  const m=s.match(/\b(0?[1-9]|[12]\d|3[01])[\s.-]+(0?[1-9]|1[0-2])[\s.-]+(\d{2})\b/);
  if(!m)return '';
  const day=Number(m[1]),month=Number(m[2]),yy=Number(m[3]);
  const year=yy<=69?2000+yy:1900+yy;
  const d=new Date(year,month-1,day);
  if(d.getFullYear()!==year||d.getMonth()!==month-1||d.getDate()!==day)return '';
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

export default async()=>{
  const active=await getMachineStatuses();
  const {blobs}=await store().list({prefix:''});
  const a=[];
  for(const b of blobs){
    const p=b.key.split('/');
    if(!MACHINES[p[0]] || active[p[0]]===false)continue;
    const meta=(await store().getMetadata(b.key).catch(()=>null))?.metadata||{};
    const type=meta.type||p[1]||'';
    if(['carte','barreRouge','divers','doc','devis'].includes(type))continue;
    const filename=p[p.length-1]||'';
    const expiry=parseExpiryFromFilename(filename)||meta.expiry||'';
    if(!expiry)continue;
    const date=new Date(expiry+'T23:59:59');
    if(Number.isNaN(date.getTime()))continue;
    const days=Math.ceil((date-new Date())/86400000);
    if(days<0)continue;
    const s=status(expiry);
    a.push({name:MACHINES[p[0]].name,label:TYPES[type]?.label||meta.label||type,e:expiry,days,status:s});
  }
  const extinguisherDates=await getExtinguisherDates();
  for(const [id,expiry] of Object.entries(extinguisherDates)){
    if(active[id]===false || !hasExtinguisher(id)) continue;
    const date=extinguisherDate(expiry);
    if(!date) continue;
    const days=Math.ceil((date-new Date())/86400000);
    if(days<0)continue;
    const m=String(expiry).match(/^(\d{4})-(\d{2})$/);
    a.push({name:MACHINES[id].name,label:'Extincteur',e:m?`${m[1]}-${m[2]}-01`:'',days,status:status(m?`${m[1]}-${m[2]}-01`:expiry)});
  }
  a.sort((x,y)=>x.days-y.days||x.name.localeCompare(y.name,'fr'));
  return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Échéances — THN</title><link rel="stylesheet" href="/style.css"></head><body><main><p><a href="/">← Accueil</a></p><h1>📅 Échéances à venir</h1><div class="box">${a.map(x=>`<div class="doc-card"><span><b>${esc(x.name)}</b><br>${esc(x.label)} — ${x.label==='Extincteur'?new Date(x.e+'T00:00:00').toLocaleDateString('fr-FR',{month:'2-digit',year:'numeric'}):new Date(x.e+'T00:00:00').toLocaleDateString('fr-FR')}</span><span class="${x.status.class}">${x.days+' jours'} — ${x.status.label}</span></div>`).join('')||'<p>Aucune échéance à venir.</p>'}</div></main></body></html>`)
};
