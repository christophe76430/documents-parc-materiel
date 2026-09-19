import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const DOCS = {
  "carte-grise": "carte-grise.pdf",
  "assurance": "assurance.pdf",
  "mines": "mines.pdf",
  "vgp": "vgp.pdf",
  "barre-rouge": "barre-rouge.pdf"
};

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}
function safeEqual(a,b) {
  const aa=Buffer.from(a), bb=Buffer.from(b);
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}
function makeCookie(secret) {
  const exp=Math.floor(Date.now()/1000)+2*60*60;
  const payload=`admin.${exp}`;
  return `${payload}.${sign(payload,secret)}`;
}
function validAdmin(cookie, secret) {
  const c=cookie?.split(";").find(x=>x.trim().startsWith("PARC_ADMIN="));
  if(!c) return false;
  const token=c.trim().slice("PARC_ADMIN=".length);
  const [who,exp,sig]=token.split(".");
  if(who!=="admin" || !exp || !sig || Number(exp)<Math.floor(Date.now()/1000)) return false;
  return safeEqual(sig,sign(`${who}.${exp}`,secret));
}
function page(message="") {
  return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Administration – Parc matériel</title>
<style>
body{font-family:Arial;max-width:700px;margin:35px auto;padding:20px}
input,select,button{padding:11px;font-size:16px;margin:6px 0}
input[type=file]{width:100%;box-sizing:border-box}
button{cursor:pointer}
.box{border:1px solid #ddd;padding:18px;border-radius:10px}
.ok{color:#087a31}.err{color:#b00020}
</style>
<h1>Administration – PARC MATÉRIEL</h1>
${message}
<div class="box">
<form method="post" enctype="multipart/form-data">
<label>Équipement</label><br>
<select name="id"><option value="T01">T01 - EW-610-MD</option></select><br>
<label>Document</label><br>
<select name="doc">
<option value="carte-grise">Carte grise</option>
<option value="assurance">Assurance</option>
<option value="mines">Mines</option>
<option value="vgp">VGP</option>
<option value="barre-rouge">Barre rouge</option>
</select><br>
<label>Fichier PDF</label><br>
<input name="file" type="file" accept="application/pdf" required><br>
<button type="submit">Déposer le document</button>
</form></div>`,
  {headers:{"content-type":"text/html;charset=UTF-8"}});
}

export default async (req) => {
  const secret=process.env.PARC_PASSWORD;
  if(!secret) return new Response("Configuration serveur incomplète",{status:500});

  if(req.method==="GET") {
    if(validAdmin(req.headers.get("cookie"),secret)) return page("<p>Choisis le document à déposer.</p>");
    return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connexion administration</title>
<style>body{font-family:Arial;max-width:500px;margin:50px auto;padding:20px}input,button{padding:12px;font-size:16px}input{width:100%;box-sizing:border-box}button{margin-top:12px}</style>
<h1>🏗️ Administration</h1>
<form method="post"><input type="password" name="password" placeholder="Mot de passe" required><br><button>Connexion</button></form>`,
      {headers:{"content-type":"text/html;charset=UTF-8"}});
  }

  if(req.method!=="POST") return new Response("Méthode non autorisée",{status:405});

  const form=await req.formData();

  // Login
  if(form.has("password") && !form.has("file")) {
    const password=String(form.get("password")||"");
    if(!safeEqual(password,secret)) return new Response("Mot de passe incorrect",{status:403});
    return new Response("<!doctype html><meta http-equiv='refresh' content='0;url=/admin'>",{
      status:303,
      headers:{"location":"/admin","set-cookie":`PARC_ADMIN=${makeCookie(secret)}; HttpOnly; Secure; SameSite=Strict; Max-Age=7200; Path=/`}
    });
  }

  if(!validAdmin(req.headers.get("cookie"),secret)) return new Response("Accès refusé",{status:403});

  const id=String(form.get("id")||"").toUpperCase();
  const doc=String(form.get("doc")||"");
  const file=form.get("file");

  if(id!=="T01" || !DOCS[doc] || !(file instanceof File)) return page('<p class="err">Données invalides.</p>');
  if(file.type!=="application/pdf") return page('<p class="err">Le fichier doit être un PDF.</p>');

  const bytes=await file.arrayBuffer();
  const store=getStore({name:"parc-documents",region:"eu-central-1"});
  await store.set(`${id}/${DOCS[doc]}`,bytes,{metadata:{contentType:"application/pdf"}});

  return page(`<p class="ok">✓ ${DOCS[doc]} a bien été déposé pour ${id}.</p>`);
};