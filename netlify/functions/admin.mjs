import crypto from 'node:crypto';
import { MACHINES,TYPES,DRIVER_CATEGORIES,expectedTypes,store,driverStore,parseCookies,validToken,cookie,clearCookie,makeToken,html,esc,parseDate,iso,alertState,hashSecret } from './_shared.mjs';

export const config={path:'/admin'};
const NO_EXPIRY=new Set(['carte','barreRouge','divers','doc','devis']);
const adminOK=req=>validToken(parseCookies(req).PARC_ADMIN,'ADMIN');

function shell(body){return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Administration THN</title><link rel="stylesheet" href="/style.css"></head><body><main class="admin-page"><h1>Administration du parc matériel</h1>${body}</main></body></html>`}

function parseExpiryFromFilename(filename){
  const s=String(filename||'').replace(/_/g,' ');
  const m=s.match(/\b(0?[1-9]|[12]\d|3[01])[\s.-]+(0?[1-9]|1[0-2])[\s.-]+(\d{2})\b/);
  if(!m)return '';
  const day=Number(m[1]),month=Number(m[2]),yy=Number(m[3]);
  const year=yy<=69?2000+yy:1900+yy;
  const d=new Date(year,month-1,day);
  if(d.getFullYear()!==year||d.getMonth()!==month-1||d.getDate()!==day)return '';
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
function formatDate(v){if(!v)return '—';const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]} ${m[2]} ${m[1].slice(-2)}`:String(v)}
function daysUntil(v){if(!v)return null;const d=new Date(`${v}T23:59:59`);return Math.ceil((d-Date.now())/86400000)}
function statusHtml(type,expiry){
  if(NO_EXPIRY.has(type)) return '<span class="admin-status neutral">Sans échéance</span>';
  if(!expiry) return '<span class="admin-status red">Échéance non renseignée</span>';
  const a=alertState(expiry,type); const cls=a.state==='bad'?'red':a.state==='warn'?'orange':'green';
  const label=a.state==='bad'?'Dépassé':a.state==='warn'?'Échéance proche':'Valide';
  return `<span class="admin-status ${cls}">${label}</span>`;
}

async function driverList(){const {blobs}=await driverStore().list({prefix:'driver/'});const out=[];for(const b of blobs){const d=await driverStore().get(b.key,{type:'json'}).catch(()=>null);if(d)out.push(d)}return out}
async function docsList(){
  const {blobs}=await store().list({prefix:''}); const out=[];
  for(const b of blobs){
    const p=b.key.split('/'); if(!MACHINES[p[0]]) continue;
    const meta=await store().getMetadata(b.key).catch(()=>null);
    const filename=p.slice(2).join('/')||p[1]||'';
    const type=meta?.metadata?.type||p[1]||'';
    const label=meta?.metadata?.label||filename;
    const expiry=meta?.metadata?.expiry||parseExpiryFromFilename(filename);
    out.push({key:b.key,id:p[0],type,label,filename,expiry});
  }
  return out;
}

