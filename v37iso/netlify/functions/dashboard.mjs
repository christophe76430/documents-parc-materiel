import {MACHINES,TYPES,store,status,json,getMachineStatuses} from './_shared.mjs';
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

function dashboardStatus(days){
  if(days < 0) return {class:'red',label:'Urgent'};
  if(days <= 10) return {class:'red',label:'Urgent'};
  if(days <= 30) return {class:'orange',label:'Échéance proche'};
  return {class:'green',label:'Valide'};
}

function priority(s){return s.class==='red'?0:s.class==='orange'?1:s.class==='green'?2:3}

export default async()=>{
  const active=await getMachineStatuses();
  const {blobs}=await store().list({prefix:''});
  const candidates=blobs.filter(b=>MACHINES[b.key.split('/')[0]]);
  const rows=await Promise.all(candidates.map(async b=>{
    const p=b.key.split('/');
    const id=p[0];
    if(active[id]===false)return null;
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
    const s=dashboardStatus(days);
    // Les échéances futures et dépassées sont conservées pour l'accueil.
    // L'interface les sépare en deux tableaux.

    return {
      id,
      name:MACHINES[id].name,
      category:MACHINES[id].group==='pelles'?'Matériel rail-route':MACHINES[id].group==='vehicules'?'Véhicule':'Camion',
      label:TYPES[type]?.label||meta.label||type,
      expiry:new Date(`${expiry}T00:00:00`).toLocaleDateString('fr-FR'),
      days,
      status:s,
      priority:priority(s),
      priorityLabel:s.label
    };
  }));
  const all=rows.filter(Boolean);
  const items=all.filter(x=>x.days>=0).sort((a,b)=>a.priority-b.priority||a.days-b.days||a.name.localeCompare(b.name,'fr'));
  const overdue=all.filter(x=>x.days<0).sort((a,b)=>a.days-b.days||a.name.localeCompare(b.name,'fr')).map(x=>({...x, priorityLabel:'Urgent'}));
  return json({items,overdue});
};
