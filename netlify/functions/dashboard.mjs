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
  const items=[];
  for(const b of blobs){
    const p=b.key.split('/');
    if(!MACHINES[p[0]])continue;
    const meta=(await store().getMetadata(b.key).catch(()=>null))?.metadata||{};
    const type=meta.type||p[1]||'';
    if(['carte','barreRouge','divers','doc','devis'].includes(type))continue;
    const filename=p[p.length-1]||'';
    const expiry=meta.expiry||parseExpiryFromFilename(filename);
    if(!expiry)continue;
    const days=Math.ceil((new Date(expiry+'T23:59:59')-new Date())/86400000);
    if(days<0||days>30)continue;
    const s=status(expiry);
    const priorityLabel=s.class==='red'?'Priorité haute':s.class==='orange'?'À surveiller':'Échéance à venir';
    items.push({id:p[0],name:MACHINES[p[0]].name,category:MACHINES[p[0]].group==='pelles'?'Matériel rail-route':MACHINES[p[0]].group==='vehicules'?'Véhicule':'Camion',label:TYPES[type]?.label||meta.label||type,expiry:new Date(expiry+'T00:00:00').toLocaleDateString('fr-FR'),days,status:s,priority:priority(s),priorityLabel});
  }
  items.sort((a,b)=>a.priority-b.priority||a.days-b.days||a.name.localeCompare(b.name,'fr'));
  return json({items});
};
