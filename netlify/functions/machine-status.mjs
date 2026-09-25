import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import machines from '../../machines.json' with { type: 'json' };

const STORE = 'parc-materiel-status';
const REGION = 'eu-central-1';
const TTL = 8 * 60 * 60 * 1000;
const MACHINES = {};
for (const [group, items] of Object.entries(machines)) {
  for (const [id, name] of items) MACHINES[id] = { id, name, group };
}
const secret = () => process.env.PARC_PASSWORD || '';
function parseCookies(req){const out={};for(const p of (req.headers.get('cookie')||'').split(';')){const i=p.indexOf('=');if(i>0)out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1));}return out;}
function validToken(token,id){try{if(!token||!secret())return false;const raw=Buffer.from(token,'base64url').toString();const [tid,exp,sig]=raw.split('.');if(tid!==id||!Number.isFinite(Number(exp))||Number(exp)<=Date.now())return false;const expected=crypto.createHmac('sha256',secret()).update(`${tid}.${exp}`).digest('hex');return !!sig&&crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected));}catch{return false;}}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});

export default async req => {
  try {
    if(req.method!=='POST') return json({ok:false,message:'Méthode non autorisée.'},405);
    if(!validToken(parseCookies(req).PARC_ADMIN,'ADMIN')) return json({ok:false,message:'Session administrateur expirée.'},401);
    const fd=await req.formData();
    const id=String(fd.get('id')||'').toUpperCase();
    const enabled=String(fd.get('enabled')||'1')!=='0';
    if(!MACHINES[id]) return json({ok:false,message:'Matériel inconnu.'},400);
    // Pas de lecture ni de rechargement de l'administration : une seule écriture Blob.
    const store=getStore({name:STORE,region:REGION});
    await store.set(`machine/${id}.json`,JSON.stringify({id,enabled,updatedAt:new Date().toISOString()}),{metadata:{id,type:'machine-status',enabled:String(enabled)}});
    return json({ok:true,id,enabled,message:`${MACHINES[id].name} : ${enabled?'ON — les échéances sont prises en compte.':'OFF — les échéances sont masquées.'}`});
  } catch(e) {
    console.error('MACHINE STATUS ERROR',e);
    return json({ok:false,message:e?.message||'Erreur lors de l’enregistrement du statut.'},500);
  }
};
