import {MACHINES,TYPES,store,status,json} from './_shared.mjs';
export const config={path:'/api/dashboard'};

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

function priority(s){return s.class==='red'?0:s.class==='orange'?1:s.class==='green'?2:3}

export default async()=>{
  const {blobs}=await store().list({prefix:''});
  const candidates=blobs.filter(b=>MACHINES[b.key.split('/')[0]]);
  const rows=await Promise.all(candidates.map(async b=>{
    const p=b.key.split('/');
    const id=p[0];
    const filename=p[p.length-1]||'';
    const typeFromKey=p[1]||'';
    // First use the date convention in the filename; otherwise read stored metadata.
    let expiry=parseExpiryFromFilename(filename);
    let meta={};
    if(!expiry){
      meta=(await store().getMetadata(b.key).catch(()=>null))?.metadata||{};
      expiry=meta.expiry||'';
    }
    if(!expiry)return null;
    const type=meta.type||typeFromKey;
    if(['carte','barreRouge','divers','doc','devis'].includes(type))return null;
    const date=new Date(`${expiry}T23:59:59`);
    if(Number.isNaN(date.getTime()))return null;
    const days=Math.ceil((date-new Date())/86400000);
    // Accueil: upcoming deadlines within the next 90 days, sorted by urgency.
    if(days<0||days>90)return null;
    const s=status(expiry);
    return {
      id,
      name:MACHINES[id].name,
      category:MACHINES[id].group==='pelles'?'Matériel rail-route':MACHINES[id].group==='vehicules'?'Véhicule':'Camion',
      label:TYPES[type]?.label||meta.label||type,
      expiry:new Date(`${expiry}T00:00:00`).toLocaleDateString('fr-FR'),
      days,
      status:s,
      priority:priority(s),
      priorityLabel:s.class==='red'?'Urgent':s.class==='orange'?'Échéance proche':'Valide'
    };
  }));
  const items=rows.filter(Boolean).sort((a,b)=>a.priority-b.priority||a.days-b.days||a.name.localeCompare(b.name,'fr'));
  return json({items});
};
