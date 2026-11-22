import http from 'node:http';
import { getConfig } from '../config/env.js';
import { runPromptComparisonHarness } from '../harness/runner.js';
import { PROMPT_VERSIONS_META, buildPrompt } from '../prompts/engine.js';
import {
  generateAllFourContents,
  generateContentByType,
} from '../services/generators.js';
import {
  getCustomerById,
  loadCustomers,
  loadHistory,
  loadTickets,
} from '../services/storage.js';

const HTML_PAGE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Prompt Evaluation Harness | Assistente de Suporte IA</title>
  <style>
    :root {
      --bg: #0f172a;
      --surface: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --success: #22c55e;
      --warning: #eab308;
    }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { margin: 0; background: var(--bg); color: var(--text); padding: 24px; }
    .container { max-width: 1200px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 24px; }
    h1 { margin: 0; font-size: 1.5rem; color: var(--accent); }
    .badge { background: #0284c7; color: #fff; padding: 4px 10px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
    .grid { display: grid; grid-template-columns: 360px 1fr; gap: 24px; }
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 20px; }
    label { display: block; font-size: 0.85rem; color: var(--muted); margin-bottom: 6px; margin-top: 14px; font-weight: 600; }
    select, textarea, button { width: 100%; padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border); background: #0f172a; color: var(--text); font-size: 0.9rem; }
    textarea { min-height: 110px; resize: vertical; }
    .btn-group { display: flex; gap: 10px; margin-top: 18px; }
    button { cursor: pointer; font-weight: 600; background: #0284c7; border: none; transition: opacity 0.15s; }
    button.secondary { background: #4f46e5; }
    button:hover { opacity: 0.9; }
    pre { background: #090d16; padding: 14px; border-radius: 8px; overflow-x: auto; border: 1px solid var(--border); font-family: "JetBrains Mono", monospace; font-size: 0.82rem; line-height: 1.45; white-space: pre-wrap; }
    .meta-bar { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; font-size: 0.82rem; color: var(--muted); }
    .pill { background: #0f172a; border: 1px solid var(--border); padding: 4px 10px; border-radius: 6px; }
    .hit { color: var(--success); border-color: var(--success); }
    .comp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    @media (max-width: 900px) { .grid, .comp-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>Assistente de Suporte Técnico & Prompt Evaluation Harness</h1>
        <small style="color: var(--muted)">SDD Contract-First | Cache SHA-256 | Comparação Controlada v1 vs v2</small>
      </div>
      <span class="badge" id="providerBadge">Carregando...</span>
    </header>

    <div class="grid">
      <div class="card">
        <h3 style="margin-top:0">Parâmetros de Entrada</h3>
        <label>1. Perfil de Cliente (data/customers.json)</label>
        <select id="customerSelect"></select>

        <label>2. Ticket Pré-cadastrado</label>
        <select id="ticketPresetSelect"></select>

        <label>Relato do Ticket / Problema</label>
        <textarea id="ticketInput"></textarea>

        <label>3. Tipo de Conteúdo</label>
        <select id="contentTypeSelect">
          <option value="all">Todos os 4 Conteúdos (Pacote Completo)</option>
          <option value="diagnosis">1. Diagnóstico Estruturado (diagnosis)</option>
          <option value="resolution_steps">2. Passo a Passo de Resolução (resolution_steps)</option>
          <option value="clarifying_questions">3. Perguntas de Esclarecimento (clarifying_questions)</option>
          <option value="flow_summary">4. Resumo Visual do Fluxo ASCII (flow_summary)</option>
        </select>

        <label>4. Versão do Prompt</label>
        <select id="versionSelect">
          <option value="v2">v2 - Persona-Calibrated & Channel-Matrix (Otimizado)</option>
          <option value="v1">v1 - Baseline Structured Prompt</option>
        </select>

        <div class="btn-group">
          <button id="generateBtn">Gerar Conteúdo</button>
          <button id="compareBtn" class="secondary">Comparar v1 vs v2 (Harness)</button>
        </div>
      </div>

      <div class="card">
        <h3 style="margin-top:0">Saída Estruturada & Persistência JSON</h3>
        <div class="meta-bar" id="metaBar">
          <span class="pill">Selecione os parâmetros ao lado e clique em Gerar ou Comparar.</span>
        </div>
        <div id="outputContainer">
          <pre id="jsonOutput">// A saída JSON estruturada, fluxograma ASCII e avaliação da rubrica aparecerão aqui.</pre>
        </div>
      </div>
    </div>
  </div>

  <script>
    let customers = [];
    let tickets = [];

    async function init() {
      const res = await fetch('/api/meta');
      const data = await res.json();
      customers = data.customers;
      tickets = data.tickets;
      document.getElementById('providerBadge').textContent =
        data.config.provider.toUpperCase() + ' | ' + data.config.model;

      const cSel = document.getElementById('customerSelect');
      customers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name + ' [' + c.technical_level + ' | ' + c.communication_style + ' | ' + c.channel + ']';
        cSel.appendChild(opt);
      });

      const tSel = document.getElementById('ticketPresetSelect');
      tickets.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.id + ' - ' + t.title;
        tSel.appendChild(opt);
      });

      document.getElementById('ticketInput').value = tickets[0]?.description || '';
      tSel.addEventListener('change', () => {
        const found = tickets.find(t => t.id === tSel.value);
        if (found) document.getElementById('ticketInput').value = found.description;
      });
    }

    document.getElementById('generateBtn').addEventListener('click', async () => {
      const customerId = document.getElementById('customerSelect').value;
      const ticket = document.getElementById('ticketInput').value;
      const contentType = document.getElementById('contentTypeSelect').value;
      const promptVersion = document.getElementById('versionSelect').value;

      document.getElementById('metaBar').innerHTML = '<span class="pill">Processando...</span>';
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, ticket, contentType, promptVersion })
      });
      const data = await res.json();
      document.getElementById('metaBar').innerHTML =
        '<span class="pill">Salvo em: ' + data.savedAt + '</span>' +
        '<span class="pill ' + (data.cacheHit ? 'hit' : '') + '">Cache Hit: ' + (data.cacheHit ? 'SIM (Evitou chamada repetida)' : 'NÃO') + '</span>';
      document.getElementById('outputContainer').innerHTML =
        '<pre>' + JSON.stringify(data.result, null, 2) + '</pre>';
    });

    document.getElementById('compareBtn').addEventListener('click', async () => {
      const customerId = document.getElementById('customerSelect').value;
      const ticket = document.getElementById('ticketInput').value;
      let contentType = document.getElementById('contentTypeSelect').value;
      if (contentType === 'all') contentType = 'diagnosis';

      document.getElementById('metaBar').innerHTML = '<span class="pill">Executando Harness v1 vs v2...</span>';
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, ticket, contentType })
      });
      const data = await res.json();
      const rep = data.comparisonReport;
      const v1 = rep.executions[0];
      const v2 = rep.executions[1];

      document.getElementById('metaBar').innerHTML =
        '<span class="pill hit">Vencedor Rubrica: ' + rep.winner.toUpperCase() + '</span>' +
        '<span class="pill">Salvo em: ' + data.savedAt + '</span>';

      document.getElementById('outputContainer').innerHTML =
        '<div class="comp-grid">' +
          '<div><h4>Versão v1 (Baseline) - Média: ' + rep.score_comparison_summary[0].average_score + '/5</h4><pre>' + JSON.stringify(v1, null, 2) + '</pre></div>' +
          '<div><h4>Versão v2 (Calibrada) - Média: ' + rep.score_comparison_summary[1].average_score + '/5</h4><pre>' + JSON.stringify(v2, null, 2) + '</pre></div>' +
        '</div>';
    });

    init();
  </script>
