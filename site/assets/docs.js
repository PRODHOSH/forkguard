// forkguard docs. Progressive enhancement only: every page reads fine without this file.
document.documentElement.classList.add('js');

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const ROOT = $('script[data-root]')?.dataset.root ?? './';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode: the choice just is not remembered */ } },
};

/* ---------- Comfort: flip every section at once, or one at a time ---------- */
// A switch like the one in the CS50 manual. Off = comfortable (the default). On = the short manual-page text.
const sectionSwitches = $$('.man .sw');
const globalSwitches = $$('.global-switch .sw');
function applyComfort(less, remember = true) {
  for (const sw of sectionSwitches) sw.checked = less;
  for (const sw of globalSwitches) sw.checked = less;
  if (remember) store.set('forkguard-comfort', less ? 'less' : 'more');
}
if (sectionSwitches.length) {
  if (store.get('forkguard-comfort') === 'less') applyComfort(true, false);
  for (const sw of globalSwitches) sw.addEventListener('change', () => applyComfort(sw.checked));
  for (const sw of sectionSwitches) {
    // keep the header switch honest when sections are flipped one by one
    sw.addEventListener('change', () => { const all = sectionSwitches.every((s) => s.checked); for (const g of globalSwitches) g.checked = all; });
  }
}

/* ---------- Copy buttons (Invoker Commands, with a click fallback) ---------- */
let lastMessage = '';
const timers = new WeakMap();
function report(button, ok) {
  const tip = button.nextElementSibling;
  clearTimeout(timers.get(button));
  button.removeAttribute('data-copied');
  button.removeAttribute('data-failed');
  let message = ok ? 'Copied' : 'Copy failed';
  if (message === lastMessage) message += ' '; // VoiceOver skips an identical repeat
  lastMessage = message;
  tip.textContent = '';
  void button.offsetWidth;
  button.setAttribute(ok ? 'data-copied' : 'data-failed', '');
  requestAnimationFrame(() => { tip.textContent = message; });
  timers.set(button, setTimeout(() => {
    button.removeAttribute('data-copied');
    button.removeAttribute('data-failed');
    tip.textContent = '';
  }, 2000));
}
function legacyCopy(text) {
  const field = Object.assign(document.createElement('textarea'), { value: text });
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0';
  document.body.append(field);
  field.select();
  try { return document.execCommand('copy'); } finally { field.remove(); }
}
async function copy(button, target) {
  const text = target.matches('input, textarea') ? target.value : target.innerText.trim();
  if (!text) return;
  try {
    try { await navigator.clipboard.writeText(text); } catch { if (!legacyCopy(text)) throw new Error('Copy failed'); }
    report(button, true);
  } catch {
    report(button, false);
  }
}
if ('CommandEvent' in window) {
  // `command` events do not bubble, so listen in the capture phase.
  document.addEventListener('command', (e) => { if (e.command === '--copy') copy(e.source, e.target); }, true);
} else {
  document.addEventListener('click', (e) => {
    const button = e.target.closest('button[command="--copy"]');
    const target = button && document.getElementById(button.getAttribute('commandfor'));
    if (target) copy(button, target);
  });
}

/* ---------- Sidebar ---------- */
const side = $('#side');
if (side) {
  side.addEventListener('click', (e) => { if (e.target.closest('a') && side.matches(':popover-open')) side.hidePopover(); });
  $('[aria-current="page"]', side)?.scrollIntoView({ block: 'center' });
}

/* ---------- On this page: highlight the section being read ---------- */
const tocLinks = new Map($$('.toc a').map((a) => [a.getAttribute('href').slice(1), a]));
if ('IntersectionObserver' in window && tocLinks.size) {
  const spy = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const a of tocLinks.values()) a.removeAttribute('aria-current');
      tocLinks.get(entry.target.id)?.setAttribute('aria-current', 'true');
    }
  }, { rootMargin: '-72px 0px -70% 0px' });
  for (const id of tocLinks.keys()) { const el = document.getElementById(id); if (el) spy.observe(el.closest('.man') ?? el); }
}

