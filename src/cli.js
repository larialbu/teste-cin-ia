#!/usr/bin/env node
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { getConfig } from './config/env.js';
import { runPromptComparisonHarness } from './harness/runner.js';
import { PROMPT_VERSIONS_META } from './prompts/engine.js';
import { VALID_CONTENT_TYPES } from './schemas/validator.js';
import {
  generateAllFourContents,
  generateContentByType,
} from './services/generators.js';
import {
  getCustomerById,
  loadCustomers,
  loadHistory,
  loadTickets,
  saveSampleFile,
} from './services/storage.js';

function printBanner() {
  console.log('======================================================================');
  console.log('  ASSISTENTE DE SUPORTE TÉCNICO | SDD & PROMPT EVALUATION HARNESS');
  console.log('======================================================================');
  const cfg = getConfig();
  console.log(
    `  Provedor Ativo: ${cfg.provider.toUpperCase()} | Modelo: ${cfg.model} | Temp: ${cfg.temperature}`
  );
  console.log('======================================================================\n');
}

function printHelp() {
  printBanner();
  console.log(`Uso:
  node src/cli.js                                  Abre o menu interativo completo
  node src/cli.js generate [opções]                Gera conteúdo para um cliente + ticket
  node src/cli.js compare [opções]                 Executa o Prompt Evaluation Harness (v1 vs v2)
  node src/cli.js seed-samples                     Popula /samples e data/history.json com casos completos
  node src/cli.js list-profiles                    Lista os perfis de clientes em data/customers.json

Opções para "generate" e "compare":
  --customer <id>       ID do cliente (ex: cust_01, cust_02, cust_03, cust_04, cust_05)
  --ticket <id|texto>   ID de um ticket de exemplo (tkt_01, tkt_02, tkt_03) ou texto livre
  --type <tipo>         diagnosis | resolution_steps | clarifying_questions | flow_summary | all
  --version <v>         v1 | v2 (padrão: v2)
  --preset default      Usa combinação padrão para benchmark rápido
`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function resolveTicketText(ticketArg) {
  const tickets = loadTickets();
  if (!ticketArg) return tickets[0].description;
  const found = tickets.find((t) => t.id === ticketArg);
  return found ? found.description : ticketArg;
}

function formatContentOutputPretty(record) {
  console.log('\n----------------------------------------------------------------------');
  console.log(
    `[${record.content_type.toUpperCase()}] | Versão do Prompt: ${record.prompt_version} | Cache Hit: ${
      record.cache_hit ? 'SIM (Reutilizado)' : 'NÃO (Nova geração)'
    }`
  );
  console.log(
    `Cliente: ${record.customer_profile.name} (${record.customer_id}) | Nível: ${record.customer_profile.technical_level} | Estilo: ${record.customer_profile.communication_style} | Canal: ${record.customer_profile.channel}`
  );
  console.log('----------------------------------------------------------------------');
  if (
    record.content_type === 'flow_summary' &&
    record.output?.ascii_flowchart
  ) {
    console.log(`\nTítulo: ${record.output.title}\n`);
    console.log(record.output.ascii_flowchart);
    console.log('\nNós de Decisão:');
    for (const node of record.output.decision_nodes || []) {
      console.log(`  - Condição: ${node.condition}`);
      console.log(`    * [SIM] -> ${node.if_yes}`);
      console.log(`    * [NÃO] -> ${node.if_no}`);
    }
  } else {
    console.log(JSON.stringify(record.output, null, 2));
  }

  if (record.evaluation) {
    console.log('\n[Avaliação da Rubrica Fixa (1 a 5)]:');
    console.log(
      `  * Clareza (${record.evaluation.clarity.score}/5): ${record.evaluation.clarity.justification}`
    );
    console.log(
      `  * Adequação ao Cliente (${record.evaluation.customer_fit.score}/5): ${record.evaluation.customer_fit.justification}`
    );
    console.log(
      `  * Acionabilidade (${record.evaluation.actionability.score}/5): ${record.evaluation.actionability.justification}`
    );
  }
  console.log('----------------------------------------------------------------------');
}

async function runSeedSamples() {
  printBanner();
  const customers = loadCustomers();
  const tickets = loadTickets();

  const cust01 = customers[0]; // Dona Helena (leigo, didático, chat)
  const cust03 = customers[2]; // Fernanda Costa (avançado, detalhado, e-mail)
  const ticket01 = tickets[0].description;
  const ticket03 = tickets[2].description;

  console.log('1) Gerando os 4 tipos de conteúdo (v2) para Dona Helena (cust_01)...');
  const allFourCust01 = await generateAllFourContents({
    customer: cust01,
    ticket: ticket01,
    promptVersion: 'v2',
  });

  const fullBundlePath = saveSampleFile('full_4_contents_cust_01_v2.json', {
    generated_at: new Date().toISOString(),
    customer: cust01,
    ticket: ticket01,
    prompt_version: 'v2',
    contents: {
      diagnosis: allFourCust01.diagnosis.record,
      resolution_steps: allFourCust01.resolution_steps.record,
      clarifying_questions: allFourCust01.clarifying_questions.record,
      flow_summary: allFourCust01.flow_summary.record,
    },
  });
  console.log(`   -> Salvo em: ${fullBundlePath}`);

  console.log(
    '2) Executando Comparação Obrigatória v1 vs v2 no Harness (cust_01 + tkt_01 - diagnosis & resolution_steps)...'
  );
  const compDiagnosis = await runPromptComparisonHarness({
    customer: cust01,
    ticket: ticket01,
    contentType: 'diagnosis',
    versions: ['v1', 'v2'],
    exportToSamples: true,
    sampleFilename: 'comparison_v1_vs_v2_diagnosis_cust_01.json',
  });
  console.log(`   -> Salvo em: ${compDiagnosis.sampleSavedAt}`);

  const compResolution = await runPromptComparisonHarness({
    customer: cust01,
    ticket: ticket01,
    contentType: 'resolution_steps',
    versions: ['v1', 'v2'],
    exportToSamples: true,
    sampleFilename: 'comparison_v1_vs_v2_resolution_cust_01.json',
  });
  console.log(`   -> Salvo em: ${compResolution.sampleSavedAt}`);

  console.log(
    '3) Gerando exemplo para perfil Avançado (Fernanda Costa - cust_03 + tkt_03)...'
  );
  const allFourCust03 = await generateAllFourContents({
    customer: cust03,
    ticket: ticket03,
    promptVersion: 'v2',
  });
  const advBundlePath = saveSampleFile('full_4_contents_cust_03_advanced_v2.json', {
    generated_at: new Date().toISOString(),
    customer: cust03,
    ticket: ticket03,
    prompt_version: 'v2',
    contents: {
      diagnosis: allFourCust03.diagnosis.record,
      resolution_steps: allFourCust03.resolution_steps.record,
      clarifying_questions: allFourCust03.clarifying_questions.record,
      flow_summary: allFourCust03.flow_summary.record,
    },
  });
  console.log(`   -> Salvo em: ${advBundlePath}`);
  console.log(
    `\nHistórico completo atualizado em: ${getConfig().paths.history}`
  );
}

async function runInteractiveCli() {
  printBanner();
  const rl = readline.createInterface({ input, output });
  try {
    const customers = loadCustomers();
    const tickets = loadTickets();

    console.log('PERFIS DE CLIENTES DISPONÍVEIS:');
    customers.forEach((c, idx) => {
      console.log(
        `  [${idx + 1}] ${c.id} - ${c.name} (Nível: ${c.technical_level} | Estilo: ${c.communication_style} | Canal: ${c.channel})`
      );
    });
    const custChoice = await rl.question(
      `\nSelecione o cliente (1-${customers.length}) [padrão: 1]: `
    );
    const customer =
      customers[Math.max(0, (Number(custChoice) || 1) - 1)] || customers[0];

    console.log('\nTICKETS DE EXEMPLO OU TEXTO LIVRE:');
    tickets.forEach((t, idx) => {
      console.log(`  [${idx + 1}] ${t.id} - ${t.title}`);
      console.log(`      "${t.description.slice(0, 95)}..."`);
    });
    console.log('  [4] Digitar um novo problema/ticket manualmente');
    const tktChoice = await rl.question(
      '\nSelecione uma opção de ticket (1-4) [padrão: 1]: '
    );

    let ticketText = tickets[0].description;
    if (Number(tktChoice) === 4) {
      const customText = await rl.question('\nDigite o relato do ticket: ');
      if (customText.trim()) ticketText = customText.trim();
    } else {
      const chosenTkt = tickets[(Number(tktChoice) || 1) - 1];
      if (chosenTkt) ticketText = chosenTkt.description;
    }

    console.log('\nOPERAÇÃO / TIPO DE CONTEÚDO:');
    console.log('  [1] Diagnóstico estruturado (diagnosis)');
    console.log('  [2] Passo a passo de resolução (resolution_steps)');
    console.log('  [3] Perguntas de esclarecimento (clarifying_questions)');
    console.log('  [4] Resumo visual do fluxo ASCII (flow_summary)');
    console.log('  [5] Gerar TODOS os 4 tipos de conteúdo de uma vez');
    console.log(
      '  [6] COMPARAR versões de prompt (v1 vs v2) com Rubrica Obrigatória (Harness)'
    );

    const opChoice =
      Number(await rl.question('\nEscolha a operação (1-6) [padrão: 5]: ')) ||
      5;

    const typesMap = {
      1: 'diagnosis',
      2: 'resolution_steps',
      3: 'clarifying_questions',
      4: 'flow_summary',
    };

    if (opChoice === 6) {
      const typeForCompChoice =
        Number(
          await rl.question(
            '\nQual tipo de conteúdo comparar entre v1 e v2? (1=diagnosis, 2=resolution_steps, 3=clarifying_questions, 4=flow_summary) [padrão: 1]: '
          )
        ) || 1;
      const contentType = typesMap[typeForCompChoice] || 'diagnosis';

      const customRubricAns = (
        await rl.question(
          '\nDeseja informar notas manualmente (m) ou aplicar a avaliação calibrada da rubrica (a)? [padrão: a]: '
        )
      )
        .trim()
        .toLowerCase();

      const customEvaluations = {};
      if (customRubricAns === 'm') {
        for (const ver of ['v1', 'v2']) {
          console.log(`\n--- Avaliação da Rubrica para ${ver} (notas de 1 a 5) ---`);
          const cScore =
            Number(await rl.question(`Nota de Clareza (${ver}) [1-5]: `)) || 4;
          const cJust =
            (await rl.question(`Justificativa de Clareza (${ver}): `)).trim() ||
            'Avaliação manual registrada via CLI pelo candidato.';
          const fScore =
            Number(
              await rl.question(`Nota de Adequação ao Cliente (${ver}) [1-5]: `)
            ) || 4;
          const fJust =
            (
              await rl.question(
                `Justificativa de Adequação ao Cliente (${ver}): `
              )
            ).trim() || 'Avaliação manual registrada via CLI pelo candidato.';
          const aScore =
            Number(
              await rl.question(`Nota de Acionabilidade (${ver}) [1-5]: `)
            ) || 4;
          const aJust =
            (
              await rl.question(`Justificativa de Acionabilidade (${ver}): `)
            ).trim() || 'Avaliação manual registrada via CLI pelo candidato.';

          customEvaluations[ver] = {
            clarity: { score: Math.min(5, Math.max(1, cScore)), justification: cJust },
            customer_fit: {
              score: Math.min(5, Math.max(1, fScore)),
              justification: fJust,
            },
            actionability: {
              score: Math.min(5, Math.max(1, aScore)),
              justification: aJust,
            },
          };
        }
      }

      const { comparisonReport, sampleSavedAt } =
        await runPromptComparisonHarness({
          customer,
          ticket: ticketText,
          contentType,
          versions: ['v1', 'v2'],
          customEvaluations,
          exportToSamples: true,
          sampleFilename: `comparison_${customer.id}_${contentType}_v1_vs_v2.json`,
        });

      for (const execRecord of comparisonReport.executions) {
        formatContentOutputPretty(execRecord);
      }

      console.log('\n================ RESUMO COMPARATIVO (HARNESS) ================');
      console.table(comparisonReport.score_comparison_summary);
      console.log(`Versão Vencedora: ${comparisonReport.winner}`);
      console.log(`Histórico salvo em: ${getConfig().paths.history}`);
      console.log(`Relatório de amostra salvo em: ${sampleSavedAt}`);
      return;
    }

    console.log('\nVERSÕES DE PROMPT DISPONÍVEIS:');
    Object.values(PROMPT_VERSIONS_META).forEach((m) => {
      console.log(`  - ${m.version}: ${m.name}`);
    });
    const verInput = (
      await rl.question('\nEscolha a versão do prompt (v1 ou v2) [padrão: v2]: ')
    )
      .trim()
      .toLowerCase();
    const promptVersion = verInput === 'v1' ? 'v1' : 'v2';

    if (opChoice === 5) {
      const results = await generateAllFourContents({
        customer,
        ticket: ticketText,
        promptVersion,
      });
      for (const key of VALID_CONTENT_TYPES) {
        formatContentOutputPretty(results[key].record);
      }
      console.log(`\nTodos os 4 resultados foram salvos em: ${getConfig().paths.history}`);
    } else {
      const contentType = typesMap[opChoice] || 'diagnosis';
      const res = await generateContentByType(contentType, {
        customer,
        ticket: ticketText,
        promptVersion,
      });
      formatContentOutputPretty(res.record);
      console.log(`\nResultado salvo em: ${res.savedAt}`);
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (args.help || args.h || command === 'help') {
    printHelp();
    return;
  }

  if (command === 'list-profiles') {
    const customers = loadCustomers();
    console.table(customers);
    return;
  }

  if (command === 'seed-samples') {
    await runSeedSamples();
    return;
  }

  if (command === 'generate') {
    printBanner();
    const customerId = args.customer || 'cust_01';
    const customer = getCustomerById(customerId);
    if (!customer) {
      console.error(`Cliente "${customerId}" não encontrado em data/customers.json.`);
      process.exit(1);
    }
    const ticket = resolveTicketText(args.ticket);
    const promptVersion = args.version === 'v1' ? 'v1' : 'v2';
    const type = args.type || 'all';

    if (type === 'all') {
      const results = await generateAllFourContents({
        customer,
        ticket,
        promptVersion,
      });
      for (const key of VALID_CONTENT_TYPES) {
        formatContentOutputPretty(results[key].record);
      }
      console.log(`\nResultados salvos no histórico JSON: ${getConfig().paths.history}`);
    } else {
      const res = await generateContentByType(type, {
        customer,
        ticket,
        promptVersion,
      });
      formatContentOutputPretty(res.record);
      console.log(`\nResultado salvo no histórico JSON: ${res.savedAt}`);
    }
    return;
  }

  if (command === 'compare') {
    printBanner();
    const customerId = args.customer || 'cust_01';
    const customer = getCustomerById(customerId);
    if (!customer) {
      console.error(`Cliente "${customerId}" não encontrado.`);
      process.exit(1);
    }
    const ticket = resolveTicketText(args.ticket);
    const contentType =
      args.type && VALID_CONTENT_TYPES.includes(args.type)
        ? args.type
        : 'diagnosis';

    const { comparisonReport, sampleSavedAt } =
      await runPromptComparisonHarness({
        customer,
        ticket,
        contentType,
        versions: ['v1', 'v2'],
        exportToSamples: true,
        sampleFilename: `comparison_${customer.id}_${contentType}_v1_vs_v2.json`,
      });

    for (const execRecord of comparisonReport.executions) {
      formatContentOutputPretty(execRecord);
    }

    console.log('\n================ RESUMO COMPARATIVO (HARNESS) ================');
    console.table(comparisonReport.score_comparison_summary);
    console.log(`Versão Vencedora: ${comparisonReport.winner}`);
    console.log(`Histórico JSON salvo em: ${getConfig().paths.history}`);
    console.log(`Amostra JSON salva em: ${sampleSavedAt}`);
    return;
  }

  if (command === 'history') {
    const history = loadHistory();
    console.log(`Total de execuções no histórico: ${history.length}`);
    console.log(`Arquivo: ${getConfig().paths.history}`);
    return;
  }

  await runInteractiveCli();
}

main().catch((err) => {
  console.error('\n[ERRO DE EXECUÇÃO]:', err.message);
  process.exit(1);
});
