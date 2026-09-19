import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const DOCS = {
 "carte-grise.pdf":"carte-grise.pdf",
 "assurance.pdf":"assurance.pdf",
 "mines.pdf":"mines.pdf",
 "vgp.pdf":"vgp.pdf",
 "barre-rouge.pdf":"barre-rouge.pdf"
};
function sign(value, secret){return crypto.createHmac("sha256",secret).update(value).digest("hex")}
function validCookie(req, secret){
 const c=req.headers.get("cookie")?.split(";").find(x=>x.trim().startsWith("PARC_AUTH="));
 if(!c) return false;
 const token=c.trim().slice("PARC_AUTH=".length);
 const [id,exp,sig]=token.split(".");
 if(id!=="T01" || !exp || !sig || Number(exp)<Math.floor(Date.now()/1000)) return false;
 const expected=sign(`${id}.${exp}`,secret);
 const a=Buffer.from(sig), b=Buffer.from(expected);
 return a.length===b.length && crypto.timingSafeEqual(a,b);
}
export default async (req)=>{
 const secret=process.env.PARC_PASSWORD;
 if(!secret || !validCookie(req,secret)) return new Response("Accès refusé",{status:403});
 const url=new URL(req.url);
 const name=url.searchParams.get("name");
 if(!name || !DOCS[name]) return new Response("Document introuvable",{status:404});
 const store=getStore({name:"parc-documents",region:"eu-central-1"});
 const blob=await store.get(`T01/${DOCS[name]}`,{type:"blob"});
 if(!blob) return new Response("Document non encore déposé",{status:404});
 return new Response(blob,{headers:{
   "content-type":"application/pdf",
   "content-disposition":`inline; filename="${DOCS[name]}"`,
   "cache-control":"private, no-store"
 }});
};