#!/usr/bin/env node
// Builds the documentation site into ../site from the pages in ./docs/pages.
// No dependencies.   node tools/build-docs.mjs            (SITE_URL=https://example.com to set the public URL)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blocksHtml, blocksMd, blocksText, esc, inlineHtml, inlineMd, inlineText } from './docs/lib.mjs';
import { start } from './docs/pages/start.mjs';
import { commands } from './docs/pages/commands.mjs';
import { reference } from './docs/pages/reference.mjs';
import { guides } from './docs/pages/guides.mjs';
import { internals } from './docs/pages/internals.mjs';
import { NEXT } from './docs/next.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const OUT = path.join(ROOT, 'site');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const SITE_URL = (process.env.SITE_URL || 'https://forkguard.pages.dev').replace(/\/+$/, '');
const BASE_PATH = new URL(SITE_URL).pathname.replace(/\/+$/, '');
const REPO = 'https://github.com/PRODHOSH/forkguard';
const TAGLINE = 'Catch malware hidden in a repo before you install or run it.';

// ---------------------------------------------------------------- pages
const tag = (pages, file) => pages.map((pg) => ({ ...pg, src: file }));
const ORDER = [
  '', 'install', 'quick-start',
  'commands/check', 'commands/check-repo', 'commands/mine', 'commands/fix', 'commands/pr', 'commands/setup', 'commands/agent',
  'reference/rules', 'reference/json', 'reference/options', 'reference/exit-codes', 'reference/environment',
  'guides/read-results', 'guides/cleaning', 'guides/before-you-clone', 'guides/automatic-protection', 'guides/github-action', 'guides/ai-agents', 'guides/troubleshooting',
  'internals/how-it-works', 'internals/safety', 'about',
];
const all = [...tag(start, 'start.mjs'), ...tag(commands, 'commands.mjs'), ...tag(reference, 'reference.mjs'), ...tag(guides, 'guides.mjs'), ...tag(internals, 'internals.mjs')];
const bySlug = new Map(all.map((pg) => [pg.slug, pg]));
const PAGES = ORDER.map((slug) => { const pg = bySlug.get(slug); if (!pg) throw new Error(`page missing: ${JSON.stringify(slug)}`); return pg; });
if (PAGES.length !== all.length) throw new Error('a page is not in ORDER');
const GROUPS = ['Start', 'Commands', 'Reference', 'Guides', 'Internals', 'About'];

const pageUrl = (slug) => `${SITE_URL}/${slug ? slug + '/' : ''}`;
const mdUrl = (slug) => `${SITE_URL}/${slug || 'index'}.md`;
const mdPath = (slug) => `${slug || 'index'}.md`;
const rootFor = (slug) => (slug ? '../'.repeat(slug.split('/').length) : './');

// ---------------------------------------------------------------- rendering
const logoDims = (() => {
  const vb = fs.readFileSync(path.join(OUT, 'assets/brand/logo.svg'), 'utf8').match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  return { w: vb[2], h: vb[3] };
})();

function makeCtx(slug, rootOverride) {
  const root = rootOverride ?? rootFor(slug);
  const ids = new Set();
  return {
    root,
    toc: [],
    uniqueId(base) { let id = base, n = 2; while (ids.has(id)) id = `${base}-${n++}`; ids.add(id); return id; },
    link(target) {
      if (target.startsWith('page:')) {
        const s = target.slice(5);
        if (!bySlug.has(s)) throw new Error(`broken page link: ${target} (in ${slug || 'index'})`);
        return `${root}${s ? s + '/' : ''}`;
      }
      return target;
    },
    asset: (p) => `${root}${p}`,
    logo: { w: Math.round(60 * logoDims.w / logoDims.h), h: 60 },
  };
}

const ICONS = `<svg class="sprite" aria-hidden="true" focusable="false">
<symbol id="i-copy" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
<symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></symbol>
<symbol id="i-github" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.9.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></symbol>
</svg>`;

