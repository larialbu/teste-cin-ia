#!/usr/bin/env node
import readline from 'node:readline';
import { runPromptComparisonHarness } from '../harness/runner.js';
import { generateContentByType } from '../services/generators.js';
import { getCustomerById, loadCustomers } from '../services/storage.js';

/**
 * Servidor MCP (Model Context Protocol) via JSON-RPC 2.0 sobre Stdio.
 * Expõe as capacidades do Assistente de Suporte e do Prompt Evaluation Harness como ferramentas MCP para agentes.
 */
const MCP_TOOLS = [
  {
    name: 'list_customer_profiles',
    description:
      'Lista os perfis de clientes cadastrados em data/customers.json com nível técnico, estilo de comunicação e canal.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'generate_support_content',
    description:
      'Gera um dos 4 tipos de conteúdo de suporte (diagnosis, resolution_steps, clarifying_questions, flow_summary) adaptado ao perfil do cliente.',
    inputSchema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string', description: 'Ex: cust_01, cust_02, cust_03' },
        ticket: { type: 'string', description: 'Relato do problema/ticket' },
        content_type: {
          type: 'string',
          enum: [
            'diagnosis',
            'resolution_steps',
            'clarifying_questions',
            'flow_summary',
          ],
        },
        prompt_version: { type: 'string', enum: ['v1', 'v2'] },
      },
      required: ['customer_id', 'ticket', 'content_type'],
    },
  },
  {
    name: 'compare_prompt_versions',
    description:
      'Executa o Prompt Evaluation Harness comparando v1 vs v2 para o mesmo cliente e ticket aplicando a rubrica fixa de 3 critérios.',
    inputSchema: {
      type: 'object',
      properties: {
        customer_id: { type: 'string' },
        ticket: { type: 'string' },
        content_type: {
          type: 'string',
          enum: [
            'diagnosis',
            'resolution_steps',
            'clarifying_questions',
            'flow_summary',
          ],
        },
      },
      required: ['customer_id', 'ticket'],
    },
  },
];

async function handleJsonRpcMessage(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'support-prompt-harness-mcp',
          version: '1.0.0',
        },
      },
    };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: MCP_TOOLS },
    };
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    if (toolName === 'list_customer_profiles') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(loadCustomers(), null, 2),
            },
          ],
        },
      };
    }

    if (toolName === 'generate_support_content') {
      const customer = getCustomerById(args.customer_id || 'cust_01');
      const res = await generateContentByType(
        args.content_type || 'diagnosis',
        {
          customer,
          ticket: args.ticket,
          promptVersion: args.prompt_version || 'v2',
        }
      );
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(res.record, null, 2),
            },
          ],
        },
      };
    }

    if (toolName === 'compare_prompt_versions') {
      const customer = getCustomerById(args.customer_id || 'cust_01');
      const comp = await runPromptComparisonHarness({
        customer,
        ticket: args.ticket,
        contentType: args.content_type || 'diagnosis',
        versions: ['v1', 'v2'],
      });
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(comp.comparisonReport, null, 2),
            },
          ],
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Ferramenta MCP desconhecida: ${toolName}` },
    };
  }

  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    try {
      const msg = JSON.parse(line);
      const response = await handleJsonRpcMessage(msg);
      if (response) {
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (err) {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: err.message },
        }) + '\n'
      );
    }
  });
}

export { handleJsonRpcMessage, MCP_TOOLS };

