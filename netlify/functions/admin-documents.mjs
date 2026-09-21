import {
  MACHINES,
  TYPES,
  store,
  parseCookies,
  validToken,
  makeToken,
  TTL,
  html,
  esc
} from './_shared.mjs';

export const config = { path: '/admin-documents' };

const ADMIN_ID = 'ADMIN';
const ADMIN_COOKIE = 'PARC_ADMIN';

function adminCookie() {
  return `${ADMIN_COOKIE}=${makeToken(ADMIN_ID)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL / 1000}`;
}

function isAdmin(req) {
  const cookies = parseCookies(req);
  return validToken(cookies[ADMIN_COOKIE], ADMIN_ID);
}

function page(body) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gestion des documents</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<main>
<h1>Gestion des documents</h1>
${body}
</main>
</body>
</html>`;
}

function loginPage() {
  return page(`
    <div class="box">
      <h2>Accès administration</h2>
      <form method="post">
        <input type="hidden" name="action" value="login">

        <label>Mot de passe administrateur</label>
        <input
          type="password"
          name="password"
          autocomplete="current-password"
          required
        >

        <button>Accéder</button>
      </form>
    </div>
  `);
}

async function loadDocuments() {
  const { blobs } = await store().list({
    prefix: ''
  });

  const docs = await Promise.all(
    blobs.map(async blob => {
      const parts = blob.key.split('/');

      const id = parts[0] || '';
      const type = parts[1] || '';
      const name =
        parts.length >= 3
          ? parts.slice(2).join('/')
          : parts[1] || '';

      let label = name;

      try {
        const metadata = await store().getMetadata(blob.key);
        label = metadata?.metadata?.label || name;
      } catch {}

      return {
        key: blob.key,
        id,
        type,
        name,
        label
      };
    })
  );

  return docs
    .filter(d => MACHINES[d.id])
    .sort((a, b) => {
      const machineA = MACHINES[a.id]?.name || a.id;
      const machineB = MACHINES[b.id]?.name || b.id;

      return `${machineA} ${a.type} ${a.label}`.localeCompare(
        `${machineB} ${b.type} ${b.label}`,
        'fr'
      );
    });
}

function documentsPage(docs, message = '') {
  const rows = docs.map(d => {
    const machine = MACHINES[d.id];
    const typeLabel =
      TYPES[d.type]?.label ||
      d.type ||
      'Document';

    return `
      <div
        class="doc box"
        data-search="${esc(
          `${machine.name} ${typeLabel} ${d.label}`
        ).toLowerCase()}"
        style="margin-bottom:12px"
      >
        <strong>${esc(machine.name)}</strong>
        <br>
        <span class="muted">${esc(typeLabel)}</span>
        <br>
        <a
          href="/document/${encodeURIComponent(d.id)}/${encodeURIComponent(d.type || 'legacy')}/${encodeURIComponent(d.label)}"
          target="_blank"
        >
          ${esc(d.label)}
        </a>

        <form
          method="post"
          style="margin-top:10px"
          onsubmit="return confirm('Supprimer définitivement ce document ?');"
        >
          <input type="hidden" name="action" value="delete">
          <input type="hidden" name="key" value="${esc(d.key)}">
          <button
            type="submit"
            style="background:#dc2626;color:white"
          >
            Supprimer
          </button>
        </form>
      </div>
    `;
  }).join('');

  return page(`
    <h2>Documents du parc</h2>

    ${
      message
        ? `<p class="ok">${esc(message)}</p>`
        : ''
    }

    <div class="box" style="margin-bottom:20px">
      <label>Rechercher</label>
      <input
        id="search"
        type="search"
        placeholder="Matériel, type ou nom de fichier..."
      >
    </div>

    <div id="documents">
      ${rows || '<p class="muted">Aucun document.</p>'}
    </div>

    <p style="margin-top:25px">
      <a href="/.netlify/functions/admin">← Retour à l'administration</a>
    </p>

    <script>
      const search = document.getElementById('search');
      const cards = [...document.querySelectorAll('#documents .doc')];

      search.addEventListener('input', () => {
        const q = search.value.toLowerCase().trim();

        for (const card of cards) {
          card.style.display =
            !q || card.dataset.search.includes(q)
              ? ''
              : 'none';
        }
      });
    </script>
  `);
}

export default async req => {

  // Connexion administration
  if (req.method === 'POST') {
    const fd = await req.formData();
    const action = String(fd.get('action') || '');

    if (action === 'login') {
      const password = String(fd.get('password') || '');

      if (password !== (process.env.PARC_PASSWORD || '')) {
        return html(
          page(`
            <p class="bad">Mot de passe incorrect.</p>
            ${loginPage().replace(
              '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gestion des documents</title><link rel="stylesheet" href="/style.css"></head><body><main><h1>Gestion des documents</h1>',
              ''
            ).replace('</main></body></html>', '')}
          `),
          401
        );
      }

      const docs = await loadDocuments();

      return html(
        documentsPage(docs),
        200,
        {
          'Set-Cookie': adminCookie()
        }
      );
    }

    // Suppression
    if (action === 'delete') {
      if (!isAdmin(req)) {
        return html(
          page('<p class="bad">Session administrateur expirée.</p>'),
          403
        );
      }

      const key = String(fd.get('key') || '');

      const parts = key.split('/');
      const id = parts[0] || '';

      if (!MACHINES[id] || !key.startsWith(id + '/')) {
        return html(
          page('<p class="bad">Document invalide.</p>'),
          400
        );
      }

      await store().delete(key);

      const docs = await loadDocuments();

      return html(
        documentsPage(
          docs,
          `Document supprimé : ${key.split('/').pop()}`
        ),
        200,
        {
          'Set-Cookie': adminCookie()
        }
      );
    }
  }

  // Page GET
  if (!isAdmin(req)) {
    return html(loginPage());
  }

  const docs = await loadDocuments();

  return html(
    documentsPage(docs),
    200,
    {
      'Set-Cookie': adminCookie()
    }
  );
};
