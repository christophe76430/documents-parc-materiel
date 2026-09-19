import { MACHINES,store,parseCookies,validToken,html,esc } from './_shared.mjs';
export const config={path:'/document/:id/:type/:name'};
export default async (req,context)=>{
 const id=String(context.params?.id||'').toUpperCase(), type=String(context.params?.type||''), name=decodeURIComponent(String(context.params?.name||''));
 if(!MACHINES[id])return new Response('Not found',{status:404});
 const cookies=parseCookies(req); if(!validToken(cookies.PARC_AUTH,id))return html('<h1>Accès refusé</h1><p>Veuillez repasser par la page de cet équipement.</p>',403);
 const safe=name.replace(/[\\/]/g,''); const legacy=(type==='legacy'); const key=legacy?`${id}/${safe}`:`${id}/${type}/${safe}`; const blob=await store().get(key,{type:'arrayBuffer'}); if(!blob)return html('<h1>Document introuvable</h1>',404);
 const mime=safe.toLowerCase().endsWith('.pdf')?'application/pdf':'application/octet-stream'; const filename=safe.replace(/"/g,''); return new Response(blob,{headers:{'Content-Type':mime,'Content-Disposition':`inline; filename="${filename}"`}});
};
