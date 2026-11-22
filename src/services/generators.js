import crypto from 'node:crypto';
import { getConfig } from '../config/env.js';
import { buildPrompt } from '../prompts/engine.js';
import {
  validateContentOutput,
  validateCustomerProfile,
} from '../schemas/validator.js';
import {
  computeCacheKey,
  getCachedResult,
  setCachedResult,
} from './cache.js';
import { executeLlmCall } from './llm.js';
import { appendHistoryRecord } from './storage.js';

/**
 * Pipeline base compartilhado pelas 4 funções geradoras:
 * 1. Valida o perfil do cliente (SDD Contract)
 * 2. Monta o prompt dinâmico (Persona + Context + Decomposition + Output Format + Version)
 * 3. Verifica o Cache SHA-256 para evitar chamadas repetidas equivalentes
 * 4. Executa a chamada ao LLM (ou retorna do cache)
 * 5. Valida o schema JSON de saída
 * 6. Persiste a execução no histórico JSON com timestamp
 */
async function runGenerationStrategy({
  customer,
  ticket,
  contentType,
  promptVersion = 'v2',
  evaluation = null,
  configOverrides = {},
  persistHistory = true,
}) {
  const profileValidation = validateCustomerProfile(customer);
  if (!profileValidation.valid) {
    throw new Error(
      `Perfil de cliente inválido: ${profileValidation.errors.join(' | ')}`
    );
  }
  if (!ticket || typeof ticket !== 'string' || !ticket.trim()) {
    throw new Error('O ticket/problema a ser analisado não pode ser vazio.');
  }

  const cfg = getConfig(configOverrides);
  const promptObj = buildPrompt({
    customer,
    ticket,
    contentType,
    promptVersion,
  });

  const cacheKey = computeCacheKey({
    customerId: customer.id,
    ticket,
    contentType,
    promptVersion: promptObj.promptVersion,
    provider: cfg.provider,
    model: cfg.model,
    temperature: cfg.temperature,
  });

  let cacheHit = false;
  let output;
  let actualProvider = cfg.provider;
  let actualModel = cfg.model;

  const cached = configOverrides.bypassCache
    ? null
    : getCachedResult(cacheKey, cfg.paths.cache);

  if (cached && cached.output) {
    cacheHit = true;
    output = cached.output;
    actualProvider = cached.provider || cfg.provider;
    actualModel = cached.model || cfg.model;
    console.log(
      `[CACHE HIT] Chave SHA-256 encontrada (${cacheKey.slice(
        0,
        12
      )}...) para ${contentType} (${promptObj.promptVersion}). Evitando chamada repetida à API!`
    );
  } else {
    console.log(
      `[CACHE MISS] Chave SHA-256 (${cacheKey.slice(
        0,
        12
      )}...) não encontrada. Acionando provedor ${cfg.provider.toUpperCase()}...`
    );
    const llmResult = await executeLlmCall({
      promptObj,
      customer,
      ticket,
      contentType,
      promptVersion: promptObj.promptVersion,
      configOverrides,
    });
    output = llmResult.output;
    actualProvider = llmResult.provider;
    actualModel = llmResult.model;

    const outputValidation = validateContentOutput(contentType, output);
    if (!outputValidation.valid) {
      throw new Error(
        `Saída gerada violou o contrato SDD para "${contentType}": ${outputValidation.errors.join(
          ' | '
        )}`
      );
    }

    // Só salva no cache definitivo se não foi um fallback de erro de rede/API
    if (actualProvider !== 'mock-fallback') {
      setCachedResult(
        cacheKey,
        {
          customer_id: customer.id,
          ticket: ticket.trim(),
          content_type: contentType,
          prompt_version: promptObj.promptVersion,
          provider: actualProvider,
          model: actualModel,
          temperature: cfg.temperature,
          output,
        },
        cfg.paths.cache
      );
    }
  }

  const record = {
    id: `exec_${crypto.randomBytes(4).toString('hex')}`,
    timestamp: new Date().toISOString(),
    customer_id: customer.id,
    customer_profile: {
      name: customer.name,
      technical_level: customer.technical_level,
      communication_style: customer.communication_style,
      channel: customer.channel,
    },
    ticket: ticket.trim(),
    prompt_version: promptObj.promptVersion,
    content_type: contentType,
    provider: actualProvider,
    model: actualModel,
    temperature: cfg.temperature,
    cache_key: cacheKey,
    cache_hit: cacheHit,
    output,
    ...(evaluation ? { evaluation } : {}),
  };

  let savedAt = cfg.paths.history;
  if (persistHistory) {
    const persisted = appendHistoryRecord(record, cfg.paths.history);
    savedAt = persisted.savedAt;
  }

  return {
    record,
    promptCompiled: promptObj,
    savedAt,
  };
}

/**
 * 4.3 Geração de conteúdo - 4 funções separadas, uma para cada tipo de conteúdo.
 */

export async function generateDiagnosis(params) {
  return runGenerationStrategy({ ...params, contentType: 'diagnosis' });
}

export async function generateResolutionSteps(params) {
  return runGenerationStrategy({ ...params, contentType: 'resolution_steps' });
}

export async function generateClarifyingQuestions(params) {
  return runGenerationStrategy({
    ...params,
    contentType: 'clarifying_questions',
  });
}

export async function generateFlowSummary(params) {
  return runGenerationStrategy({ ...params, contentType: 'flow_summary' });
}

/**
 * Dispatcher conveniente por content_type
 */
export async function generateContentByType(contentType, params) {
  switch (contentType) {
    case 'diagnosis':
      return generateDiagnosis(params);
    case 'resolution_steps':
      return generateResolutionSteps(params);
    case 'clarifying_questions':
      return generateClarifyingQuestions(params);
    case 'flow_summary':
      return generateFlowSummary(params);
    default:
      throw new Error(`Tipo de conteúdo inválido: ${contentType}`);
  }
}

/**
 * Gera o pacote completo com os 4 tipos de conteúdo para um cliente + ticket.
 */
export async function generateAllFourContents({
  customer,
  ticket,
  promptVersion = 'v2',
  configOverrides = {},
}) {
  const diagnosis = await generateDiagnosis({
    customer,
    ticket,
    promptVersion,
    configOverrides,
  });
  const resolution_steps = await generateResolutionSteps({
    customer,
    ticket,
    promptVersion,
    configOverrides,
  });
  const clarifying_questions = await generateClarifyingQuestions({
    customer,
    ticket,
    promptVersion,
    configOverrides,
  });
  const flow_summary = await generateFlowSummary({
    customer,
    ticket,
    promptVersion,
    configOverrides,
  });

  return {
    diagnosis,
    resolution_steps,
    clarifying_questions,
    flow_summary,
  };
}

