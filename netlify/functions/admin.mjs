import { MACHINES,TYPES,store,html,esc,parseDate,iso } from './_shared.mjs';

// Document types without expiry dates or alerts.
const NO_EXPIRY_TYPES = new Set([
  'Carte grise',
  'Barré rouge',
  'Divers',
  'Doc',
  'Devis',
  'carteGrise',
  'barreRouge',
  'divers',
  'doc',
  'devis',
]);

const hasExpiryDate = (type) => !NO_EXPIRY_TYPES.has(String(type || '').trim());

export const config={path:'/admin'};
function shell(body){return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Administration</title><link rel="stylesheet" href="/style.css"></head><body><main><h1>Administration parc matériel</h1>${body}</main></body></html>`}
export default async(req)=>{
 if(req.method==='GET')return html(shell(`<div class="box"><form method="post" enctype="multipart/form-data"><label>Mot de passe administrateur</label><input type="password" name="password" required><label>Matériel</label><select name="id">${Object.values(MACHINES).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select><label>Type</label><select name="type">${Object.entries(TYPES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select><div id="expiry-wrap"><label>Date d'expiration</label><input type="date" name="expiry"></div><script>const noExpiry=new Set(${JSON.stringify([...NO_EXPIRY_TYPES])});const type=document.querySelector('[name=type]');const wrap=document.getElementById('expiry-wrap');function sync(){wrap.style.display=noExpiry.has(type.value)?'none':''}type.addEventListener('change',sync);sync();</script><label>PDF</label><input type="file" name="file" accept="application/pdf,.pdf" required><button>Charger le document</button></form></div>`));
 const fd=await req.formData(); if(String(fd.get('password')||'')!==(process.env.PARC_PASSWORD||''))return html(shell('<p class="bad">Mot de passe incorrect.</p>'),401);
 const id=String(fd.get('id')||'').toUpperCase(),type=String(fd.get('type')||''),file=fd.get('file'); if(!MACHINES[id]||!TYPES[type]||!(file instanceof File))return html(shell('<p class="bad">Données invalides.</p>'),400);
 let expiry=''; if(hasExpiryDate(type)){ expiry=String(fd.get('expiry')||''); if(!expiry)expiry=iso(parseDate(file.name)); }
 const key=`${id}/${type}/${file.name.replace(/[\\/]/g,'_')}`; await store().set(key,await file.arrayBuffer(),{metadata:{type,label:file.name,expiry,uploadedAt:new Date().toISOString()}});
 return html(shell(`<p class="ok">Document chargé pour ${esc(MACHINES[id].name)}.</p><p>${esc(file.name)}${expiry?` — expiration ${new Date(expiry+'T00:00:00').toLocaleDateString('fr-FR')}`:hasExpiryDate(type)?' — date à renseigner':' — sans date'}</p><p><a href="/machine/${id}">Voir le matériel</a></p>`));
};
