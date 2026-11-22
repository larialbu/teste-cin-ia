import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

/**
 * Carrega variáveis de um arquivo .env simples sem dependências externas.
 */
export function loadEnvFile(envPath = path.join(ROOT_DIR, '.env')) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

export function getConfig(overrides = {}) {
  const apiKey = overrides.apiKey ?? process.env.GEMINI_API_KEY ?? '';
  const hasRealApiKey =
    Boolean(apiKey) && apiKey !== 'your_gemini_api_key_here';

  const requestedProvider = (
    overrides.provider ??
    process.env.LLM_PROVIDER ??
    (hasRealApiKey ? 'gemini' : 'mock')
  ).toLowerCase();

  const provider =
    requestedProvider === 'gemini' && !hasRealApiKey
      ? 'mock'
      : requestedProvider;

  const model =
    overrides.model ??
    process.env.GEMINI_MODEL ??
    (provider === 'gemini' ? 'gemini-2.5-flash' : 'gemini-2.5-flash-simulated');

  const temperature = Number(
    overrides.temperature ?? process.env.LLM_TEMPERATURE ?? 0.2
  );

  return {
    provider,
    requestedProvider,
    hasRealApiKey,
    apiKey,
    model,
    temperature: Number.isNaN(temperature) ? 0.2 : temperature,
    port: Number(process.env.PORT ?? 3000),
    paths: {
      customers: path.join(ROOT_DIR, 'data', 'customers.json'),
      tickets: path.join(ROOT_DIR, 'data', 'tickets.json'),
      cache: path.join(ROOT_DIR, 'data', 'cache.json'),
      history: path.join(ROOT_DIR, 'data', 'history.json'),
      samplesDir: path.join(ROOT_DIR, 'samples'),
    },
  };
}

