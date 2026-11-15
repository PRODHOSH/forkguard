// SPDX-License-Identifier: Apache-2.0
// Written for forkguard. The AI review itself (prompts, schemas, how answers are used) is derived from NVIDIA
// SkillSpector (https://github.com/NVIDIA/SkillSpector), Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. See NOTICE.
// Talks to an AI provider with plain fetch, so forkguard still has no dependencies. You bring the key:
// it is read from the environment, used for this run, never stored and never printed.

export const DEFAULT_MODELS = { anthropic: 'claude-sonnet-5-5', openai: 'gpt-5.4' };
// Waits between retries of a busy or unreachable provider. Tests set FORKGUARD_AI_RETRY_MS=0,0,0.
const retryDelays = () => (process.env.FORKGUARD_AI_RETRY_MS ?? '1000,3000,8000').split(',').map((n) => Math.max(0, Number(n) || 0));
const REQUEST_TIMEOUT_MS = 120_000;

/** Picks a provider from the environment, or says what is missing. */
export function resolveProvider(env = process.env, override = {}) {
  const want = (override.provider || env.FORKGUARD_AI_PROVIDER || '').toLowerCase();
  const model = override.model || env.FORKGUARD_AI_MODEL || '';
  const pick = want || (env.ANTHROPIC_API_KEY ? 'anthropic' : env.OPENAI_API_KEY ? 'openai' : env.FORKGUARD_AI_BASE_URL ? 'compatible' : '');
  if (!pick) return { error: 'no-provider' };
  if (pick === 'anthropic') {
    if (!(override.key || env.ANTHROPIC_API_KEY)) return { error: 'no-key', provider: 'anthropic' };
    return { provider: 'anthropic', label: 'Anthropic', model: model || DEFAULT_MODELS.anthropic, key: override.key || env.ANTHROPIC_API_KEY, baseUrl: (env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '') };
  }
  if (pick === 'openai') {
    if (!(override.key || env.OPENAI_API_KEY)) return { error: 'no-key', provider: 'openai' };
    return { provider: 'openai', label: 'OpenAI', model: model || DEFAULT_MODELS.openai, key: override.key || env.OPENAI_API_KEY, baseUrl: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '') };
  }
  if (pick === 'compatible' || pick === 'ollama' || pick === 'local') {
    const baseUrl = (env.FORKGUARD_AI_BASE_URL || (pick === 'ollama' ? 'http://localhost:11434/v1' : '')).replace(/\/+$/, '');
    if (!baseUrl) return { error: 'no-base-url', provider: 'compatible' };
    if (!model) return { error: 'no-model', provider: 'compatible' };
    let host = baseUrl;
    try { host = new URL(baseUrl).host; } catch { /* keep the text */ }
    return { provider: 'compatible', label: host, model, key: override.key || env.FORKGUARD_AI_API_KEY || '', baseUrl, local: /^(localhost|127\.|\[::1\])/.test(host) };
  }
  return { error: 'unknown-provider', provider: pick };
}

// Node 18 prints a notice the first time fetch is used. It is not useful here.
if (Number(process.versions.node.split('.')[0]) <= 18) {
  const emit = process.emitWarning;
  process.emitWarning = (w, ...rest) => (String(w?.message ?? w).includes('Fetch API') ? undefined : emit.call(process, w, ...rest));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function describeHttpError(status, bodyText) {
  let detail = '';
  try { const j = JSON.parse(bodyText); detail = j.error?.message || j.message || ''; } catch { detail = bodyText.slice(0, 200); }
  return `HTTP ${status}${detail ? `: ${String(detail).slice(0, 300)}` : ''}`;
}

async function post(url, headers, body) {
  let last;
  const delays = retryDelays();
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      const text = await res.text();
      if (res.ok) return JSON.parse(text);
      const retryable = res.status === 408 || res.status === 409 || res.status === 429 || res.status >= 500;
      last = Object.assign(new Error(describeHttpError(res.status, text)), { status: res.status, retryable });
      if (!retryable) throw last;
    } catch (err) {
      if (err.status && !err.retryable) throw err;
      last = err.status ? err : Object.assign(new Error(err.name === 'TimeoutError' ? 'the request timed out' : `could not reach the provider (${err.cause?.code || err.message})`), { retryable: true });
    }
    if (attempt < delays.length) await sleep(delays[attempt]);
  }
  throw last;
}