function sectionHtml(sec, ctx) {
  const sub = { ...ctx, toc: [] };
  const comfy = blocksHtml(sec.comfy, sub);
  ctx.toc.push({ level: 2, text: sec.title.toUpperCase(), id: sec.id });
  if (!sec.terse) {
    return `<section class="man" id="${sec.id}"><header class="man-head"><h2><a class="anchor" href="#${sec.id}" aria-label="Link to this section">#</a>${esc(sec.title)}</h2></header><div class="view">${comfy}</div></section>`;
  }
  const terse = blocksHtml(sec.terse, { ...ctx, toc: [], uniqueId: (b) => ctx.uniqueId(b) });
  return `<section class="man" id="${sec.id}"><header class="man-head"><h2><a class="anchor" href="#${sec.id}" aria-label="Link to this section">#</a>${esc(sec.title)}</h2>
<label class="switch"><input type="checkbox" role="switch" class="sw"><span class="sw-track" aria-hidden="true"><span class="sw-knob"></span></span><span class="sw-label">Less comfortable</span></label></header>
<div class="view view-more">${comfy}</div><div class="view view-less">${terse}</div></section>`;
}

function sidebarHtml(current, ctx, extra = '') {
  return `<nav id="side" class="side" popover aria-label="Documentation"><div class="side-inner">${extra}` + GROUPS.map((g) => {
    const items = PAGES.filter((pg) => pg.group === g);
    return `<div class="group"><p class="group-title">${g}</p><ul>${items.map((pg) => {
      const cur = pg.slug === current.slug ? ' aria-current="page"' : '';
      return `<li><a href="${ctx.root}${pg.slug ? pg.slug + '/' : ''}"${cur}>${esc(pg.nav)}${pg.status ? `<span class="badge">${esc(pg.status)}</span>` : ''}</a></li>`;
    }).join('')}</ul></div>`;
  }).join('') + `</div></nav>`;
}

