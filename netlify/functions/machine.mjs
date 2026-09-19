import crypto from "node:crypto";

const MACHINES = {
  T01: {
    name: "T01 - EW-610-MD - Man TGS 35.420 8x4 Grue",
    documents: [
      ["carte-grise.pdf", "Carte grise"],
      ["assurance.pdf", "Assurance"],
      ["mines.pdf", "Mines"],
      ["vgp.pdf", "VGP"],
      ["barre-rouge.pdf", "Barre rouge"]
    ]
  },
  T04: {
    name: "T04 - EB-837-AD - Man TGS 28.440",
    documents: []
  }
};

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function safeEqual(a, b) {
  const aa = Buffer.from(a), bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function cookieFor(id, secret) {
  const exp = Math.floor(Date.now() / 1000) + 8 * 60 * 60;
  const payload = `${id}.${exp}`;
  return `${payload}.${sign(payload, secret)}`;
}

function validCookie(cookie, id, secret) {
  if (!cookie) return false;
  const c = cookie.split(";").find(x => x.trim().startsWith("PARC_AUTH="));
  if (!c) return false;
  const token = c.trim().slice("PARC_AUTH=".length);
  const [mid, exp, sig] = token.split(".");
  if (mid !== id || !exp || !sig || Number(exp) < Math.floor(Date.now()/1000)) return false;
  return safeEqual(sig, sign(`${mid}.${exp}`, secret));
}

function docsHtml(id, machine) {
  return `<ul>${machine.documents.map(([file,label]) =>
    `<li><a href="/document/${id}/${encodeURIComponent(file)}">${label}</a></li>`
  ).join("")}</ul>`;
}

function loginPage(machine, message = "") {
  return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${machine.name}</title>
<style>body{font-family:Arial;max-width:650px;margin:50px auto;padding:20px}input,button{padding:12px;font-size:16px}input{width:95%;box-sizing:border-box}button{margin-top:12px}</style>
<h1>🏗️ PARC MATÉRIEL</h1><h2>${machine.name}</h2>
${message ? `<p style="color:#b00020">${message}</p>` : ""}
<form method="post"><p>Mot de passe :</p>
<input name="password" type="password" required autocomplete="current-password"><br>
<button>Accéder aux documents</button></form>`,
  {headers: {"content-type":"text/html;charset=UTF-8"}});
}

function machinePage(machine) {
  return `<!doctype html><html lang="fr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${machine.name}</title>
<style>body{font-family:Arial;max-width:650px;margin:40px auto;padding:20px}li{margin:15px 0}</style>
<h1>🏗️ ${machine.name}</h1><h2>Documents</h2>
${machine.documents.length ? docsHtml(Object.keys(MACHINES).find(k => MACHINES[k] === machine), machine) :
  `<p>Aucun document de test n'est encore déposé pour ce matériel.</p>`}
<p>Accès valable 8 heures sur cet équipement.</p>`;
}

export default async (req) => {
  const secret = process.env.PARC_PASSWORD;
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").toUpperCase();
  const machine = MACHINES[id];

  if (!secret) return new Response("Configuration serveur incomplète", {status:500});
  if (!machine) return new Response("Matériel introuvable", {status:404});

  if (req.method === "GET") {
    if (validCookie(req.headers.get("cookie"), id, secret)) {
      return new Response(machinePage(machine), {headers: {"content-type":"text/html;charset=UTF-8"}});
    }
    return loginPage(machine);
  }

  if (req.method !== "POST") return new Response("Méthode non autorisée", {status:405});

  const form = await req.formData();
  const password = String(form.get("password") || "");
  if (!safeEqual(password, secret)) return loginPage(machine, "Mot de passe incorrect.");

  const cookie = cookieFor(id, secret);
  return new Response(machinePage(machine), {
    headers: {
      "content-type":"text/html;charset=UTF-8",
      "set-cookie":`PARC_AUTH=${cookie}; HttpOnly; Secure; SameSite=Strict; Max-Age=28800; Path=/`
    }
  });
};