/* ---------- Search ---------- */
const dialog = $('#search');
const input = $('#q');
const list = $('#results');
const hint = $('#search-hint');
let index = null;
let active = -1;

const words = (s) => s.toLowerCase().split(/[^a-z0-9._-]+/).filter(Boolean);
async function loadIndex() {
  if (index) return index;
  try {
    const res = await fetch(`${ROOT}search-index.json`);
    index = (await res.json()).map((e) => ({ ...e, hay: `${e.t} ${e.p} ${e.x}`.toLowerCase(), title: e.t.toLowerCase(), page: e.p.toLowerCase() }));
  } catch {
    index = [];
    hint.textContent = 'Search could not load. Use the sidebar instead.';
  }
  return index;
}
function score(entry, tokens) {
  let s = 0;
  for (const t of tokens) {
    if (!entry.hay.includes(t)) return 0;
    if (entry.title === t) s += 30;
    if (entry.title.includes(t)) s += 12;
    if (entry.page.includes(t)) s += 4;
    s += 1;
  }
  if (tokens.length > 1 && entry.hay.includes(tokens.join(' '))) s += 20; // the whole phrase, in order
  return s;
}
function highlight(el, text, tokens) {
  if (!tokens.length) { el.textContent = text; return; }
  const re = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  text.split(re).forEach((part, i) => {
    if (i % 2) { const m = document.createElement('mark'); m.textContent = part; el.append(m); } else el.append(part);
  });
}
function snippet(text, tokens) {
  const lower = text.toLowerCase();
  const at = tokens.map((t) => lower.indexOf(t)).filter((n) => n >= 0).sort((a, b) => a - b)[0] ?? 0;
  const from = Math.max(0, at - 50);
  return (from ? '…' : '') + text.slice(from, from + 150) + (text.length > from + 150 ? '…' : '');
}
function setActive(n) {
  const items = $$('#results a');
  active = items.length ? (n + items.length) % items.length : -1;
  items.forEach((a, i) => a.setAttribute('aria-selected', String(i === active)));
  if (active >= 0) { input.setAttribute('aria-activedescendant', items[active].id); items[active].scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
}
async function runSearch() {
  const tokens = words(input.value);
  list.replaceChildren();
  input.setAttribute('aria-expanded', 'false');
  if (!tokens.length) { hint.textContent = 'Type to search. Use the arrow keys and Enter.'; active = -1; return; }
  const data = await loadIndex();
  const hits = data.map((e) => [score(e, tokens), e]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 12);
  hint.textContent = hits.length ? `${hits.length} result${hits.length === 1 ? '' : 's'}` : `Nothing found for “${input.value.trim()}”.`;
  hits.forEach(([, e], i) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = ROOT + e.u;
    a.id = `r${i}`;
    a.setAttribute('role', 'option');
    const title = document.createElement('span');
    title.className = 'r-title';
    highlight(title, e.t, tokens);
    const page = document.createElement('span');
    page.className = 'r-page';
    page.textContent = e.p === e.t ? '' : `  ·  ${e.p}`;
    title.append(page);
    const snip = document.createElement('span');
    snip.className = 'r-snip';
    highlight(snip, snippet(e.x, tokens), tokens);
    a.append(title, snip);
    li.append(a);
    list.append(li);
  });
  if (hits.length) input.setAttribute('aria-expanded', 'true');
  setActive(0);
}
function openSearch() {
  if (!dialog || dialog.open) return;
  dialog.showModal();
  input.select();
  loadIndex();
  if (input.value) runSearch();
}
if (dialog && input) {
  $('#open-search')?.addEventListener('click', openSearch);
  $('#close-search')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // click on the backdrop
  dialog.addEventListener('close', () => { input.setAttribute('aria-expanded', 'false'); });
  input.addEventListener('input', runSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') { const a = $$('#results a')[active]; if (a) { e.preventDefault(); location.href = a.href; } }
  });
  list.addEventListener('click', () => dialog.close());
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '') || document.activeElement?.isContentEditable;
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); openSearch(); }
    else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); openSearch(); }
  });
}
