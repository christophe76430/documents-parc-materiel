import { archiveStore, parseCookies, validToken, html } from './_shared.mjs';
export const config={path:'/archive'};
export default async req=>{
  const c=parseCookies(req);
  if(!validToken(c.PARC_ADMIN,'ADMIN')) return html('<h1>Accès refusé</h1><p>Cette archive est réservée à l’administration.</p>',403);
  const key=new URL(req.url).searchParams.get('key')||'';
  if(!/^([A-Z0-9]+)\/[^/]+\/\d+_[^/]+$/i.test(key)) return html('<h1>Archive introuvable</h1>',404);
  const data=await archiveStore().get(key,{type:'arrayBuffer',consistency:'strong'}).catch(()=>null);
  if(!data)return html('<h1>Archive introuvable</h1>',404);
  const name=key.split('/').pop().replace(/^\d+_/,'').replace(/"/g,'');
  const lower=name.toLowerCase();
  const mime=lower.endsWith('.pdf')?'application/pdf':lower.match(/\.(jpe?g)$/)?'image/jpeg':lower.endsWith('.png')?'image/png':'application/octet-stream';
  return new Response(data,{headers:{'Content-Type':mime,'Content-Disposition':`inline; filename="${name}"`}});
};
