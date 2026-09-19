import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import machines from '../../machines.json' with { type: 'json' };

export const STORE = 'parc-documents';
export const REGION = 'eu-central-1';
export const TTL = 8 * 60 * 60 * 1000;

export function allMachines(){
  const out={};
  for(const [group,items] of Object.entries(machines)) for(const [id,name] of items) out[id]={id,name,group};
  return out;
}
export const MACHINES=allMachines();
export const TYPES={
  assurance:{label:'Assurance',alertDays:30},
  vgp:{label:'VGP',alertDays:30},
  mines:{label:'Mines',alertDays:30},
  ct:{label:'Contrôle technique',alertDays:30},
  shunt:{label:'Barre de shunt',alertDays:30},
  agrement:{label:'Agrément',alertMonths:3},
  carte:{label:'Carte grise'},
  barreRouge:{label:'Barre rouge'}
};
export function expectedTypes(m){
  if(!m) return [];
  if(m.group==='camions') return ['carte','assurance','mines','vgp','barreRouge'];
  if(m.group==='vehicules') return ['carte','assurance','ct'];
  if(['P16','P17','P18','P19','P20','P21','P24','P25'].includes(m.id)) return ['assurance','vgp','shunt','agrement'];
  if(['RRA319','RRA034','RRA035','RRA318','RRAT064','RRAT089'].includes(m.id)) return ['agrement'];
  return ['assurance','vgp','shunt'];
}
export function store(){ return getStore({name:STORE,region:REGION}); }
export function b64url(buf){return Buffer.from(buf).toString('base64url');}
export function sign(id,exp){const secret=process.env.PARC_PASSWORD||'';return b64url(crypto.createHmac('sha256',secret).update(`${id}.${exp}`).digest())}
export function makeToken(id){const exp=Date.now()+TTL;return `${id}.${exp}.${sign(id,exp)}`}
export function validToken(token,id){try{const [tid,e,s]=String(token||'').split('.');return tid===id&&Number(e)>Date.now()&&crypto.timingSafeEqual(Buffer.from(s),Buffer.from(sign(tid,Number(e))))}catch{return false}}
export function cookie(id){return `PARC_AUTH=${makeToken(id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL/1000}`}
export function html(s,status=200,headers={}){return new Response(s,{status,headers:{'Content-Type':'text/html; charset=utf-8',...headers}})}
export function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
export function parseCookies(req){const o={};for(const p of (req.headers.get('cookie')||'').split(';')){const i=p.indexOf('=');if(i>0)o[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1));}return o}
export function parseDate(s){
  const t=String(s||'').replace(/_/g,' ').replace(/\s+/g,' ');
  let m=t.match(/\b(\d{2})[-./ ](\d{2})[-./ ](\d{4})\b/); if(m)return new Date(+m[3],+m[2]-1,+m[1]);
  m=t.match(/\b(\d{4})[-./](\d{2})[-./](\d{2})\b/); if(m)return new Date(+m[1],+m[2]-1,+m[3]);
  const months={janvier:0,février:1,mars:2,avril:3,mai:4,juin:5,juillet:6,août:7,septembre:8,octobre:9,novembre:10,décembre:11};
  m=t.toLowerCase().match(/\b(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})\b/); if(m)return new Date(+m[3],months[m[2]],+m[1]);
  return null;
}
export function alertState(expiry,type){
  if(!expiry||!type||type==='carte'||type==='barreRouge') return {state:'none',text:expiry?'Valide':'Date non renseignée'};
  const d=new Date(expiry+'T23:59:59'); const now=new Date(); let alertAt;
  if(type==='agrement'){alertAt=new Date(d);alertAt.setMonth(alertAt.getMonth()-3)} else {alertAt=new Date(d);alertAt.setDate(alertAt.getDate()-30)}
  if(now>d)return {state:'bad',text:'EXPIRÉ'};
  if(now>=alertAt)return {state:'warn',text:'À renouveler bientôt'};
  return {state:'ok',text:'Valide'};
}
export function iso(d){return d?new Date(d).toISOString().slice(0,10):''}