function groupOrder(){return [['camions','🚛 Camions'],['pelles','🚧 Matériel rail-route'],['vehicules','🚐 Véhicules']]}
function buildTree(docs){
  const byMachine=new Map(); for(const d of docs){if(!byMachine.has(d.id))byMachine.set(d.id,[]);byMachine.get(d.id).push(d)}
  return groupOrder.map(([group,glabel])=>{
    const machines=Object.values(MACHINES).filter(m=>m.group===group);
    const machineHtml=machines.map(m=>{
      const items=byMachine.get(m.id)||[];
      const byType=new Map(); for(const d of items){if(!byType.has(d.type))byType.set(d.type,[]);byType.get(d.type).push(d)}
      const types=[...expectedTypes(m),...items.map(x=>x.type).filter(t=>t&&!expectedTypes(m).includes(t)&&TYPES[t])];
      const unique=[...new Set(types)];
      const typeHtml=unique.map(t=>{
        const list=byType.get(t)||[]; const label=TYPES[t]?.label||t;
        const files=list.length?list.map(d=>`<div class="tree-file"><div class="tree-file-main"><span class="tree-file-icon">📄</span><div><a href="/document/${encodeURIComponent(d.id)}/${encodeURIComponent(d.type)}/${encodeURIComponent(d.filename)}" target="_blank" rel="noopener">${esc(d.filename)}</a><div class="tree-meta">${d.expiry?`Échéance : ${formatDate(d.expiry)}`:'Aucune échéance renseignée'} · ${statusHtml(d.type,d.expiry)}</div></div></div><form method="post" onsubmit="return confirm('Supprimer définitivement ce fichier ?')"><input type="hidden" name="action" value="delete-doc"><input type="hidden" name="key" value="${esc(d.key)}"><button class="danger small-btn">Supprimer</button></form></div>`).join(''):`<div class="tree-empty">Aucun fichier chargé</div>`;
        return `<details class="tree-type"><summary><span>📁 ${esc(label)}</span><span class="tree-count">${list.length}</span></summary><div class="tree-files">${files}</div></details>`;
      }).join('');
      return `<details class="tree-machine"><summary><span><strong>${esc(m.name)}</strong> <span class="machine-id">(${esc(m.id)})</span></span><span class="tree-count">${items.length} fichier${items.length>1?'s':''}</span></summary><div class="tree-types">${typeHtml}</div></details>`;
    }).join('');
    return `<details class="tree-group" open><summary><span><strong>${glabel}</strong></span><span class="tree-count">${machines.length} matériels</span></summary><div class="tree-machines">${machineHtml}</div></details>`;
  }).join('');
}

