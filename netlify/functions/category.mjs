import machines from '../../machines.json' with {type:'json'};
import {esc,html} from './_shared.mjs';
export const config={path:'/category/:group'};
export default async(req,context)=>{
 const group=String(context.params?.group||'').toLowerCase(); const items=machines[group]; if(!items)return html('<h1>Catégorie introuvable</h1>',404);
 const title={camions:'Camions',pelles:'Pelles et remorques',vehicules:'Véhicules'}[group]||group;
 const list=items.map(([id,name])=>`<a class="machine" href="/machine/${id}">${esc(name)}</a>`).join('');
 return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="/style.css"></head><body><main><h1>🏗️ ${esc(title)}</h1>${list}<p><a href="/">← Retour</a></p></main></body></html>`);
};