function jsonLd(pg, url) {
  const crumbs = [{ '@type': 'ListItem', position: 1, name: 'forkguard docs', item: pageUrl('') }];
  if (pg.slug) { crumbs.push({ '@type': 'ListItem', position: 2, name: pg.group }); crumbs.push({ '@type': 'ListItem', position: 3, name: pg.title, item: url }); }
  const graph = [
    { '@type': 'BreadcrumbList', itemListElement: crumbs },
    pg.slug
      ? { '@type': 'TechArticle', headline: pg.title, description: pg.description, url, inLanguage: 'en', author: { '@type': 'Person', name: 'Prodhosh V.S', url: 'https://prodhosh.me' }, publisher: { '@type': 'Organization', name: 'forkguard', logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/brand/favicon.svg` } }, isPartOf: { '@type': 'WebSite', name: 'forkguard documentation', url: pageUrl('') } }
      : { '@type': 'WebSite', name: 'forkguard documentation', url: pageUrl(''), description: pg.description, inLanguage: 'en' },
  ];
  if (!pg.slug) graph.push({ '@type': 'SoftwareApplication', name: 'forkguard', applicationCategory: 'SecurityApplication', operatingSystem: 'Windows, macOS, Linux', softwareVersion: pkg.version, description: TAGLINE, url: REPO, license: 'https://opensource.org/licenses/MIT', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, author: { '@type': 'Person', name: 'Prodhosh V.S', url: 'https://prodhosh.me' } });
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
}

function pageHtml(pg, idx) {
  const ctx = makeCtx(pg.slug);
  const url = pageUrl(pg.slug);
  const isMan = pg.kind === 'command';
  let body = isMan ? pg.sections.map((s) => sectionHtml(s, ctx)).join('\n') : blocksHtml(pg.blocks, ctx);
  const next = NEXT[pg.slug];
  if (next) {
    ctx.toc.push({ level: 2, text: isMan ? 'WHERE TO NEXT' : 'Where to next', id: 'where-to-next' });
    body += `\n<section class="next-steps" id="where-to-next" aria-labelledby="next-h"><h2 id="next-h">Where to next</h2>${blocksHtml([{ t: 'tasks', items: next }], ctx)}</section>`;
  }
  const toc = ctx.toc.filter((t) => (isMan ? true : t.level <= 3));
  const prev = PAGES[idx - 1], nextPage = PAGES[idx + 1];
  const title = pg.slug ? `${pg.title} · forkguard docs` : 'forkguard documentation: catch malware hidden in a repo';
  const crumbs = pg.slug ? `<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="${ctx.root}">Docs</a></li><li>${esc(pg.group)}</li></ol></nav>` : '';
  const pager = `<nav class="pager" aria-label="Previous and next page">${prev ? `<a class="prev" href="${ctx.root}${prev.slug ? prev.slug + '/' : ''}" rel="prev"><span>Previous</span>${esc(prev.nav)}</a>` : '<span></span>'}${nextPage ? `<a class="next" href="${ctx.root}${nextPage.slug ? nextPage.slug + '/' : ''}" rel="next"><span>Next</span>${esc(nextPage.nav)}</a>` : '<span></span>'}</nav>`;
  const globalSwitch = (cls) => `<label class="switch global-switch ${cls}" title="Show every section as a short manual page"><input type="checkbox" role="switch" class="sw"><span class="sw-track" aria-hidden="true"><span class="sw-knob"></span></span><span class="sw-label">Less comfortable</span></label>`;
  const comfort = isMan ? globalSwitch('top-switch') : '';
  const sideComfort = isMan ? globalSwitch('side-switch') : '';
  const tocHtml = toc.length > 1 ? `<aside class="toc" aria-label="On this page"><p class="toc-title">On this page</p><ul>${toc.map((t) => `<li class="l${t.level}"><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ul></aside>` : '<aside class="toc" aria-hidden="true"></aside>';
  const mobileToc = toc.length > 2 ? `<details class="mobile-toc"><summary>On this page</summary><ul>${toc.map((t) => `<li class="l${t.level}"><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ul></details>` : '';
  const logoRoot = ctx.root;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(pg.description)}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)">
<meta name="author" content="Prodhosh V.S">
<link rel="canonical" href="${url}">
<link rel="alternate" type="text/markdown" href="${mdUrl(pg.slug)}">
<link rel="sitemap" type="application/xml" href="${SITE_URL}/sitemap.xml">
<meta property="og:type" content="${pg.slug ? 'article' : 'website'}">
<meta property="og:site_name" content="forkguard docs">
<meta property="og:title" content="${esc(pg.slug ? pg.title + ' · forkguard docs' : 'forkguard documentation')}">
<meta property="og:description" content="${esc(pg.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE_URL}/assets/social.png">
<meta property="og:image:width" content="1280">
<meta property="og:image:height" content="640">
<meta property="og:image:alt" content="forkguard documentation: ${esc(TAGLINE)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE_URL}/assets/social.png">
<link rel="icon" href="${logoRoot}assets/brand/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${logoRoot}favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="${logoRoot}apple-touch-icon.png">
<link rel="preload" href="${logoRoot}assets/fonts/manrope.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${logoRoot}assets/docs.css">
<script type="application/ld+json">${jsonLd(pg, url)}</script>
<script type="module" src="${logoRoot}assets/docs.js" data-root="${logoRoot}"></script>
</head>
<body>
${ICONS}
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="top-inner">
    <button class="icon-btn menu-btn" type="button" popovertarget="side" popovertargetaction="toggle" aria-controls="side" aria-label="Menu"><svg width="20" height="20" aria-hidden="true" focusable="false"><use href="#i-menu"/></svg></button>
    <a class="brand" href="${ctx.root}" aria-label="forkguard documentation, home"><picture><source media="(prefers-color-scheme: dark)" srcset="${logoRoot}assets/brand/logo-on-dark.svg"><img src="${logoRoot}assets/brand/logo.svg" alt="forkguard" width="${Math.round(30 * logoDims.w / logoDims.h)}" height="30"></picture><span class="brand-sub">docs</span></a>
    <div class="top-actions">
      <button class="search-btn js-only" type="button" id="open-search" aria-keyshortcuts="/ Control+K Meta+K"><svg width="16" height="16" aria-hidden="true" focusable="false"><use href="#i-search"/></svg><span>Search</span><kbd>/</kbd></button>
      ${comfort}
      <a class="icon-link" href="${REPO}" aria-label="forkguard on GitHub"><svg width="20" height="20" aria-hidden="true" focusable="false"><use href="#i-github"/></svg></a>
    </div>
  </div>
</header>
<div class="shell">
${sidebarHtml(pg, ctx, sideComfort)}
<main id="main" class="doc">
${crumbs}
${pg.slug ? '' : blocksHtml([{ t: 'brand' }], ctx)}
<h1>${esc(pg.title)}${pg.status ? `<span class="badge badge-lg">${esc(pg.status)}</span>` : ''}</h1>
<p class="lede">${inlineHtml(pg.lede, ctx.link)}</p>
${mobileToc}
${body}
${pager}
<p class="doc-foot"><a href="${REPO}/edit/main/tools/docs/pages/${pg.src}">Edit this page on GitHub</a> <span aria-hidden="true">·</span> <a href="${ctx.root}${mdPath(pg.slug)}">View as Markdown</a></p>
</main>
${tocHtml}
</div>
<footer class="foot">
  <p>forkguard ${esc(pkg.version)} · MIT license · <a href="${REPO}">GitHub</a> · <a href="https://www.npmjs.com/package/forkguard">npm</a> · <a href="${ctx.root}about/">About</a></p>
</footer>
<dialog id="search" class="search" aria-label="Search the documentation">
  <div class="search-box"><svg width="18" height="18" aria-hidden="true" focusable="false"><use href="#i-search"/></svg><input id="q" type="search" placeholder="Search the docs" autocomplete="off" autocapitalize="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="results" aria-autocomplete="list"><button type="button" class="esc" id="close-search" aria-label="Close search">Esc</button></div>
  <ul id="results" role="listbox" aria-label="Search results"></ul>
  <p class="search-hint" id="search-hint">Type to search. Use the arrow keys and Enter.</p>
</dialog>
</body>
</html>
`;
}

// ---------------------------------------------------------------- markdown (per page, and llms-full)
function pageMd(pg, { withHeading = true } = {}) {
  const abs = (u) => (u.startsWith('page:') ? pageUrl(u.slice(5)) : u.startsWith('#') ? `${pageUrl(pg.slug)}${u}` : u);
  const parts = [];
  if (withHeading) parts.push(`# ${pg.title}`, `> ${inlineMd(pg.lede, abs)}`);
  if (pg.kind === 'command') {
    for (const s of pg.sections) parts.push(`## ${s.title}`, blocksMd(s.comfy, abs));
  } else parts.push(blocksMd(pg.blocks, abs));
  if (NEXT[pg.slug]) parts.push('## Where to next', blocksMd([{ t: 'tasks', items: NEXT[pg.slug] }], abs));
  return parts.join('\n\n') + '\n';
}

// ---------------------------------------------------------------- search index
function searchEntries(pg) {
  const url = pageUrl(pg.slug).replace(SITE_URL + '/', '');
  const entries = [{ p: pg.group, t: pg.title, u: url, x: `${pg.description}` }];
  const flush = (cur) => { if (cur && cur.x.trim()) entries.push({ p: pg.title, t: cur.t, u: `${url}#${cur.id}`, x: cur.x.replace(/\s+/g, ' ').trim().slice(0, 700) }); };
  if (pg.kind === 'command') {
    for (const s of pg.sections) entries.push({ p: pg.title, t: s.title, u: `${url}#${s.id}`, x: blocksText(s.comfy).slice(0, 700) + ' ' + (s.terse ? blocksText(s.terse).slice(0, 200) : '') });
  } else {
    let cur = null;
    const seen = new Set();
    for (const b of pg.blocks) {
      if (b.t === 'h' && b.level === 2) { flush(cur); let id = b.id, n = 2; while (seen.has(id)) id = `${b.id}-${n++}`; seen.add(id); cur = { t: inlineText(b.text), id, x: '' }; }
      else if (cur) cur.x += ' ' + (b.t === 'h' ? inlineText(b.text) : blocksText([b]));
    }
    flush(cur);
  }
  return entries;
}

// ---------------------------------------------------------------- write
const write = (rel, content) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };

// remove everything generated by a previous run (never assets/ or the root icons)
for (const d of ['commands', 'reference', 'guides', 'internals', 'about', 'install', 'quick-start']) fs.rmSync(path.join(OUT, d), { recursive: true, force: true });
for (const f of ['index.html', 'index.md', 'sitemap.xml', 'robots.txt', 'llms.txt', 'llms-full.txt', 'search-index.json', '404.html']) fs.rmSync(path.join(OUT, f), { force: true });

PAGES.forEach((pg, i) => {
  write(`${pg.slug ? pg.slug + '/' : ''}index.html`, pageHtml(pg, i));
  write(mdPath(pg.slug), pageMd(pg));
});

// 404 (absolute paths from the site's base path, because it is served from any URL)
{
  const base = `${BASE_PATH}/`;
  const home = PAGES[0];
  let html = pageHtml({ ...home, slug: '', title: 'Page not found', lede: 'That page does not exist. Try the search, or start from the overview.', description: 'Page not found.', kind: 'doc', blocks: [{ t: 'ul', items: ['[Overview](page:)', '[Install](page:install)', '[Commands](page:commands/check)', '[What it catches](page:reference/rules)', '[Troubleshooting](page:guides/troubleshooting)'] }], status: '' }, 0);
  html = html.replace(/(href|src|srcset|data-root)="\.\/([^"]*)"/g, `$1="${base}$2"`).replace('<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">', '<meta name="robots" content="noindex">');
  write('404.html', html);
}

write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PAGES.map((pg) => `  <url>\n    <loc>${pageUrl(pg.slug)}</loc>\n    <changefreq>${pg.slug === '' ? 'weekly' : 'monthly'}</changefreq>\n    <priority>${pg.slug === '' ? '1.0' : pg.group === 'Commands' ? '0.9' : '0.7'}</priority>\n  </url>`).join('\n')}\n</urlset>\n`);

write('robots.txt', `# forkguard documentation\nUser-agent: *\nAllow: /\n\n# For language models: a short index and the full documentation as plain text\n# ${SITE_URL}/llms.txt\n# ${SITE_URL}/llms-full.txt\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

const SUMMARY = `forkguard is a free, open source, zero-dependency Node.js command line tool (Node 18+, MIT) that finds malware hidden in repositories before you install or run them. It targets the PolinRider campaign: code hidden after hundreds of blank spaces, rewritten commits, fake font files, VS Code tasks that run on folder open, and poisoned npm packages. It can check a folder, a GitHub repo (every branch, without writing its files to disk) or every repo you own, clean what it finds (restoring original files from git history), open a pull request with the fix, and check automatically before npm install and after git clone. Exit codes: 0 clean, 1 dangerous finding, 2 error. Current npm version: ${pkg.version}.`;

write('llms.txt', [
  '# forkguard',
  '',
  `> ${TAGLINE} Check a folder, a GitHub link or every repo you own, then clean what it finds and open a pull request.`,
  '',
  SUMMARY,
  '',
  ...GROUPS.flatMap((g) => [`## ${g}`, '', ...PAGES.filter((pg) => pg.group === g).map((pg) => `- [${pg.title}](${mdUrl(pg.slug)}): ${pg.description}`), '']),
  '## Optional',
  '',
  `- [Full documentation as one file](${SITE_URL}/llms-full.txt): every page, concatenated`,
  `- [Source code](${REPO}): GitHub repository`,
  `- [npm package](https://www.npmjs.com/package/forkguard): install with npm install -g forkguard`,
  '',
].join('\n'));

write('llms-full.txt', [
  '# forkguard documentation (full text)',
  '',
  `> ${TAGLINE}`,
  '',
  SUMMARY,
  '',
  `Site: ${SITE_URL}/  ·  Source: ${REPO}  ·  Version: ${pkg.version}`,
  '',
  ...PAGES.flatMap((pg) => ['---', '', `Source: ${pageUrl(pg.slug)}`, '', pageMd(pg)]),
].join('\n'));

write('search-index.json', JSON.stringify(PAGES.flatMap(searchEntries)));

write('_headers', `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'

/assets/*
  Cache-Control: public, max-age=86400

/*.md
  Content-Type: text/markdown; charset=utf-8

/llms.txt
  Content-Type: text/plain; charset=utf-8

/llms-full.txt
  Content-Type: text/plain; charset=utf-8
`);

console.log(`built ${PAGES.length} pages, sitemap, robots, llms.txt, llms-full.txt, search index → ${path.relative(process.cwd(), OUT) || '.'}`);
console.log(`public URL: ${SITE_URL}`);