/** Pulls a JSON object out of a model's text, including answers wrapped in code fences. */
export function parseJsonAnswer(text) {
  const t = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(t); } catch { /* try the first object */ }
  const start = t.indexOf('{'), end = t.lastIndexOf('}');
  if (start >= 0 && end > start) { try { return JSON.parse(t.slice(start, end + 1)); } catch { /* fall through */ } }
  throw Object.assign(new Error('the answer was not valid JSON'), { format: true });
}

/** Asks the model one question and returns its JSON answer. `schema` is a JSON schema for the answer. */
export async function askModel(p, { prompt, schemaName, schema }) {
  if (p.provider === 'anthropic') {
    const data = await post(`${p.baseUrl}/v1/messages`, { 'x-api-key': p.key, 'anthropic-version': '2023-06-01' }, {
      model: p.model, max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
      tools: [{ name: schemaName, description: 'Report your answer in this structure.', input_schema: schema }],
      tool_choice: { type: 'tool', name: schemaName },
    });
    const block = (data.content || []).find((b) => b.type === 'tool_use');
    if (block?.input && typeof block.input === 'object') return block.input;
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return parseJsonAnswer(text);
  }
  const headers = p.key ? { authorization: `Bearer ${p.key}` } : {};
  const asked = `${prompt}\n\nReply with a single JSON object that matches this JSON schema, and nothing else:\n${JSON.stringify(schema)}`;
  const base = { model: p.model, messages: [{ role: 'user', content: asked }] };
  const limit = p.provider === 'openai' ? { max_completion_tokens: 8192 } : { max_tokens: 8192 };
  let data;
  try {
    data = await post(`${p.baseUrl}/chat/completions`, headers, { ...base, ...limit, response_format: p.provider === 'openai' ? { type: 'json_schema', json_schema: { name: schemaName, schema, strict: false } } : { type: 'json_object' } });
  } catch (err) {
    if (err.status !== 400) throw err;
    data = await post(`${p.baseUrl}/chat/completions`, headers, { ...base, ...limit }); // a provider without JSON mode
  }
  return parseJsonAnswer(data.choices?.[0]?.message?.content);
}

/** Steps for giving forkguard a key, written for the computer you are on. Never asks for the key in a command. */
export function aiSetupHelp(platform = process.platform) {
  const win = platform === 'win32';
  const set = (name) => (win ? `    $env:${name} = "paste-your-key-here"` : `    export ${name}=paste-your-key-here`);
  return [
    '  The AI review needs an API key from an AI provider. You bring your own: forkguard has none.',
    '',
    '  Set it in your terminal (not in a chat or a file), then run the command again:',
    '',
    '  Anthropic (Claude):',
    set('ANTHROPIC_API_KEY'),
    '',
    '  or OpenAI:',
    set('OPENAI_API_KEY'),
    '',
    '  or a model on your own computer (Ollama), which needs no key and sends nothing out:',
    win ? '    $env:FORKGUARD_AI_BASE_URL = "http://localhost:11434/v1"; $env:FORKGUARD_AI_MODEL = "llama3.1"' : '    export FORKGUARD_AI_BASE_URL=http://localhost:11434/v1 FORKGUARD_AI_MODEL=llama3.1',
    '',
    '  The key lives only in that terminal window and only for this run. forkguard never saves or prints it.',
    '  Do not type a key into the forkguard command itself: it would end up in your shell history.',
  ].join('\n');
}
