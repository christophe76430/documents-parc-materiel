import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const DOCS_T01 = new Set(["carte-grise.pdf","assurance.pdf","mines.pdf","vgp.pdf","barre-rouge.pdf"]);

function sign(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

function validCookie(req, id, secret) {
  const c = req.headers.get("cookie")?.split(";").find(x => x.trim().startsWith("PARC_AUTH="));
  if (!c) return false;
  const token = c.trim().slice("PARC_AUTH=".length);
  const [mid, exp, sig] = token.split(".");
  if (mid !== id || !exp || !sig || Number(exp) < Math.floor(Date.now()/1000)) return false;
  const expected = sign(`${mid}.${exp}`, secret);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a,b);
}

export default async (req) => {
  const secret = process.env.PARC_PASSWORD;
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").toUpperCase();
  const name = url.searchParams.get("name") || "";

  if (!secret || !validCookie(req, id, secret)) {
    return new Response("Accès refusé", {status:403});
  }

  if (id !== "T01" || !DOCS_T01.has(name)) {
    return new Response("Document introuvable", {status:404});
  }

  const store = getStore({name:"parc-documents", region:"eu-central-1"});
  const blob = await store.get(`${id}/${name}`, {type:"blob"});
  if (!blob) return new Response("Document non encore déposé", {status:404});

  return new Response(blob, {
    headers: {
      "content-type":"application/pdf",
      "content-disposition":`inline; filename="${name}"`,
      "cache-control":"private, no-store"
    }
  });
};