// Tiny block DSL and renderers for the docs. Zero dependencies.
// One source of truth: the same blocks become HTML, Markdown (for llms files) and plain text (for search).

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const slugify = (s) => s.toLowerCase().replace(/`/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ---- block constructors ----
export const p = (text) => ({ t: 'p', text });
export const h2 = (text, id) => ({ t: 'h', level: 2, text, id: id || slugify(text) });
export const h3 = (text, id) => ({ t: 'h', level: 3, text, id: id || slugify(text) });
export const code = (text, lang = 'bash') => ({ t: 'code', text: text.replace(/^\n|\n$/g, ''), lang });
export const out = (text) => ({ t: 'code', text: text.replace(/^\n|\n$/g, ''), lang: 'text', output: true });
export const ul = (...items) => ({ t: 'ul', items });
export const ol = (...items) => ({ t: 'ol', items });
export const table = (head, rows) => ({ t: 'table', head, rows });
export const note = (text) => ({ t: 'note', kind: 'Note', text });
export const warn = (text) => ({ t: 'note', kind: 'Warning', text });
export const tip = (text) => ({ t: 'note', kind: 'Tip', text });
export const dl = (...pairs) => ({ t: 'dl', pairs });
export const flow = (...steps) => ({ t: 'flow', steps });
export const profile = (o) => ({ t: 'profile', ...o });
export const brand = () => ({ t: 'brand' });
// [title, description, link] rows. `path` is a numbered journey, `tasks` is a list of quick jumps.
export const path = (...items) => ({ t: 'path', items });
export const tasks = (...items) => ({ t: 'tasks', items });

// ---- inline markup: `code`, **bold**, [text](url). Links to other pages are written page:<slug>. ----
const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
export function inlineHtml(s, link) {
  let out = '', last = 0, m;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(s))) {
    out += esc(s.slice(last, m.index));
    if (m[1] !== undefined) out += `<code>${esc(m[1])}</code>`;
    else if (m[2] !== undefined) out += `<strong>${esc(m[2])}</strong>`;
    else { const href = link(m[4]); out += `<a href="${esc(href)}">${esc(m[3])}</a>`; }
    last = INLINE.lastIndex;
  }
  return out + esc(s.slice(last));
}
export function inlineMd(s, abs) {
  return s.replace(INLINE, (all, c, b, t, u) => (c !== undefined ? '`' + c + '`' : b !== undefined ? '**' + b + '**' : `[${t}](${abs(u)})`));
}
export const inlineText = (s) => s.replace(INLINE, (all, c, b, t) => c ?? b ?? t);

// ---- HTML ----
const copyBtn = (id) => `<span class="copy"><button type="button" class="copy-button" command="--copy" commandfor="${id}" aria-label="Copy this code"><svg class="icon-copy" width="16" height="16" aria-hidden="true" focusable="false"><use href="#i-copy"/></svg><svg class="icon-check" width="16" height="16" aria-hidden="true" focusable="false"><use href="#i-check"/></svg></button><span class="tip" role="status"></span></span>`;

export function blocksHtml(blocks, ctx) {
  const L = (s) => inlineHtml(s, ctx.link);
  return blocks.map((b) => {
    switch (b.t) {
      case 'p': return `<p>${L(b.text)}</p>`;
      case 'h': {
        const id = ctx.uniqueId(b.id);
        ctx.toc.push({ level: b.level, text: inlineText(b.text), id });
        return `<h${b.level} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${L(b.text)}</h${b.level}>`;
      }
      case 'code': {
        const id = ctx.uniqueId('c');
        return `<figure class="code${b.output ? ' is-output' : ''}">${b.output ? '<figcaption>Output</figcaption>' : ''}<pre tabindex="0"><code id="${id}">${esc(b.text)}</code></pre>${b.output ? '' : copyBtn(id)}</figure>`;
      }
      case 'ul': return `<ul>${b.items.map((i) => `<li>${L(i)}</li>`).join('')}</ul>`;
      case 'ol': return `<ol>${b.items.map((i) => `<li>${L(i)}</li>`).join('')}</ol>`;
      case 'table': return `<div class="table-wrap" tabindex="0" role="region" aria-label="Table"><table><thead><tr>${b.head.map((h) => `<th scope="col">${L(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${L(c)}</th>` : `<td>${L(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
      case 'note': return `<aside class="note note-${b.kind.toLowerCase()}"><p class="note-label">${b.kind}</p><p>${L(b.text)}</p></aside>`;
      case 'dl': return `<dl>${b.pairs.map(([t, d]) => `<div><dt>${L(t)}</dt><dd>${L(d)}</dd></div>`).join('')}</dl>`;
      case 'flow': return `<ol class="flow">${b.steps.map((s) => `<li>${L(s)}</li>`).join('')}</ol>`;
      case 'brand': return `<div class="brand-hero"><picture><source media="(prefers-color-scheme: dark)" srcset="${ctx.asset('assets/brand/logo-on-dark.svg')}"><img src="${ctx.asset('assets/brand/logo.svg')}" alt="forkguard" width="${ctx.logo.w}" height="${ctx.logo.h}"></picture></div>`;
      case 'path': return `<ol class="path">${b.items.map(([t, d, l], i) => `<li><a href="${esc(ctx.link(l))}"><span class="path-n" aria-hidden="true">${i + 1}</span><span class="path-t">${esc(t)}</span><span class="path-d">${esc(d)}</span><span class="path-go" aria-hidden="true">→</span></a></li>`).join('')}</ol>`;
      case 'tasks': return `<ul class="tasks">${b.items.map(([t, d, l]) => `<li><a href="${esc(ctx.link(l))}"><span class="task-t">${esc(t)}</span><span class="task-d">${esc(d)}</span><span class="task-go" aria-hidden="true">→</span></a></li>`).join('')}</ul>`;
      case 'profile': return `<div class="profile"><img src="${ctx.asset(b.img)}" alt="${esc(b.alt)}" width="96" height="96" loading="lazy"><div><p class="profile-name">${esc(b.name)}</p><p>${L(b.bio)}</p><ul class="profile-links">${b.links.map(([t, u]) => `<li><a href="${esc(u)}">${esc(t)}</a></li>`).join('')}</ul></div></div>`;
      default: throw new Error(`unknown block ${b.t}`);
    }
  }).join('\n');
}

// ---- Markdown (for the .md copies and llms-full.txt) ----
export function blocksMd(blocks, abs) {
  const M = (s) => inlineMd(s, abs);
  return blocks.map((b) => {
    switch (b.t) {
      case 'p': return M(b.text);
      case 'h': return `${'#'.repeat(b.level)} ${M(b.text)}`;
      case 'code': return '```' + (b.lang === 'text' ? 'text' : b.lang) + '\n' + b.text + '\n```';
      case 'ul': return b.items.map((i) => `- ${M(i)}`).join('\n');
      case 'ol': return b.items.map((i, n) => `${n + 1}. ${M(i)}`).join('\n');
      case 'table': return [`| ${b.head.map(M).join(' | ')} |`, `| ${b.head.map(() => '---').join(' | ')} |`, ...b.rows.map((r) => `| ${r.map((c) => M(c).replace(/\|/g, '\\|')).join(' | ')} |`)].join('\n');
      case 'note': return `> **${b.kind}:** ${M(b.text)}`;
      case 'dl': return b.pairs.map(([t, d]) => `- ${M(t)}: ${M(d)}`).join('\n');
      case 'flow': return b.steps.map((s, n) => `${n + 1}. ${M(s)}`).join('\n');
      case 'brand': return '';
      case 'path': case 'tasks': return b.items.map(([t, d, l], i) => `${b.t === 'path' ? i + 1 + '.' : '-'} [${t}](${abs(l)}): ${d}`).join('\n');
      case 'profile': return `**${b.name}**: ${M(b.bio)}\n\n${b.links.map(([t, u]) => `- [${t}](${u})`).join('\n')}`;
      default: throw new Error(`unknown block ${b.t}`);
    }
  }).filter((x) => x !== '').join('\n\n');
}

// ---- plain text (for search) ----
export function blocksText(blocks) {
  return blocks.map((b) => {
    switch (b.t) {
      case 'p': return inlineText(b.text);
      case 'h': return inlineText(b.text);
      case 'code': return b.text;
      case 'ul': case 'ol': case 'flow': return (b.items || b.steps).map(inlineText).join(' ');
      case 'table': return [...b.head, ...b.rows.flat()].map(inlineText).join(' ');
      case 'note': return inlineText(b.text);
      case 'dl': return b.pairs.map(([t, d]) => inlineText(t) + ' ' + inlineText(d)).join(' ');
      case 'path': case 'tasks': return b.items.map(([t, d]) => t + ' ' + d).join(' ');
      case 'profile': return b.name + ' ' + inlineText(b.bio);
      default: return '';
    }
  }).join(' ').replace(/\s+/g, ' ').trim();
}
