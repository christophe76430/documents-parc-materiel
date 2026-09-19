import { MACHINES,TYPES,store,html,esc,parseDate,iso } from './_shared.mjs';
export const config={path:'/admin'};
function shell(body){return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Administration</title><link rel="stylesheet" href="/style.css"></head><body><main><h1>Administration parc matériel</h1>${body}</main></body></html>`}
export default async(req)=>{
 if(req.method==='GET')return html(shell(`<div class="box"><form method="post" enctype="multipart/form-data"><label>Mot de passe administrateur</label><input type="password" name="password" required><label>Matériel</label><select name="id">${Object.values(MACHINES).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select><label>Type</label><select name="type">${Object.entries(TYPES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select><label>Date d'expiration (facultatif)</label><input type="date" name="expiry"><label>PDF</label><input type="file" name="file" accept="application/pdf,.pdf" required><button>Charger le document</button></form></div>`));
 const fd=await req.formData(); if(String(fd.get('password')||'')!==(process.env.PARC_PASSWORD||''))return html(shell('<p class="bad">Mot de passe incorrect.</p>'),401);
 const id=String(fd.get('id')||'').toUpperCase(),type=String(fd.get('type')||''),file=fd.get('file'); if(!MACHINES[id]||!TYPES[type]||!(file instanceof File))return html(shell('<p class="bad">Données invalides.</p>'),400);
 let expiry=String(fd.get('expiry')||''); if(!expiry)expiry=iso(parseDate(file.name));
 const key=`${id}/${type}/${file.name.replace(/[\\/]/g,'_')}`; await store().set(key,await file.arrayBuffer(),{metadata:{type,label:file.name,expiry,uploadedAt:new Date().toISOString()}});
 return html(shell(`<p class="ok">Document chargé pour ${esc(MACHINES[id].name)}.</p><p>${esc(file.name)}${expiry?` — expiration ${new Date(expiry+'T00:00:00').toLocaleDateString('fr-FR')}`:' — date à renseigner'}</p><p><a href="/machine/${id}">Voir le matériel</a></p>`));
};
