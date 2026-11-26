// forkguard pushes: who force-pushed to your repos, and when. This malware spreads by taking the
// newest commit, adding its payload and force-pushing it back with your name and the old date, so a
// force-push you did not make is the clearest sign that a login of yours is in someone else's hands.
import { api } from './pr.js';
import { listMine } from './remote.js';
import { getToken, loginHelp } from './auth.js';

/** GitHub's activity items for one repo, as plain events. Pure, so it can be tested. */
export function toEvents(repo, items) {
  return (items || []).map((a) => ({
    repo,
    when: a.timestamp,
    type: a.activity_type,
    branch: String(a.ref || '').replace(/^refs\/heads\//, ''),
    before: String(a.before || '').slice(0, 7),
    after: String(a.after || '').slice(0, 7),
    actor: a.actor?.login || 'unknown',
  }));
}

/**
 * Groups events that happened close together across several repos. One person pushes to one repo at
 * a time. A script going through your repos pushes to many within minutes, a few seconds apart.
 */
export function findWaves(events, { gapMinutes = 10, minRepos = 3 } = {}) {
  const sorted = [...events].sort((a, b) => a.when.localeCompare(b.when));
  const waves = [];
  let current = [];
  const flush = () => {
    if (new Set(current.map((e) => e.repo)).size >= minRepos) waves.push(current);
    current = [];
  };
  for (const e of sorted) {
    const last = current[current.length - 1];
    if (last && Date.parse(e.when) - Date.parse(last.when) > gapMinutes * 60 * 1000) flush();
    current.push(e);
  }
  flush();
  return waves;
}

async function activity(repo, type, since) {
  const items = await api(`/repos/${repo}/activity?per_page=50&activity_type=${type}&time_period=${since}`).catch(() => []);
  return toEvents(repo, Array.isArray(items) ? items : []);
}

/** Force-pushes and deleted branches on your repos in the last few days. */
export async function checkPushes({ repos, days = 3, json = false, c }) {
  if (!getToken()) throw new Error(`You are not logged in to GitHub yet.\n\n${loginHelp()}`);
  const names = repos?.length ? repos : (await listMine()).filter((r) => !r.archived).map((r) => r.name);
  const period = days <= 1 ? 'day' : days <= 7 ? 'week' : 'month';
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  if (!json) console.log(`${c.bold('forkguard')}  force-pushes and deleted branches on ${names.length} repo${names.length === 1 ? '' : 's'}, last ${days} day${days === 1 ? '' : 's'}\n`);

  const events = [];
  let next = 0;
  const worker = async () => {
    while (next < names.length) {
      const repo = names[next++];
      for (const type of ['force_push', 'branch_deletion']) events.push(...(await activity(repo, type, period)));
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, names.length) }, worker));
  const recent = events.filter((e) => Date.parse(e.when) >= cutoff).sort((a, b) => b.when.localeCompare(a.when));
  const waves = findWaves(recent);
  const result = { days, events: recent, waves: waves.length };

  if (json) return result;
  if (!recent.length) {
    console.log(`  ${c.green('No force-pushes or deleted branches.')}`);
    return result;
  }
  const local = (iso) => new Date(iso).toLocaleString();
  const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const repoW = Math.min(36, Math.max(...recent.map((e) => e.repo.length)) + 2);
  for (const e of recent) {
    const what = e.type === 'force_push' ? `force-push ${e.before} to ${e.after}` : 'branch deleted';
    console.log(`  ${c.dim(local(e.when).padEnd(24))}${clip(e.repo, repoW - 2).padEnd(repoW)}${clip(e.branch, 26).padEnd(28)}${what}  ${c.dim(`by ${e.actor}`)}`);
  }
  console.log('');
  const actors = [...new Set(recent.map((e) => e.actor))];
  if (waves.length) {
    console.log(`  ${c.red(`${waves.length} wave${waves.length === 1 ? '' : 's'}`)}: force-pushes to several repos within minutes of each other. That is a script, not a person.`);
    console.log(`  Everything above is shown as ${actors.join(', ')}. If you did not do it, a login or token of yours is being used somewhere else.`);
    console.log(`  Revoke your tokens and sessions (github.com/settings), then run ${c.cyan('forkguard host')} on each of your computers.`);
  } else {
    console.log(c.dim(`  ${recent.length} event${recent.length === 1 ? '' : 's'}, no sign of a script. If any were not you, treat your login as exposed.`));
  }
  return result;
}
