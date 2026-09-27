import { MACHINES, TYPES, store, driverStore, getMachineStatuses, getExtinguisherDates, archiveStore, parseCookies, validToken, html } from './_shared.mjs';
export const config={path:'/backup'};
const esc=s=>String(s??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
export default async req=>{
  if(!validToken(parseCookies(req).PARC_ADMIN,'ADMIN')) return html('<h1>Accès refusé</h1><p>Sauvegarde réservée à l’administration.</p>',403);
  const [statuses,ext,listed,driversListed,archivesListed]=await Promise.all([getMachineStatuses(),getExtinguisherDates(),store().list({prefix:''}),driverStore().list({prefix:'driver/'}),archiveStore().list({prefix:''})]);
  const docs=await Promise.all((listed.blobs||[]).filter(b=>MACHINES[b.key.split('/')[0]]).map(async b=>{const m=(await store().getMetadata(b.key).catch(()=>null))?.metadata||{}; const p=b.key.split('/'); return {key:b.key,id:p[0],type:m.type||p[1]||'',label:m.label||p.slice(2).join('/'),expiry:m.expiry||'',uploadedAt:m.uploadedAt||''};}));
  const drivers=await Promise.all((driversListed.blobs||[]).filter(b=>b.key.endsWith('.json')).map(async b=>driverStore().get(b.key,{type:'json'}).catch(()=>null)));
  const driverDocs=[];
  for(const d of drivers.filter(Boolean)){const {blobs}=await driverStore().list({prefix:`docs/${d.id}/`}); for(const b of (blobs||[])){const m=(await driverStore().getMetadata(b.key).catch(()=>null))?.metadata||{}; driverDocs.push({driverId:d.id,key:b.key,label:m.label||m.detail||'',expiry:m.expiry||'',uploadedAt:m.uploadedAt||''});}}
  const payload={exportedAt:new Date().toISOString(),version:'V90 TEST',machines:MACHINES,statuses,extinguisherDates:ext,documents:docs,drivers:drivers.filter(Boolean).map(d=>({id:d.id,name:d.name,enabled:d.enabled!==false,medicalVisitDate:d.medicalVisitDate||'',photoVersion:d.photoVersion||''})),driverDocuments,archiveCount:(archivesListed.blobs||[]).length,note:'Inventaire et métadonnées uniquement. Les fichiers binaires ne sont pas inclus dans cet export JSON.'};
  return new Response(JSON.stringify(payload,null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="THN_sauvegarde_inventaire_${new Date().toISOString().slice(0,10)}.json"`}});
};
