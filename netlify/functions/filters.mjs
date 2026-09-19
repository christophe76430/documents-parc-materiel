import { MACHINES, html, esc } from './_shared.mjs';
import filters from '../../filters.json' with { type: 'json' };

export const config = { path: '/filters/:id' };

function page(m, content) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Filtres — ${esc(m.name)}</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<main>
<h1>🔧 Filtres — ${esc(m.name)}</h1>
${content}
</main>
</body>
</html>`;
}

export default async (req, context) => {
  const id = String(context.params?.id || '').toUpperCase();
  const m = MACHINES[id];

  if (!m) return html('<h1>Matériel introuvable</h1>', 404);

  const data = filters[id];

  if (!data) {
    return html(page(m, `
      <div class="box">
        <p>La fiche de filtration de cet engin n'est pas présente dans le document source fourni.</p>
        <p class="muted">Aucune référence n'a été ajoutée lorsqu'elle n'était pas documentée.</p>
      </div>
      <p><a href="/machine/${m.id}">← Retour aux documents</a></p>
    `));
  }

  const rows = (data.filters || []).map(([fn, ref]) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #ddd"><strong>${esc(fn)}</strong></td>
      <td style="padding:10px;border-bottom:1px solid #ddd">${esc(ref)}</td>
    </tr>
  `).join('');

  return html(page(m, `
    <div class="box">
      <h2>Références de filtration</h2>
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
  `));
};
