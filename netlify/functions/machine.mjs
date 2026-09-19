import {
  MACHINES,
  TYPES,
  expectedTypes,
  store,
  parseCookies,
  validToken,
  cookie,
  html,
  esc,
  alertState
} from './_shared.mjs';

import filters from '../../filters.json' with { type: 'json' };

export const config = { path: '/machine/:id' };

function page(m, content) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.name)}</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<main>
<h1>🏗️ ${esc(m.name)}</h1>
${content}
</main>
</body>
</html>`;
}

function login(m) {
  return page(m, `<div class="box">
    <label>Mot de passe :</label>
    <form method="post">
      <input name="password" type="password" autocomplete="current-password" required>
      <button>Accéder aux documents</button>
    </form>
  </div>`);
}

async function loadItems(id) {
  const { blobs } = await store().list({ prefix: `${id}/` });

  return await Promise.all(blobs.map(async b => {
    const parts = b.key.split('/');
    let type = parts[1] || '';
    let label = parts[2] || b.key;
    let expiry = '';

    try {
      const meta = await store().getMetadata(b.key);
      expiry = meta?.metadata?.expiry || '';
      type = meta?.metadata?.type || type;
      label = meta?.metadata?.label || label;
    } catch {}

    return { key: b.key, type, label, expiry };
  }));
}

function statusDot(state) {
  if (state === 'ok') return '<span class="status-dot green" title="Document valide"></span>';
  if (state === 'warn') return '<span class="status-dot orange" title="Échéance proche"></span>';
  if (state === 'bad') return '<span class="status-dot red" title="Échéance très proche ou dépassée"></span>';
  return '';
}

function filterButton(m) {
  return `<div class="box" style="margin:20px 0">
    <a href="/filters/${encodeURIComponent(m.id)}" style="text-decoration:none">
      <button type="button">🔧 Voir les filtres de cet engin</button>
    </a>
  </div>`;
}

function docs(m, items) {
  const by = {};
  for (const t of expectedTypes(m)) by[t] = [];
  for (const x of items) {
    if (!by[x.type]) by[x.type] = [];
    by[x.type].push(x);
  }

  const types = [
    ...expectedTypes(m),
    ...Object.keys(by).filter(t => !expectedTypes(m).includes(t) && TYPES[t])
  ];

  let s = `
    <h2>Documents</h2>

    <div class="status-legend">
      <div class="legend-item">
        <span class="status-dot green"></span>
        <span>Document valide</span>
      </div>
      <div class="legend-item">
        <span class="status-dot orange"></span>
        <span>Échéance proche</span>
      </div>
      <div class="legend-item">
        <span class="status-dot red"></span>
        <span>Échéance très proche ou dépassée</span>
      </div>
      <div class="legend-item">
        <span class="status-dot gray"></span>
        <span>Document non chargé</span>
      </div>
    </div>
  `;

  for (const t of types) {
    const meta = TYPES[t];
    const list = by[t] || [];

    s += `<section><h3>${meta.label}</h3>`;

    if (!list.length) {
      const monitored = !['carte','barreRouge','divers','doc','devis'].includes(t);
      s += monitored
        ? '<p class="muted"><span class="status-dot gray"></span> Document non chargé.</p>'
        : '<p class="muted">Document non chargé.</p>';
    }

    for (const x of list) {
      const a = alertState(x.expiry, t);
      const docType =
        x.key.startsWith(m.id + '/') && x.key.split('/').length === 2
          ? 'legacy'
          : t;

      const fileName = encodeURIComponent(x.key.split('/').pop());

      s += `<div class="doc">
        ${x.expiry ? statusDot(a.state) : ''}
        <a href="/document/${m.id}/${docType}/${fileName}">
          ${esc(x.label || x.key)}
        </a>
        ${
          x.expiry
            ? ` — <span class="${a.state}">${a.text} (${new Date(
                x.expiry + 'T00:00:00'
              ).toLocaleDateString('fr-FR')})</span>`
            : ['carte','barreRouge','divers','doc','devis'].includes(t)
              ? ''
              : ' — <span class="muted">Date non renseignée</span>'
        }
      </div>`;
    }

    s += '</section>';
  }

  return s + filterButton(m) + `
    <p class="muted">Accès valable 8 heures sur cet équipement.</p>
  `;
}

function filterPage(m) {
  const data = filters[m.id];

  if (!data) {
    return page(m, `
      <h2>🔧 Filtres</h2>
      <div class="box">
        <p>La fiche de filtration de cet engin n'est pas présente dans le document source fourni.</p>
        <p class="muted">Aucune référence n'a été ajoutée lorsqu'elle n'était pas documentée.</p>
      </div>
      <p><a href="/machine/${m.id}">← Retour aux documents</a></p>
    `);
  }

  const rows = (data.filters || []).map(([fn, ref]) => `
    <tr>
      <td><strong>${esc(fn)}</strong></td>
      <td>${esc(ref)}</td>
    </tr>
  `).join('');

  return page(m, `
    <div class="box">
      <h2>🔧 Filtres</h2>
      <p><strong>${esc(data.source_label || m.name)}</strong></p>
      ${data.source_note ? `<p class="muted">${esc(data.source_note)}</p>` : ''}

      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;margin-top:18px">
          <thead>
            <tr>
              <th style="text-align:left;padding:10px;border-bottom:2px solid #ddd">Fonction</th>
              <th style="text-align:left;padding:10px;border-bottom:2px solid #ddd">Référence</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      ${data.adblue ? `<p style="margin-top:15px"><strong>AdBlue :</strong> ${esc(data.adblue)}</p>` : ''}
      ${data.note ? `<p class="muted" style="margin-top:15px"><strong>⚠️ Remarque :</strong> ${esc(data.note)}</p>` : ''}
    </div>

    <p style="margin-top:20px">
      <a href="/machine/${m.id}">← Retour aux documents</a>
    </p>
  `);
}

export default async (req, context) => {
  const id = String(context.params?.id || '').toUpperCase();
  const m = MACHINES[id];

  if (!m) return html('<h1>Matériel introuvable</h1>', 404);

  const cookies = parseCookies(req);

  if (validToken(cookies.PARC_AUTH, id)) {
    const items = await loadItems(id);
    return html(page(m, docs(m, items)), 200, { 'Set-Cookie': cookie(id) });
  }

  if (req.method === 'POST') {
    const fd = await req.formData();
    const password = String(fd.get('password') || '');

    if (password === (process.env.PARC_PASSWORD || '')) {
      const items = await loadItems(id);
      return html(page(m, docs(m, items)), 200, { 'Set-Cookie': cookie(id) });
    }

    return html(
      page(m, `<p class="bad">Mot de passe incorrect.</p>${login(m)}`),
      401
    );
  }

  return html(login(m));
};
