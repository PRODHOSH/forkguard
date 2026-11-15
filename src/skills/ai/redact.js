// SPDX-License-Identifier: Apache-2.0
// Derived from NVIDIA SkillSpector (https://github.com/NVIDIA/SkillSpector),
// Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
// Translated to JavaScript and changed by Prodhosh V.S for forkguard. See NOTICE.
// What is removed from a skill's text before any of it is sent to an AI provider.
// SkillSpector hides the values in .env files and the credentials in URLs. forkguard also hides common secret
// shapes (cloud keys, tokens, private keys), because the text leaves your computer. Line numbers never change.

const SECRETS = [
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bnpm_[A-Za-z0-9]{36}\b/g,
];
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;
const URL_TOKEN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`)\]}]+/gi;
const SENSITIVE_QUERY = /(?:key|token|secret|passw|auth|sig|credential|session|cookie)/i;

/** URL credentials and sensitive query values, as SkillSpector's redact_text does for finding text. */
export function redactUrls(text) {
  return text.replace(URL_TOKEN, (raw) => {
    let tail = '';
    let url = raw;
    while (url && '.,;)]}'.includes(url[url.length - 1])) { tail = url[url.length - 1] + tail; url = url.slice(0, -1); }
    try {
      const u = new URL(url);
      if (u.username || u.password) { u.username = '***'; u.password = ''; }
      for (const k of [...u.searchParams.keys()]) if (SENSITIVE_QUERY.test(k)) u.searchParams.set(k, '***');
      return u.toString().replace(/%2A%2A%2A/g, '***') + tail;
    } catch { return '<redacted-url>' + tail; }
  });
}

/** Cloud keys, tokens and private keys in any text, replaced and never spanning lines. */
export function redactSecrets(text) {
  let out = text.replace(PRIVATE_KEY, (m) => `<redacted private key>${m.replace(/[^\n]/g, '')}`);
  for (const re of SECRETS) out = out.replace(re, '<redacted>');
  return out;
}

/** The text of one file as it may leave the computer. */
export function redactForProvider(file, content) {
  const name = file.replace(/\\/g, '/').split('/').pop().toLowerCase();
  let out = content;
  if (name === '.env' || name.startsWith('.env.')) {
    out = out.replace(/^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=)(.*?)(\r?\n|$)/gm, (m, a, _b, c) => `${a}<redacted>${c}`);
  }
  return redactSecrets(out);
}
