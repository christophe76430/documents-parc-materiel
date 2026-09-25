import { MACHINES, TYPES, store, getMachineStatuses, getExtinguisherDates, hasExtinguisher, parseCookies, validToken, html } from './_shared.mjs';

export const config={path:'/export'};

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

export default async req=>{
  const c=parseCookies(req);
  if(!validToken(c.PARC_ADMIN,'ADMIN')) return html('<h1>Accès refusé</h1><p>Export réservé à l’administration.</p>',403);

  // Toutes les lectures indépendantes sont effectuées en parallèle.
  const [active, ext, listed] = await Promise.all([
    getMachineStatuses(),
    getExtinguisherDates(),
    store().list({prefix:''})
  ]);

  const blobs = listed?.blobs || [];
  const candidates = blobs.filter(b=>MACHINES[b.key.split('/')[0]]);

  // Les métadonnées des documents sont également récupérées en parallèle
  // pour éviter les timeouts provoqués par des dizaines de requêtes successives.
  const rowsNested = await Promise.all(candidates.map(async b=>{
    const p=b.key.split('/');
    const m=MACHINES[p[0]];
    if(!m || active[m.id]===false) return null;
    const type=p[1]||'';
    const meta=(await store().getMetadata(b.key).catch(()=>null))?.metadata||{};
    return [
      m.name,
      m.group==='pelles'?'Matériel rail-route':m.group==='vehicules'?'Véhicule':'Camion',
      TYPES[type]?.label||type,
      meta.label||p.slice(2).join('/'),
      meta.expiry||''
    ];
  }));

  const rows=rowsNested.filter(Boolean);

  for(const [id,e] of Object.entries(ext)){
    if(active[id]===false || !hasExtinguisher(id)) continue;
    const m=MACHINES[id];
    if(!m) continue;
    const match=String(e).match(/^(\d{4})-(\d{2})$/);
    rows.push([
      m.name,
      m.group==='pelles'?'Matériel rail-route':'Camion',
      'Extincteur',
      'Extincteur',
      match?`${match[2]}/${match[1]}`:''
    ]);
  }

  rows.sort((a,b)=>a[0].localeCompare(b[0],'fr')||a[2].localeCompare(b[2],'fr'));
  const body=rows.map(r=>`<tr>${r.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('');
  const xls=`<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1"><tr><th>Matériel</th><th>Type</th><th>Document</th><th>Fichier</th><th>Échéance</th></tr>${body}</table></body></html>`;
  return new Response(xls,{headers:{'Content-Type':'application/vnd.ms-excel; charset=utf-8','Content-Disposition':`attachment; filename="THN_parc_${new Date().toISOString().slice(0,10)}.xls"`}});
};
