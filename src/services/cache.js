import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config/env.js';

/**
 * Gera a chave canônica SHA-256 para o cache determinístico.
 * Considera entrada (cliente + ticket + tipo de conteúdo), versão de prompt e configurações equivalentes.
 */
export function computeCacheKey({
  customerId,
  ticket,
  contentType,
  promptVersion,
  provider,
  model,
  temperature,
}) {
  const canonicalPayload = JSON.stringify({
    customer_id: String(customerId).trim(),
    ticket: String(ticket).trim().replace(/\s+/g, ' '),
    content_type: String(contentType).trim(),
    prompt_version: String(promptVersion).trim(),
    provider: String(provider).trim().toLowerCase(),
    model: String(model).trim(),
    temperature: Number(temperature),
  });

  return crypto.createHash('sha256').update(canonicalPayload).digest('hex');
}

function ensureJsonFile(filePath, initialValue) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(initialValue, null, 2), 'utf-8');
  }
}

export function loadCacheStore(cachePath = getConfig().paths.cache) {
  ensureJsonFile(cachePath, { entries: {} });
  try {
    const raw = fs.readFileSync(cachePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.entries === 'object'
      ? parsed
      : { entries: {} };
  } catch {
    return { entries: {} };
  }
}

export function getCachedResult(cacheKey, cachePath = getConfig().paths.cache) {
  const store = loadCacheStore(cachePath);
  return store.entries[cacheKey] || null;
}

export function setCachedResult(
  cacheKey,
  entryData,
  cachePath = getConfig().paths.cache
) {
  const store = loadCacheStore(cachePath);
  store.entries[cacheKey] = {
    ...entryData,
    cached_at: new Date().toISOString(),
  };
  fs.writeFileSync(cachePath, JSON.stringify(store, null, 2), 'utf-8');
  return store.entries[cacheKey];
}

