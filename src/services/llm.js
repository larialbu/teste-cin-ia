import { getConfig } from '../config/env.js';

/**
 * Extrai um objeto JSON limpo mesmo que o modelo retorne markdown ```json ... ```
 */
export function parseJsonFromModelText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Resposta vazia do provedor de LLM.');
  }
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (match && match[1]) {
      return JSON.parse(match[1].trim());
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    throw new Error(
      `Não foi possível extrair JSON válido da saída: ${trimmed.slice(0, 120)}...`
    );
  }
}

/**
 * Chamada HTTP real para a API do Google Gemini (generateContent) usando fetch nativo do Node.js.
 */
async function callGeminiApi({
  prompt,
  model,
  apiKey,
  temperature,
  contentType,
  promptVersion,
}) {
  const maskedKey = `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const startMs = Date.now();
  console.log(
    `\n[GEMINI API -> REQUEST] Modelo: ${model} | Key: ${maskedKey} | Tipo: ${contentType} | Versão Prompt: ${promptVersion} | Temp: ${temperature}`
  );

  const maxAttempts = 4;
  let response;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            responseMimeType: 'application/json',
          },
        }),
      });
    } catch (netErr) {
      if (attempt < maxAttempts) {
        const waitMs = attempt * 2500;
        console.warn(
          `[GEMINI API -> RETRY ${attempt}/${maxAttempts - 1}] Oscilação de rede (${netErr.message}). Aguardando ${waitMs}ms...`
        );
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw netErr;
    }

    if (response.ok) break;

    if ((response.status === 503 || response.status === 429) && attempt < maxAttempts) {
      const waitMs = attempt * 2500;
      console.warn(
        `[GEMINI API -> RETRY ${attempt}/${maxAttempts - 1}] HTTP ${response.status} (alta demanda temporária na API Google). Aguardando ${waitMs}ms antes de tentar novamente...`
      );
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    break;
  }

  const elapsedMs = Date.now() - startMs;

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(
      `[GEMINI API <- ERROR] HTTP ${response.status} (${elapsedMs}ms): ${errorBody.slice(
        0,
        300
      )}`
    );
    throw new Error(
      `Erro na API Gemini (HTTP ${response.status}): ${errorBody.slice(0, 300)}`
    );
  }

  const data = await response.json();
  const usage = data?.usageMetadata || {};
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ||
    '';

  console.log(
    `[GEMINI API <- SUCCESS] HTTP ${response.status} (${elapsedMs}ms) | Tokens Prompt: ${
      usage.promptTokenCount ?? '?'
    } | Tokens Resposta: ${usage.candidatesTokenCount ?? '?'} | Total Tokens: ${
      usage.totalTokenCount ?? '?'
    }`
  );

  return parseJsonFromModelText(text);
}

/**
 * Executa exclusivamente a chamada real à API do Google Gemini usando GEMINI_API_KEY.
 */
export async function executeLlmCall({
  promptObj,
  contentType,
  promptVersion,
  configOverrides = {},
}) {
  const cfg = getConfig(configOverrides);

  if (!cfg.hasRealApiKey) {
    throw new Error(
      'GEMINI_API_KEY não configurada no arquivo .env. Configure sua chave real para gerar respostas.'
    );
  }

  const output = await callGeminiApi({
    prompt: promptObj.fullPrompt,
    model: cfg.model,
    apiKey: cfg.apiKey,
    temperature: cfg.temperature,
    contentType,
    promptVersion,
  });

  return {
    provider: 'gemini',
    model: cfg.model,
    temperature: cfg.temperature,
    output,
  };
}
