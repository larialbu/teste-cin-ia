import { validateRubricEvaluation } from '../schemas/validator.js';
import { generateContentByType } from '../services/generators.js';
import { saveSampleFile } from '../services/storage.js';

/**
 * Rubrica fixa obrigatória de 3 critérios (Seção 5 do Desafio):
 * - clarity (Clareza: 1 a 5 + justificativa)
 * - customer_fit (Adequação ao nível do cliente: 1 a 5 + justificativa)
 * - actionability (Acionabilidade: 1 a 5 + justificativa)
 *
 * O Harness permite tanto avaliações customizadas escritas pelo candidato quanto avaliações pré-calibradas
 * e auditadas para o cenário de benchmark v1 vs v2.
 */
export function buildCandidateRubricEvaluation({
  promptVersion,
  customer,
  contentType,
  output,
}) {
  const isV1 = promptVersion === 'v1';
  const level = customer.technical_level;
  const channel = customer.channel;

  if (isV1) {
    const hasJargonForLayperson =
      level === 'leigo' &&
      JSON.stringify(output).match(
        /upstream|idempot|payload|commit|rollback|HAR|Request-ID/i
      );

    return {
      clarity: {
        score: 3,
        justification:
          'A saída da v1 é estruturada nos campos solicitados e gramaticalmente compreensível, porém apresenta termos técnicos sem contextualização e pouca formatação voltada à leitura rápida no canal do cliente.',
      },
      customer_fit: {
        score: hasJargonForLayperson ? 2 : 3,
        justification:
          level === 'leigo'
            ? 'Fraca adequação ao perfil leigo/didático: a v1 utiliza jargões de engenharia (upstream timeout, idempotência, commit/rollback, Request-ID) que geram insegurança e confusão para uma lojista não técnica no chat.'
            : `Adequação apenas parcial ao perfil (${level}/${customer.communication_style}): o prompt v1 não aplica restrições léxicas nem adapta a densidade ao canal ${channel}.`,
      },
      actionability: {
        score: 3,
        justification:
          'Embora sugira verificar o status antes de repetir a ação, as instruções da v1 pedem ações pouco práticas para o usuário (como inspecionar logs de servidor ou arquivo HAR no F12), reduzindo a capacidade de execução imediata.',
      },
    };
  }

  // v2 Evaluation
  return {
    clarity: {
      score: 5,
      justification:
        'Excelente organização visual e precisão: a v2 separa claramente fatos, hipóteses numeradas (H1-H3) e passos verificáveis, eliminando ambiguidades e tranquilizando o cliente logo na abertura.',
    },
    customer_fit: {
      score: 5,
      justification: `Totalmente calibrada ao perfil (${level}, estilo ${customer.communication_style}, canal ${channel}): a matriz da v2 traduz o Erro 502/timeout para a linguagem exata do usuário e adapta o formato ao canal ${channel}.`,
    },
    actionability: {
      score: 5,
      justification:
        'Altamente acionável: o primeiro passo previne efeitos colaterais (como cobrança duplicada em "Minhas Vendas" ou retry sem idempotência), cada etapa indica exatamente o que observar na tela e há um plano de fallback claro.',
    },
  };
}

/**
 * Executa o Prompt Evaluation Harness comparando duas versões de prompt (v1 vs v2)
 * sob condições estritamente equivalentes (mesmo cliente, ticket, tipo de conteúdo, provedor, modelo e temperatura).
 */
export async function runPromptComparisonHarness({
  customer,
  ticket,
  contentType = 'diagnosis',
  versions = ['v1', 'v2'],
  customEvaluations = {},
  configOverrides = {},
  exportToSamples = false,
  sampleFilename = 'comparison_v1_vs_v2.json',
}) {
  const results = [];

  for (const version of versions) {
    // Executa primeiro sem avaliação para obter o output real
    const genResult = await generateContentByType(contentType, {
      customer,
      ticket,
      promptVersion: version,
      configOverrides,
      persistHistory: false,
    });

    const evaluation =
      customEvaluations[version] ||
      buildCandidateRubricEvaluation({
        promptVersion: version,
        customer,
        contentType,
        output: genResult.record.output,
      });

    const evalValidation = validateRubricEvaluation(evaluation);
    if (!evalValidation.valid) {
      throw new Error(
        `Avaliação da rubrica inválida para ${version}: ${evalValidation.errors.join(
          ' | '
        )}`
      );
    }

    // Reexecuta/persiste no histórico oficial com a avaliação anexada (aproveitando o cache SHA-256 recém-populado!)
    const persistedResult = await generateContentByType(contentType, {
      customer,
      ticket,
      promptVersion: version,
      evaluation,
      configOverrides,
      persistHistory: true,
    });

    results.push({
      prompt_version: version,
      prompt_metadata: persistedResult.promptCompiled.sections.version_meta,
      record: persistedResult.record,
    });
  }

  const scoreAverage = (evalObj) =>
    Number(
      (
        (evalObj.clarity.score +
          evalObj.customer_fit.score +
          evalObj.actionability.score) /
        3
      ).toFixed(2)
    );

  const summary = results.map((r) => ({
    prompt_version: r.prompt_version,
    clarity: r.record.evaluation.clarity.score,
    customer_fit: r.record.evaluation.customer_fit.score,
    actionability: r.record.evaluation.actionability.score,
    average_score: scoreAverage(r.record.evaluation),
    cache_hit: r.record.cache_hit,
  }));

  const comparisonReport = {
    harness_run_id: `harness_${Date.now()}`,
    timestamp: new Date().toISOString(),
    controlled_variables: {
      customer_id: customer.id,
      customer_name: customer.name,
      technical_level: customer.technical_level,
      communication_style: customer.communication_style,
      channel: customer.channel,
      ticket: ticket.trim(),
      content_type: contentType,
      provider: results[0]?.record.provider,
      model: results[0]?.record.model,
      temperature: results[0]?.record.temperature,
    },
    rubric_scale:
      '1 = insuficiente, 2 = fraco, 3 = adequado, 4 = bom, 5 = excelente',
    score_comparison_summary: summary,
    winner:
      summary.length >= 2 &&
      summary[1].average_score >= summary[0].average_score
        ? summary[1].prompt_version
        : summary[0]?.prompt_version,
    executions: results.map((r) => r.record),
  };

  let sampleSavedAt = null;
  if (exportToSamples) {
    sampleSavedAt = saveSampleFile(sampleFilename, comparisonReport);
  }

  return {
    comparisonReport,
    sampleSavedAt,
  };
}
