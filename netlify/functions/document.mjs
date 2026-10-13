import { MACHINES,store,parseCookies,validToken,html } from './_shared.mjs';

export const config={path:'/document/:id/:type/:name'};

function normalizeName(value){
  try { return decodeURIComponent(String(value||'')); } catch { return String(value||''); }
}

function safeFileName(value){
  return normalizeName(value).replace(/[\\/]/g,'').trim();
}

async function findKey(id,type,name){
  const wanted=safeFileName(name);
  const exact=`${id}/${type}/${wanted}`;
  const exactData=await store().get(exact,{type:'arrayBuffer'}).catch(()=>null);
  if(exactData) return {key:exact,data:exactData,name:wanted};

  const {blobs}=await store().list({prefix:`${id}/${type}/`});
  for(const b of blobs){
    const candidate=safeFileName(b.key.split('/').pop()||'');
    if(candidate===wanted){
      const data=await store().get(b.key,{type:'arrayBuffer'}).catch(()=>null);
      if(data) return {key:b.key,data,name:candidate};
    }
  }
  return null;
}

export default async(req,context)=>{
  try{
    const id=String(context.params?.id||'').toUpperCase();
    const type=String(context.params?.type||'');
    const name=safeFileName(context.params?.name||'');
    if(!MACHINES[id]) return new Response('Not found',{status:404});

    const c=parseCookies(req);
    if(!validToken(c.PARC_AUTH,id)&&!validToken(c.PARC_ADMIN,'ADMIN')){
      return html('<h1>Accès refusé</h1><p>Veuillez repasser par la page de cet équipement.</p>',403);
    }

    let found=null;
    if(type==='legacy'){
      const key=`${id}/${name}`;
      const data=await store().get(key,{type:'arrayBuffer'}).catch(()=>null);
      if(data) found={key,data,name};
    } else {
      found=await findKey(id,type,name);
    }

    if(!found) return html('<h1>Document introuvable</h1><p>Le fichier demandé n\'a pas été trouvé dans le stockage.</p>',404);

    const safe=found.name;
    const lower=safe.toLowerCase();
    const mime=lower.endsWith('.pdf')?'application/pdf':lower.match(/\.(jpe?g)$/)?'image/jpeg':lower.endsWith('.png')?'image/png':'application/octet-stream';
    return new Response(found.data,{headers:{
      'Content-Type':mime,
      'Content-Disposition':`inline; filename="${safe.replace(/"/g,'')}"`
    }});
  }catch(e){
    console.error('DOCUMENT ERROR',e);
    return html('<h1>Erreur lors de l\'ouverture du document</h1>',500);
  }
};