</body>
</html>`;

export function createWebServer() {
  return http.createServer(async (req, res) => {
    const cfg = getConfig();

    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML_PAGE);
      return;
    }

    if (req.method === 'GET' && req.url === '/api/meta') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          customers: loadCustomers(),
          tickets: loadTickets(),
          promptVersions: PROMPT_VERSIONS_META,
          historyCount: loadHistory().length,
          config: {
            provider: cfg.provider,
            model: cfg.model,
            temperature: cfg.temperature,
            historyPath: cfg.paths.history,
          },
        })
      );
      return;
    }

    if (req.method === 'POST' && (req.url === '/api/generate' || req.url === '/api/compare' || req.url === '/api/prompt-preview')) {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        const payload = JSON.parse(body || '{}');
        const customer = getCustomerById(payload.customerId || 'cust_01');
        if (!customer) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Cliente não encontrado.' }));
          return;
        }

        if (req.url === '/api/prompt-preview') {
          const compiled = buildPrompt({
            customer,
            ticket: payload.ticket || '',
            contentType: payload.contentType || 'diagnosis',
            promptVersion: payload.promptVersion || 'v2',
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(compiled));
          return;
        }

        if (req.url === '/api/generate') {
          if (payload.contentType === 'all') {
            const all = await generateAllFourContents({
              customer,
              ticket: payload.ticket,
              promptVersion: payload.promptVersion || 'v2',
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(
              JSON.stringify({
                savedAt: cfg.paths.history,
                cacheHit:
                  all.diagnosis.record.cache_hit &&
                  all.resolution_steps.record.cache_hit,
                result: {
                  diagnosis: all.diagnosis.record,
                  resolution_steps: all.resolution_steps.record,
                  clarifying_questions: all.clarifying_questions.record,
                  flow_summary: all.flow_summary.record,
                },
              })
            );
            return;
          }

          const gen = await generateContentByType(
            payload.contentType || 'diagnosis',
            {
              customer,
              ticket: payload.ticket,
              promptVersion: payload.promptVersion || 'v2',
            }
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              savedAt: gen.savedAt,
              cacheHit: gen.record.cache_hit,
              result: gen.record,
            })
          );
          return;
        }

        if (req.url === '/api/compare') {
          const comp = await runPromptComparisonHarness({
            customer,
            ticket: payload.ticket,
            contentType: payload.contentType || 'diagnosis',
            versions: ['v1', 'v2'],
            exportToSamples: true,
            sampleFilename: `comparison_${customer.id}_${
              payload.contentType || 'diagnosis'
            }_v1_vs_v2.json`,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              savedAt: cfg.paths.history,
              sampleSavedAt: comp.sampleSavedAt,
              comparisonReport: comp.comparisonReport,
            })
          );
          return;
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = getConfig().port;
  const server = createWebServer();
  server.listen(port, () => {
    console.log(
      `Interface Web do Prompt Evaluation Harness rodando em: http://localhost:${port}`
    );
  });
}
