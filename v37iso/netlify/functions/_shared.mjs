import crypto from 'node:crypto';
import { getStore } from '@netlify/blobs';
import machines from '../../machines.json' with { type: 'json' };

export const STORE = 'parc-documents';
export const DRIVER_STORE = 'parc-chauffeurs';
export const STATUS_STORE = 'parc-materiel-status';
export const REGION = 'eu-central-1';
export const TTL = 8 * 60 * 60 * 1000;

export function allMachines(){
  const out = {};
  for (const [group, items] of Object.entries(machines)) {
    for (const [id, name] of items) out[id] = { id, name, group };
  }
  return out;
}
export const MACHINES = allMachines();

export const TYPES = {
  assurance:{label:'Assurance',alertDays:30},
  vgp:{label:'VGP',alertDays:30},
  mines:{label:'Mines',alertDays:30},
  ct:{label:'Contrôle technique',alertDays:30},
  shunt:{label:'Barre de shunt',alertDays:30},
  agrement:{label:'Agrément',alertMonths:3},
  carte:{label:'Carte grise'},
  barreRouge:{label:'Barré rouge'},
  divers:{label:'Divers'},
  doc:{label:'Document'},
  devis:{label:'Devis'}
};

export const DRIVER_CATEGORIES = {
  identite:{label:'Identité',icon:'👤'},
  formation:{label:'Formation',icon:'🎓'},
  divers:{label:'Divers',icon:'📂'}
};

export function store(){
  return getStore({name:STORE,region:REGION,consistency:'strong'});
}
export function driverStore(){
  return getStore({name:DRIVER_STORE,region:REGION,consistency:'strong'});
}
export function statusStore(){
  return getStore({name:STATUS_STORE,region:REGION,consistency:'strong'});
}
export async function getMachineStatus(id){
  const key=`machine/${id}.json`;
  try{
    const r=await statusStore().get(key,{type:'json',consistency:'strong'});
    return r && r.enabled!==false;
  }catch{return true;}
}
export async function getMachineStatuses(){
  const out={};
  await Promise.all(Object.keys(MACHINES).map(async id=>{
    try{
      const r=await statusStore().get(`machine/${id}.json`,{type:'json',consistency:'strong'});
      out[id]=r?.enabled!==false;
    }catch{out[id]=true;}
  }));
  return out;
}


export function expectedTypes(m){
  if(!m) return [];
  if(m.group==='camions') return ['carte','assurance','mines','vgp','barreRouge'];
  if(m.group==='vehicules') return ['carte','assurance','ct'];
  if(['P16','P17','P18','P19','P20','P21','P24','P25'].includes(m.id)) return ['assurance','vgp','shunt','agrement'];
  if(['RRA319','RRA034','RRA035','RRA318','RRAT064','RRAT089'].includes(m.id)) return ['agrement'];
  return ['assurance','vgp','shunt'];
}

const secret = () => process.env.PARC_PASSWORD || '';
export function makeToken(id){
  const exp = Date.now()+TTL;
  const payload = `${id}.${exp}`;
  const sig = crypto.createHmac('sha256',secret()).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}
export function validToken(token,id){
  try{
    if(!token || !secret()) return false;
    const raw=Buffer.from(token,'base64url').toString();
    const [tid,exp,sig]=raw.split('.');
    if(tid!==id || !Number.isFinite(Number(exp)) || Number(exp)<=Date.now()) return false;
    const expected=crypto.createHmac('sha256',secret()).update(`${tid}.${exp}`).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected));
  }catch{return false;}
}
export function parseCookies(req){
  const out={};
  for(const p of (req.headers.get('cookie')||'').split(';')){
    const i=p.indexOf('=');
    if(i>0) out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1));
  }
  return out;
}
export function cookie(name,value){return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL/1000}`;}
export function clearCookie(name){return `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}
export function html(s,status=200,headers={}){return new Response(s,{status,headers:{'Content-Type':'text/html; charset=utf-8',...headers}})}
export function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8',...headers}})}
export function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

export function parseDate(s){
  const t=String(s||'').replace(/_/g,' ').replace(/\s+/g,' ');
  let m=t.match(/\b(\d{2})[-./ ](\d{2})[-./ ](\d{4})\b/); if(m)return new Date(+m[3],+m[2]-1,+m[1]);
  m=t.match(/\b(\d{4})[-./](\d{2})[-./](\d{2})\b/); if(m)return new Date(+m[1],+m[2]-1,+m[3]);
  const months={janvier:0,janv:0,février:1,fevr:1,févr:1,fevrier:1,mars:2,avril:3,avr:3,mai:4,juin:5,juillet:6,juil:6,août:7,aout:7,septembre:8,sept:8,octobre:9,oct:9,novembre:10,nov:10,décembre:11,decembre:11,déc:11,dec:11};
  m=t.toLowerCase().match(/\b(\d{1,2})\s+(janvier|janv|février|fevr|févr|fevrier|mars|avril|avr|mai|juin|juillet|juil|août|aout|septembre|sept|octobre|oct|novembre|nov|décembre|decembre|déc|dec)\s+(\d{4})\b/);
  if(m)return new Date(+m[3],months[m[2]],+m[1]);
  return null;
}
export function iso(d){return d && !Number.isNaN(new Date(d).getTime()) ? new Date(d).toISOString().slice(0,10) : '';}

export function alertState(expiry,type){
  if(['carte','barreRouge','divers','doc','devis'].includes(type)) return {state:'none',text:''};
  if(!expiry||!type) return {state:'none',text:'Date non renseignée'};
  const d=new Date(expiry+'T23:59:59'); const now=new Date();
  const alertAt=new Date(d);
  if(type==='agrement') alertAt.setMonth(alertAt.getMonth()-3); else alertAt.setDate(alertAt.getDate()-30);
  if(now>d)return {state:'bad',text:'EXPIRÉ'};
  if(now>=alertAt)return {state:'warn',text:'À renouveler bientôt'};
  return {state:'ok',text:'Valide'};
}

export function status(expiry){
  const a=alertState(expiry,'vgp');
  return a.state==='bad'?{class:'red',label:'Dépassé'}:a.state==='warn'?{class:'orange',label:'Échéance proche'}:a.state==='ok'?{class:'green',label:'Valide'}:{class:'neutral',label:'Document'};
}

export function hashSecret(value){return crypto.createHash('sha256').update(String(value)).digest('hex');}
export function driverCodeMatches(input,stored){
  return stored===hashSecret(input) || stored===input; // compatibilité avec d'anciens codes éventuellement stockés en clair
}
