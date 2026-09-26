import {MACHINES,TYPES,store,status,json,getMachineStatuses,getExtinguisherDates,hasExtinguisher,expectedTypes} from './_shared.mjs';
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

function extinguisherDate(expiry){
  const m=String(expiry||'').match(/^(\d{4})-(\d{2})$/);
  if(!m)return null;
  const year=Number(m[1]), month=Number(m[2]);
  if(month<1||month>12)return null;
  return new Date(year,month,0,23,59,59);
}

export default async()=>{
  // Charger en parallèle les trois sources principales pour réduire le temps d'attente initial.
  const [active, listResult, extinguisherDates] = await Promise.all([
    getMachineStatuses(),
    store().list({prefix:''}),
    getExtinguisherDates()
  ]);
  const {blobs} = listResult;
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
  for(const [id,expiry] of Object.entries(extinguisherDates)){
    if(active[id]===false || !hasExtinguisher(id)) continue;
    const date=extinguisherDate(expiry);
    if(!date) continue;
    const days=Math.ceil((date-new Date())/86400000);
    const s=dashboardStatus(days);
    const m=String(expiry).match(/^(\d{4})-(\d{2})$/);
    rows.push({
      id,
      name:MACHINES[id].name,
      category:MACHINES[id].group==='pelles'?'Matériel rail-route':'Camion',
      label:`Extincteur`,
      equipmentType:MACHINES[id].group==='pelles'?'Pelle rail-route':'Camion',
      expiry:m?`${m[2]}/${m[1]}`:'',
      days,
      status:s,
      priority:priority(s),
      priorityLabel:s.label,
      kind:'extinguisher'
    });
  }
  const all=rows.filter(Boolean);

  // Ajouter dans la zone des échéances dépassées les échéances obligatoires
  // dont le document ou la date n'est pas renseigné. Elles ne sont pas comptées
  // comme des échéances réellement dépassées : leur statut est "À renseigner".
  const existingByType=new Set(all.map(x=>`${x.id}::${x.type}`));
  const missing=[];
  for(const [id,m] of Object.entries(MACHINES)){
    if(active[id]===false) continue;
    for(const type of expectedTypes(m)){
      if(['carte','barreRouge','divers','doc','devis'].includes(type)) continue;
      if(existingByType.has(`${id}::${type}`)) continue;
      missing.push({
        id,
        name:m.name,
        category:m.group==='pelles'?'Matériel rail-route':m.group==='vehicules'?'Véhicule':'Camion',
        type,
        label:TYPES[type]?.label||type,
        expiry:'',
        days:null,
        status:{class:'neutral',label:'À renseigner'},
        priority:4,
        priorityLabel:'À renseigner',
        kind:'missing'
      });
    }
    if(hasExtinguisher(id) && !extinguisherDates[id]){
      missing.push({
        id,
        name:m.name,
        category:m.group==='pelles'?'Matériel rail-route':'Camion',
        type:'extinguisher',
        label:'Extincteur',
        expiry:'',
        days:null,
        status:{class:'neutral',label:'À renseigner'},
        priority:4,
        priorityLabel:'À renseigner',
        kind:'missing-extinguisher'
      });
    }
  }

  const items=all.filter(x=>x.days>=0).sort((a,b)=>a.priority-b.priority||a.days-b.days||a.name.localeCompare(b.name,'fr'));
  const overdue=[
    ...all.filter(x=>x.days<0).map(x=>({...x,priorityLabel:'Urgent'})),
    ...missing
  ].sort((a,b)=>{
    if(a.kind?.startsWith('missing')!==b.kind?.startsWith('missing')) return a.kind?.startsWith('missing')?1:-1;
    if(a.days==null && b.days!=null) return 1;
    if(a.days!=null && b.days==null) return -1;
    return (a.days??0)-(b.days??0)||a.name.localeCompare(b.name,'fr');
  });
  const allActive=all;
  return json({items,overdue,stats:{total:allActive.length,overdue:all.filter(x=>x.days<0).length,missing:missing.length,within30:allActive.filter(x=>x.days>=0&&x.days<=30).length,valid:allActive.filter(x=>x.days>30).length,extinguisher:allActive.filter(x=>x.kind==='extinguisher').length}},200,{'Cache-Control':'public, max-age=20, stale-while-revalidate=60'});
};