function page(docs,drivers,msg=''){
  const tree=buildTree(docs);
  const machineOptions=Object.values(MACHINES).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('');
  const typeOptions=Object.entries(TYPES).map(([k,v])=>`<option value="${k}">${esc(v.label)}</option>`).join('');
  return shell(`
  <div class="admin-toolbar"><a class="admin-back" href="/">← Accueil</a><form method="post"><input type="hidden" name="action" value="logout"><button class="secondary">Se déconnecter</button></form></div>
  ${msg?`<div class="box"><p class="ok">${esc(msg)}</p></div>`:''}
  <div class="box admin-upload">
    <h2>📤 Ajouter un document</h2>
    <form method="post" enctype="multipart/form-data" class="admin-upload-grid">
      <div><label>Matériel</label><select name="id" required>${machineOptions}</select></div>
      <div><label>Type de document</label><select name="type" required>${typeOptions}</select></div>
      <div><label>Date d'échéance <span class="muted">(facultative si présente dans le nom)</span></label><input type="date" name="expiry"></div>
      <div><label>Fichier</label><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" required></div>
      <div class="admin-upload-submit"><button>Charger le document</button></div>
    </form>
    <p class="muted">Les fichiers avec échéance restent entièrement visibles ici, avec leur nom de fichier et leur date.</p>
  </div>
  <div class="box">
    <div class="admin-tree-head"><div><h2>🌳 Arborescence complète du parc</h2><p class="muted">Tous les matériels, tous les types de documents et tous les fichiers sont visibles, y compris les documents avec échéance.</p></div><input id="tree-search" type="search" placeholder="Rechercher un matériel ou un fichier…"></div>
    <div id="tree" class="admin-tree">${tree}</div>
  </div>
  <div class="box">
    <h2>👷 Gestion des chauffeurs</h2>
    ${drivers.map(d=>`<p><b>${esc(d.name)}</b> — code personnel enregistré</p>`).join('')||'<p class="muted">Aucun chauffeur.</p>'}
    <form method="post"><input type="hidden" name="action" value="add-driver"><label>Nom du chauffeur</label><input name="name" required><label>Code personnel</label><input name="code" required><button>Ajouter le chauffeur</button></form>
  </div>
  ${drivers.map(d=>`<div class="box"><h3>📁 Documents — ${esc(d.name)}</h3><form method="post" enctype="multipart/form-data"><input type="hidden" name="action" value="upload-driver"><input type="hidden" name="driver" value="${d.id}"><label>Rubrique</label><select name="cat">${Object.entries(DRIVER_CATEGORIES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select><label>Fichier</label><input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" required><button>Charger</button></form></div>`).join('')}
  <script>
  const q=document.getElementById('tree-search');
  q.addEventListener('input',()=>{const v=q.value.toLowerCase().trim();document.querySelectorAll('.tree-machine').forEach(el=>{const hit=!v||el.textContent.toLowerCase().includes(v);el.style.display=hit?'':'none';if(v&&hit)el.open=true;});document.querySelectorAll('.tree-group').forEach(el=>{const visible=[...el.querySelectorAll('.tree-machine')].some(x=>x.style.display!=='none');el.style.display=visible?'':'none';if(v&&visible)el.open=true;});});
  </script>`)
}

export default async req=>{
  if(req.method==='GET'&&!adminOK(req)) return html(shell(`<div class="box admin-login"><h2>🔐 Accès administration</h2><p class="muted">Cette zone permet d'ajouter, consulter et supprimer les documents du parc.</p><form method="post"><input type="hidden" name="action" value="login"><label>Mot de passe administrateur</label><input type="password" name="password" autocomplete="current-password" required autofocus><button>Accéder</button></form></div>`));

  if(req.method==='POST'){
    const fd=await req.formData(); const action=String(fd.get('action')||'');
    if(action==='login'){
      if(String(fd.get('password')||'')===(process.env.PARC_PASSWORD||'')) return html(shell('<div class="box"><p class="ok">Connexion réussie.</p><p><a href="/admin">Ouvrir l’administration</a></p></div>'),200,{'Set-Cookie':cookie('PARC_ADMIN',makeToken('ADMIN'))});
      return html(shell('<div class="box"><p class="bad">Mot de passe incorrect.</p><p><a href="/admin">Réessayer</a></p></div>'),401);
    }
    if(!adminOK(req)) return html(shell('<div class="box"><p class="bad">Session administrateur expirée.</p></div>'),403);
    if(action==='logout') return html(shell('<div class="box"><p class="ok">Vous êtes déconnecté.</p><p><a href="/">Retour à l’accueil</a></p></div>'),200,{'Set-Cookie':clearCookie('PARC_ADMIN')});
    if(action==='delete-doc'){
      const key=String(fd.get('key')||''); if(key) await store().delete(key);
      return html(shell('<div class="box"><p class="ok">Document supprimé.</p><p><a href="/admin">Retour à l’administration</a></p></div>'));
    }
    if(action==='add-driver'){
      const name=String(fd.get('name')||'').trim(),code=String(fd.get('code')||'').trim();
      if(!name||!code)return html(shell('<p class="bad">Nom et code obligatoires.</p>'),400);
      const id=crypto.randomUUID(); await driverStore().set(`driver/${id}.json`,JSON.stringify({id,name,codeHash:hashSecret(code),enabled:true}),{metadata:{type:'driver'}});
      return html(shell('<div class="box"><p class="ok">Chauffeur ajouté.</p><p><a href="/admin">Retour</a></p></div>'));
    }
    if(action==='upload-driver'){
      const did=String(fd.get('driver')||''),cat=String(fd.get('cat')||'divers'),file=fd.get('file');
      if(!did||!DRIVER_CATEGORIES[cat]||!(file instanceof File))return html(shell('<p class="bad">Données invalides.</p>'),400);
      await driverStore().set(`docs/${did}/${cat}/${file.name.replace(/[\\/]/g,'_')}`,await file.arrayBuffer(),{metadata:{label:DRIVER_CATEGORIES[cat].label,contentType:file.type,uploadedAt:new Date().toISOString()}});
      return html(shell('<div class="box"><p class="ok">Document chauffeur chargé.</p><p><a href="/admin">Retour</a></p></div>'));
    }
    const id=String(fd.get('id')||'').toUpperCase(),type=String(fd.get('type')||''),file=fd.get('file');
    if(file instanceof File){
      if(!MACHINES[id]||!TYPES[type]) return html(shell('<p class="bad">Matériel ou type de document invalide.</p>'),400);
      let expiry=String(fd.get('expiry')||''); if(!expiry)expiry=iso(parseDate(file.name))||parseExpiryFromFilename(file.name);
      const clean=file.name.replace(/[\\/]/g,'_');
      await store().set(`${id}/${type}/${clean}`,await file.arrayBuffer(),{metadata:{type,label:file.name,expiry,uploadedAt:new Date().toISOString()}});
      return html(shell(`<div class="box"><p class="ok">Document chargé pour ${esc(MACHINES[id].name)}.</p><p><a href="/admin">Retour à l’administration</a></p></div>`));
    }
  }
  return html(page(await docsList(),await driverList()));
};
