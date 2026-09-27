import { MACHINES, TYPES, store, json } from './_shared.mjs';
export const config={path:'/api/search'};
export default async req=>{
  const q=String(new URL(req.url).searchParams.get('q')||'').trim().toLowerCase();
  if(q.length<2)return json({machines:[],documents:[]});
  const machinesOut=Object.values(MACHINES).filter(m=>`${m.id} ${m.name} ${m.group}`.toLowerCase().includes(q)).slice(0,20).map(m=>({id:m.id,name:m.name,group:m.group,url:`/machine/${encodeURIComponent(m.id)}`}));
  const {blobs}=await store().list({prefix:''}); const documents=[];
  for(const b of blobs){const p=b.key.split('/');const m=MACHINES[p[0]];if(!m)continue;const type=p[1]||'';const label=p.slice(2).join('/')||TYPES[type]?.label||type;const hay=`${m.id} ${m.name} ${label} ${TYPES[type]?.label||type}`.toLowerCase();if(hay.includes(q))documents.push({id:m.id,name:m.name,label:TYPES[type]?.label||type,file:label,url:`/machine/${encodeURIComponent(m.id)}`});if(documents.length>=30)break;}
  return json({machines:machinesOut,documents});
};
