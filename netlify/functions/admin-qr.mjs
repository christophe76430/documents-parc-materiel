import crypto from 'node:crypto';
import machines from '../../machines.json' with { type: 'json' };

const TTL = 8 * 60 * 60 * 1000;
const secret = () => process.env.PARC_PASSWORD || '';
function parseCookies(req){const out={};for(const p of (req.headers.get('cookie')||'').split(';')){const i=p.indexOf('=');if(i>0)out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1));}return out;}
function validToken(token,id){try{if(!token||!secret())return false;const raw=Buffer.from(token,'base64url').toString();const [tid,exp,sig]=raw.split('.');if(tid!==id||!Number.isFinite(Number(exp))||Number(exp)<=Date.now())return false;const expected=crypto.createHmac('sha256',secret()).update(`${tid}.${exp}`).digest('hex');return !!sig&&crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected));}catch{return false;}}
function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function html(s,status=200,headers={}){return new Response(s,{status,headers:{'Content-Type':'text/html; charset=utf-8',...headers}});}

export default async req=>{
  if(!validToken(parseCookies(req).PARC_ADMIN,'ADMIN')) return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Administration THN</title><link rel="stylesheet" href="/style.css"></head><body><main><div class="box"><h1>🔐 Accès refusé</h1><p>Cette liste est réservée à l'administration.</p><p><a href="/admin">← Retour à l'administration</a></p></div></main></body></html>`,401);
  const origin=new URL(req.url).origin;
  const groups=[['camions','Camions'],['pelles','Engins rail-route et remorques']];
  const cards=groups.map(([group,label])=>{
    const items=machines[group]||[];
    return `<section class="group"><h2>${esc(label)}</h2><div class="grid">${items.map(([id,name])=>{
      const parts=String(name).split(' - '); const code=parts[0]||id; const desc=parts.slice(1).join(' - ')||name;
      const target=`${origin}/machine/${encodeURIComponent(id)}`;
      const qr=`https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(target)}`;
      return `<article class="card"><img src="${qr}" alt="QR code ${esc(code)}" loading="eager"><div class="code">${esc(code)}</div><div class="name">${esc(desc)}</div><div class="url">${esc(target)}</div></article>`;
    }).join('')}</div></section>`;
  }).join('');
  return html(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QR codes — Parc THN</title><style>
@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#0f2f52;margin:0;background:#fff}.toolbar{position:sticky;top:0;background:#fff;border-bottom:1px solid #d9e6f2;padding:12px 0;margin-bottom:16px;z-index:5}.toolbar-inner{max-width:1120px;margin:auto;display:flex;gap:10px;align-items:center;justify-content:space-between}.toolbar a,.toolbar button{border:0;border-radius:9px;padding:10px 14px;font-weight:700;text-decoration:none;cursor:pointer}.toolbar a{background:#eef6ff;color:#1264b0}.toolbar button{background:#1769d1;color:#fff}.sheet{max-width:1120px;margin:auto}.title{display:flex;align-items:center;gap:14px;border-bottom:2px solid #1769d1;padding-bottom:12px}.title h1{margin:0;font-size:25px}.title p{margin:4px 0 0;color:#667b91}.group{break-before:page}.group:first-of-type{break-before:auto}.group h2{font-size:19px;margin:18px 0 10px;border-left:5px solid #1769d1;padding-left:10px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10mm 7mm}.card{border:1px solid #cbdceb;border-radius:10px;padding:7mm 5mm;text-align:center;break-inside:avoid;min-height:85mm;display:flex;flex-direction:column;align-items:center;justify-content:center}.card img{width:47mm;height:47mm;object-fit:contain}.code{font-size:16px;font-weight:800;margin-top:3mm}.name{font-size:11px;line-height:1.25;margin-top:2mm;min-height:14mm}.url{font-size:7px;color:#7a8da0;word-break:break-all;margin-top:2mm}.note{font-size:10px;color:#667b91;margin:12px 0 0}@media(max-width:800px){.grid{grid-template-columns:repeat(2,1fr)}}@media print{.toolbar{display:none}.sheet{max-width:none}.group{break-before:page}.group:first-of-type{break-before:auto}.card{border:1px solid #b9c9d8}}
</style></head><body><div class="toolbar"><div class="toolbar-inner"><a href="/admin">← Administration</a><button onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button></div></div><main class="sheet"><div class="title"><div><h1>Liste des QR codes — Parc THN</h1><p>Scannez le QR code pour accéder directement à la fiche de l'engin ou de la remorque.</p><p class="note">Document généré depuis l'adresse actuelle du site. Le fichier PDF peut ensuite être imprimé ou enregistré.</p></div></div>${cards}</main></body></html>`);
};
