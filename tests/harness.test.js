import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runPromptComparisonHarness } from '../src/harness/runner.js';
import { handleJsonRpcMessage } from '../src/mcp/server.js';
import { buildPrompt } from '../src/prompts/engine.js';
import {
  validateContentOutput,
  validateCustomerProfile,
  validateRubricEvaluation,
} from '../src/schemas/validator.js';
import { computeCacheKey } from '../src/services/cache.js';
import {
  generateClarifyingQuestions,
  generateDiagnosis,
  generateFlowSummary,
  generateResolutionSteps,
} from '../src/services/generators.js';
import { loadCustomers, loadTickets } from '../src/services/storage.js';

test('Spec 01: data/customers.json deve conter de 3 a 5 perfis válidos', () => {
  const customers = loadCustomers();
  assert.ok(
    customers.length >= 3 && customers.length <= 5,
    `Esperado entre 3 e 5 perfis, encontrado: ${customers.length}`
  );
  for (const customer of customers) {
    const res = validateCustomerProfile(customer);
    assert.equal(
      res.valid,
      true,
      `Perfil inválido (${customer.id}): ${res.errors.join(', ')}`
    );
  }
});

test('Spec 02: Motor de Engenharia de Prompt deve demonstrar os 5 elementos obrigatórios e diferenciar v1 vs v2', () => {
  const customer = loadCustomers()[0];
  const ticket = loadTickets()[0].description;

  const pV1 = buildPrompt({
    customer,
    ticket,
    contentType: 'diagnosis',
    promptVersion: 'v1',
  });
  const pV2 = buildPrompt({
    customer,
    ticket,
    contentType: 'diagnosis',
    promptVersion: 'v2',
  });

  assert.equal(pV1.promptVersion, 'v1');
  assert.equal(pV2.promptVersion, 'v2');
  assert.notEqual(pV1.fullPrompt, pV2.fullPrompt);

  // Verifica se as 5 seções existem
  for (const p of [pV1, pV2]) {
    assert.ok(p.sections.persona.includes('PERSONA'));
    assert.ok(p.sections.context.includes(customer.name));
    assert.ok(p.sections.decomposition.includes('DECOMPOSIÇÃO'));
    assert.ok(p.sections.output_format.includes('FORMATO DE SAÍDA'));
    assert.ok(p.sections.version_meta.version);
  }

  // v2 possui matriz explícita de calibração léxica e checklist de auto-verificação
  assert.ok(
    pV2.fullPrompt.includes('MATRIZ DE CALIBRAÇÃO OBRIGATÓRIA'),
    'v2 deve incluir matriz de calibração explícita'
  );
  assert.ok(
    pV2.fullPrompt.includes('CHECKLIST DE AUTO-VERIFICAÇÃO'),
    'v2 deve incluir checklist de auto-verificação'
  );
});

test('Spec 02 & 03: As 4 funções geradoras devem produzir JSON válido e o cache SHA-256 deve evitar chamadas repetidas', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
  const tmpCache = path.join(tmpDir, 'cache.json');
  const tmpHistory = path.join(tmpDir, 'history.json');

  // Sobrescreve temporariamente os caminhos via env/overrides
  const customer = loadCustomers()[0];
  const ticket = loadTickets()[0].description;

  const key1 = computeCacheKey({
    customerId: customer.id,
    ticket,
    contentType: 'diagnosis',
    promptVersion: 'v2',
    provider: 'mock',
    model: 'gemini-2.5-flash-simulated',
    temperature: 0.2,
  });
  const key2 = computeCacheKey({
    customerId: customer.id,
    ticket: `  ${ticket}  `,
    contentType: 'diagnosis',
    promptVersion: 'v2',
    provider: 'mock',
    model: 'gemini-2.5-flash-simulated',
    temperature: 0.2,
  });
  assert.equal(
    key1,
    key2,
    'Chave SHA-256 deve normalizar espaços extras para garantir cache hit em entradas equivalentes'
  );

  const diag = await generateDiagnosis({
    customer,
    ticket,
    promptVersion: 'v2',
  });
  assert.equal(
    validateContentOutput('diagnosis', diag.record.output).valid,
    true
  );

  // Segunda chamada idêntica deve resultar em cache_hit = true
  const diagCached = await generateDiagnosis({
    customer,
    ticket,
    promptVersion: 'v2',
  });
  assert.equal(
    diagCached.record.cache_hit,
    true,
    'Segunda execução idêntica deve ser atendida pelo cache'
  );

  const steps = await generateResolutionSteps({
    customer,
    ticket,
    promptVersion: 'v2',
  });
  assert.equal(
    validateContentOutput('resolution_steps', steps.record.output).valid,
    true
  );

  const questions = await generateClarifyingQuestions({
    customer,
    ticket,
    promptVersion: 'v2',
  });
  assert.equal(
    validateContentOutput('clarifying_questions', questions.record.output)
      .valid,
    true
  );

  const flow = await generateFlowSummary({
    customer,
    ticket,
    promptVersion: 'v2',
  });
  assert.equal(
    validateContentOutput('flow_summary', flow.record.output).valid,
    true
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Spec 03: Prompt Evaluation Harness deve comparar v1 vs v2 sob variáveis controladas e aplicar a rubrica de 3 critérios', async () => {
  const customer = loadCustomers()[0]; // Dona Helena (leigo)
  const ticket = loadTickets()[0].description;

  const { comparisonReport } = await runPromptComparisonHarness({
    customer,
    ticket,
    contentType: 'diagnosis',
    versions: ['v1', 'v2'],
    exportToSamples: false,
  });

  assert.equal(comparisonReport.executions.length, 2);
  const [execV1, execV2] = comparisonReport.executions;

  assert.equal(execV1.prompt_version, 'v1');
  assert.equal(execV2.prompt_version, 'v2');
  assert.equal(execV1.customer_id, execV2.customer_id);
  assert.equal(execV1.ticket, execV2.ticket);

  assert.equal(validateRubricEvaluation(execV1.evaluation).valid, true);
  assert.equal(validateRubricEvaluation(execV2.evaluation).valid, true);
  assert.equal(comparisonReport.winner, 'v2');
});

test('MCP Server: Deve listar ferramentas e responder chamadas JSON-RPC corretamente', async () => {
  const listResp = await handleJsonRpcMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
  });
  assert.equal(listResp.result.tools.length, 3);

  const callResp = await handleJsonRpcMessage({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'list_customer_profiles',
      arguments: {},
    },
  });
  const profiles = JSON.parse(callResp.result.content[0].text);
  assert.ok(profiles.length >= 3);
});
