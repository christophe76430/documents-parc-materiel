import crypto from "node:crypto";

const MACHINE = {
  id: "T01",
  name: "T01 - EW-610-MD - Man TGS 35.420 8x4 Grue",
  documents: [
    { key: "carte_grise", label: "Carte grise", file: "carte-grise.pdf" },
    { key: "assurance", label: "Assurance", file: "assurance.pdf" },
    { key: "mines", label: "Mines", file: "mines.pdf" },
    { key: "vgp", label: "VGP", file: "vgp.pdf" },
    { key: "barre_rouge", label: "Barre rouge", file: "barre-rouge.pdf" }
  ]
};

const enc = new TextEncoder();

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}
function safeEqual(a,b) {
  const aa=Buffer.from(a), bb=Buffer.from(b);
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}
function cookieFor(id, secret) {
  const exp=Math.floor(Date.now()/1000)+8*60*60;
  const payload=`${id}.${exp}`;
  return `${payload}.${sign(payload,secret)}`;
}
function validCookie(cookie, id, secret) {
  if (!cookie) return false;
  const c=cookie.split(";").find(x=>x.trim().startsWith("PARC_AUTH="));
  if (!c) return false;
  const token=c.trim().slice("PARC_AUTH=".length);
  const [mid, exp, sig]=token.split(".");
  if (mid!==id || !exp || !sig || Number(exp)<Math.floor(Date.now()/1000)) return false;
  return safeEqual(sig, sign(`${mid}.${exp}`,secret));
}
function html(message="") {
 return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${MACHINE.name}</title><style>body{font-family:Arial;max-width:650px;margin:50px auto;padding:20px}input,button{padding:12px;font-size:16px}input{width:95%;box-sizing:border-box}button{margin-top:12px}li{margin:15px 0}</style>
<h1>🏗️ PARC MATÉRIEL</h1><h2>${MACHINE.name}</h2>
${message ? `<p style="color:#b00020">${message}</p>`:""}
<form method="post"><p>Mot de passe :</p><input name="password" type="password" required autocomplete="current-password"><br><button>Accéder aux documents</button></form>`;
}

export default async (req) => {
 const secret=process.env.PARC_PASSWORD;
 if (!secret) return new Response("Configuration serveur incomplète", {status:500});
 if (req.method==="GET") {
   if (validCookie(req.headers.get("cookie"), MACHINE.id, secret)) {
     return Response.redirect(new URL(`/machine/T01?open=1`, req.url), 302);
   }
   return new Response(html(), {headers:{"content-type":"text/html;charset=UTF-8"}});
 }
 if (req.method!=="POST") return new Response("Méthode non autorisée",{status:405});
 const form=await req.formData();
 const password=String(form.get("password")||"");
 if (!safeEqual(password, secret)) return new Response(html("Mot de passe incorrect."),{status:401,headers:{"content-type":"text/html;charset=UTF-8"}});
 const cookie=cookieFor(MACHINE.id,secret);
 return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${MACHINE.name}</title><style>body{font-family:Arial;max-width:650px;margin:40px auto;padding:20px}li{margin:15px 0}</style>
<h1>🏗️ ${MACHINE.name}</h1><h2>Documents</h2><ul>
${MACHINE.documents.map(d=>`<li><a href="/document/T01/${encodeURIComponent(d.file)}">${d.label}</a></li>`).join("")}</ul>
<p>Accès valable 8 heures sur cet équipement.</p>`,{headers:{"content-type":"text/html;charset=UTF-8","set-cookie":`PARC_AUTH=${cookie}; HttpOnly; Secure; SameSite=Strict; Max-Age=28800; Path=/`}}); 
};