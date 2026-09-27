import { MACHINES, TYPES, store, driverStore, DRIVER_CATEGORIES, json } from './_shared.mjs';
export const config={path:'/api/search'};
export default async req=>{
  const q=String(new URL(req.url).searchParams.get('q')||'').trim().toLowerCase();
  if(q.length<2)return json({machines:[],documents:[]});
  const machinesOut=Object.values(MACHINES).filter(m=>`${m.id} ${m.name} ${m.group}`.toLowerCase().includes(q)).slice(0,20).map(m=>({id:m.id,name:m.name,group:m.group,url:`/machine/${encodeURIComponent(m.id)}`}));
  const {blobs}=await store().list({prefix:''}); const documents=[];
  const driverMatches=[];
  try{
    const listedDrivers=await driverStore().list({prefix:'driver/'});
    const ds=await Promise.all((listedDrivers.blobs||[]).filter(b=>b.key.endsWith('.json')).map(b=>driverStore().get(b.key,{type:'json'}).catch(()=>null)));
    for(const d of ds.filter(Boolean)){
      const hay=`${d.name||''} salarié employé`.toLowerCase();
      if(hay.includes(q)) driverMatches.push({id:d.id,name:d.name,group:'Salarié',url:`/chauffeurs?id=${encodeURIComponent(d.id)}`});
      if(driverMatches.length>=20) break;
    }
    const driverDocs=[];
    for(const d of ds.filter(Boolean)){
      const {blobs:db}=await driverStore().list({prefix:`docs/${d.id}/`});
      const metas=await Promise.all((db||[]).map(async b=>({b,m:(await driverStore().getMetadata(b.key).catch(()=>null))?.metadata||{}})));
      for(const {b,m} of metas){
        const parts=b.key.split('/'); const cat=parts[2]||'divers'; const file=parts.slice(3).join('/'); const label=m.detail||m.label||DRIVER_CATEGORIES[cat]?.label||cat;
        const hay=`${d.name||''} ${label} ${file}`.toLowerCase();
        if(hay.includes(q)) driverDocs.push({id:d.id,name:d.name,label,file,group:'Salarié',url:`/chauffeurs?id=${encodeURIComponent(d.id)}`});
        if(driverDocs.length>=20) break;
      }
      if(driverDocs.length>=20) break;
    }
    var driverDocuments=driverDocs;
  }catch{ var driverDocuments=[]; } 
  for(const b of blobs){const p=b.key.split('/');const m=MACHINES[p[0]];if(!m)continue;const type=p[1]||'';const label=p.slice(2).join('/')||TYPES[type]?.label||type;const hay=`${m.id} ${m.name} ${label} ${TYPES[type]?.label||type}`.toLowerCase();if(hay.includes(q))documents.push({id:m.id,name:m.name,label:TYPES[type]?.label||type,file:label,url:`/machine/${encodeURIComponent(m.id)}`});if(documents.length>=30)break;}
  return json({machines:machinesOut,drivers:driverMatches,documents:[...documents,...driverDocuments]});
};
