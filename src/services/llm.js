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
    throw new Error(`Não foi possível extrair JSON válido da saída: ${trimmed.slice(0, 120)}...`);
  }
}

/**
 * Chamada HTTP real para a API do Google Gemini (generateContent) usando fetch nativo do Node.js.
 */
async function callGeminiApi({ prompt, model, apiKey, temperature }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
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

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Erro na API Gemini (HTTP ${response.status}): ${errorBody.slice(0, 300)}`
    );
  }

  const data = await response.json();
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ||
    '';

  return parseJsonFromModelText(text);
}

/**
 * Simulador determinístico sensível a Perfil, Ticket, Tipo de Conteúdo e Versão do Prompt (v1 vs v2).
 * Permite executar o Prompt Evaluation Harness e a suíte de testes SDD 100% offline ou quando GEMINI_API_KEY não está configurada,
 * refletindo fielmente o impacto das instruções de v1 (genérica/jargão não calibrado) vs v2 (matriz calibrada ao perfil e canal).
 */
export function generateSimulatedResponse({
  customer,
  ticket,
  contentType,
  promptVersion,
}) {
  const isV1 = promptVersion === 'v1';
  const level = customer.technical_level;
  const style = customer.communication_style;
  const channel = customer.channel;
  const ticketLower = ticket.toLowerCase();

  const isPayment502 =
    ticketLower.includes('502') ||
    ticketLower.includes('pagamento') ||
    ticketLower.includes('cartão');
  const isCsvExport =
    ticketLower.includes('csv') ||
    ticketLower.includes('relatório') ||
    ticketLower.includes('85%');

  if (contentType === 'diagnosis') {
    if (isV1) {
      // v1: Estrutura básica funcional, porém usa vocabulário técnico padrão sem calibrar ao nível do cliente (ex: fala de upstream, idempotência e payload mesmo para cliente leigo).
      return {
        summary: `Análise técnica do ticket para ${customer.name}: detectada falha de comunicação ou timeout de processamento durante a operação relatada.`,
        hypotheses: [
          {
            id: 'H1',
            description: isPayment502
              ? 'Timeout de upstream (HTTP 502 Bad Gateway) entre o backend da plataforma e o adquirente/gateway de cartão após 30s.'
              : isCsvExport
              ? 'Estouro de memória/timeout de execução síncrona na query de agregação do CSV de 30 dias.'
              : 'Falha de sincronização de cache de token OAuth2 ou clock skew entre nós do cluster de autenticação.',
            likelihood: 'alta',
          },
          {
            id: 'H2',
            description: isPayment502
              ? 'Transação processada no gateway sem retorno do webhook de confirmação (risco de retentativa sem chave de idempotência).'
              : 'Bloqueio da thread principal do navegador por excesso de linhas renderizadas no DOM antes do download.',
            likelihood: 'média',
          },
        ],
        available_evidence: [
          isPayment502
            ? 'Latência de ~30 segundos seguida de código HTTP 502 a partir das 14h.'
            : isCsvExport
            ? 'Progresso interrompido em 85% com filtro de 30 dias e travamento da aba do navegador.'
            : 'Sintoma de erro reportado diretamente no relato do ticket.',
        ],
        missing_data: [
          'ID da transação/requisição nos logs do servidor.',
          'Confirmação do status atual do registro no banco de dados.',
        ],
        probable_conclusion:
          'Necessário verificar o status da operação no backend antes de reexecutar a chamada para evitar efeitos colaterais.',
      };
    }

    // v2: Vocabulário, profundidade e tom rigorosamente calibrados ao nível técnico (leigo vs intermediário vs avançado) e estilo.
    if (level === 'leigo') {
      return {
        summary:
          'Olá, Dona Helena! O erro que apareceu na sua tela significa apenas que a conexão com a operadora do cartão demorou mais que o normal (30 segundos) e a resposta não voltou a tempo para a sua tela. Fique tranquila: vamos conferir se a venda já entrou antes de tentar passar o cartão de novo, assim não há risco de cobrar duas vezes.',
        hypotheses: [
          {
            id: 'H1',
            description:
              'Lentidão temporária na resposta da operadora do cartão às 14h (o sistema esperou 30 segundos e encerrou a espera por segurança).',
            likelihood: 'alta',
          },
          {
            id: 'H2',
            description:
              'O pagamento pode ter sido aprovado na operadora no último segundo, mas o aviso de confirmação ainda não atualizou na tela da sua loja.',
            likelihood: 'média',
          },
          {
            id: 'H3',
            description:
              'Oscilação rápida na internet da loja no momento em que o botão "Finalizar pagamento" foi clicado.',
            likelihood: 'baixa',
          },
        ],
        available_evidence: [
          'As tentativas começaram por volta das 14h.',
          'A tela ficou carregando por cerca de 30 segundos após clicar em finalizar pagamento.',
          'Mensagem exibida: "Erro 502 - Falha na comunicação com o gateway" (indica falta de resposta da operadora).',
        ],
        missing_data: [
          'Saber se o pedido aparece como "Pago" ou "Pendente" na sua lista de Minhas Vendas.',
          'Saber se o cliente recebeu algum SMS ou notificação do banco no celular dele.',
          'Número ou valor aproximado dessa venda das 14h.',
        ],
        probable_conclusion:
          'Houve uma falha momentânea de comunicação com a operadora do cartão. O passo mais importante agora é olhar a tela "Minhas Vendas" para confirmar se a cobrança entrou antes de tentar passar o cartão novamente.',
      };
    }

    if (level === 'avançado') {
      return {
        summary: `Diagnóstico Técnico (${channel.toUpperCase()} | Perfil Avançado): Incidente caracterizado por timeout de upstream (HTTP 502 após 30s) ou rejeição de autenticação distribuída. Prioridade máxima: garantir idempotência e inspecionar headers de correlação antes de replay.`,
        hypotheses: [
          {
            id: 'H1',
            description: isPayment502
              ? 'Timeout no proxy reverso/API Gateway (30s threshold) aguardando resposta síncrona do provedor de pagamento (PSP), gerando HTTP 502 Bad Gateway.'
              : 'Propagação assíncrona incompleta do novo JWKS/token OAuth2 entre réplicas do Authorizer ou clock skew (>30s) causando HTTP 401 em ~20% dos workers.',
            likelihood: 'alta',
          },
          {
            id: 'H2',
            description: isPayment502
              ? 'Estado de meia-transação (split-brain): autorização efetivada no PSP, porém webhook de callback atrasado na fila de mensageria.'
              : 'Reutilização de conexão HTTP keep-alive em pool com header Authorization obsoleto em workers concorrentes.',
            likelihood: 'média',
          },
          {
            id: 'H3',
            description:
              'Rate limiting ou degradação parcial no endpoint de destino durante janela de pico.',
            likelihood: 'baixa',
          },
        ],
        available_evidence: [
          isPayment502
            ? 'Timeout determinístico de ~30s seguido de HTTP 502 a partir das 14:00.'
            : 'Taxa de falha de ~20% (HTTP 401) em POST /v2/orders logo após rotação de token OAuth com TTL de 3600s.',
        ],
        missing_data: [
          'Header X-Request-ID ou traceparent das requisições com falha.',
          'Estado atual da chave de idempotência (Idempotency-Key) e logs do consumidor de webhooks.',
          'Timestamp UTC exato e hash parcial (últimos 4 dígitos) do token/transação.',
        ],
        probable_conclusion:
          'Alta probabilidade de timeout de upstream com possível processamento assíncrono em andamento. Consulte o endpoint de status/auditoria usando o X-Request-ID antes de disparar retry.',
      };
    }

    // Intermediário v2
    return {
      summary: `Diagnóstico objetivo (${customer.name}): O travamento ocorre porque o volume de dados ou tempo de resposta excedeu o limite da operação direta pelo navegador.`,
      hypotheses: [
        {
          id: 'H1',
          description:
            'Volume de registros do período selecionado (30 dias) excede o tempo limite de geração direta no navegador (travando em 85%).',
          likelihood: 'alta',
        },
        {
          id: 'H2',
          description:
            'Acúmulo de cache ou extensão do navegador bloqueando o disparo automático do download do arquivo CSV.',
          likelihood: 'média',
        },
      ],
      available_evidence: [
        'Progresso trava consistentemente em 85% ao filtrar 30 dias.',
        'Alerta do navegador indicando que a página parou de responder.',
      ],
      missing_data: [
        'Quantidade aproximada de linhas/transações no mês filtrado.',
        'Se o download funciona ao filtrar apenas 7 ou 15 dias.',
      ],
      probable_conclusion:
        'A exportação de 30 dias completos está atingindo o limite de memória da aba. Dividir o filtro em duas quinzenas destrava o fechamento imediatamente.',
    };
  }

  if (contentType === 'resolution_steps') {
    if (isV1) {
      return {
        greeting_and_tone: `Olá ${customer.name}, seguem os passos técnicos para resolver o problema relatado no ticket.`,
        estimated_time: '5 minutos',
        steps: [
          {
            step_number: 1,
            action: 'Verificar status da transação/requisição no sistema',
            explanation:
              'Acesse o painel administrativo ou logs de transação para checar se o processo retornou commit ou rollback após o erro.',
            expected_result: 'Identificar o status atual do registro.',
          },
          {
            step_number: 2,
            action: 'Limpar cache de sessão e repetir a operação',
            explanation:
              'Limpe os dados de sessão do navegador (Ctrl+Shift+Del) e reenvie o formulário.',
            expected_result: 'Operação concluída com status HTTP 200.',
          },
          {
            step_number: 3,
            action: 'Acionar suporte nível 2 com logs',
            explanation:
              'Capture o HAR ou log do console (F12 > Network) caso o erro persista.',
            expected_result: 'Evidência técnica anexada ao chamado.',
          },
        ],
        fallback_plan:
          'Se o erro continuar, abra um incidente com os logs de rede para análise do time de engenharia.',
      };
    }

    // v2 calibrado
    if (level === 'leigo') {
      return {
        greeting_and_tone:
          'Oi, Dona Helena! Vamos resolver isso juntos agora mesmo aqui pelo chat, passo a passo e com toda segurança para não cobrar seu cliente duas vezes:',
        estimated_time: '2 a 3 minutos',
        steps: [
          {
            step_number: 1,
            action: 'Conferir se a venda já entrou (evitar cobrança dupla)',
            explanation:
              'No menu lateral esquerdo da sua tela, clique em "Minhas Vendas" e olhe o primeiro pedido da lista (o das 14h). Veja também com o cliente se chegou alguma mensagem do banco no celular dele.',
            expected_result:
              'Se estiver escrito "Aprovada" (em verde), a venda já deu certo e você não precisa cobrar de novo! Se estiver "Não finalizada" ou não aparecer, siga para o Passo 2.',
          },
          {
            step_number: 2,
            action: 'Atualizar a tela de vendas para limpar a falha temporária',
            explanation:
              'Aperte a tecla F5 do seu teclado (ou clique na setinha circular ao lado do endereço lá no topo da tela) para renovar a conexão com a operadora do cartão.',
            expected_result:
              'A tela de caixa vai recarregar limpa, sem a mensagem de Erro 502.',
          },
          {
            step_number: 3,
            action: 'Finalizar a venda novamente com segurança',
            explanation:
              'Com a certeza de que a venda anterior não foi cobrada, preencha os dados do pagamento e clique uma única vez em "Finalizar pagamento", aguardando até 10 segundos.',
            expected_result:
              'Aparecerá na tela a mensagem verde "Pagamento Aprovado" e o comprovante para impressão.',
          },
        ],
        fallback_plan:
          'Se a mensagem de Erro 502 aparecer mais uma vez, não tente uma terceira vez: me mande aqui no chat o valor da venda e os 4 últimos números do cartão que eu consulto direto no sistema para você!',
      };
    }

    if (level === 'avançado') {
      return {
        greeting_and_tone: `Olá, ${customer.name}. Segue o runbook técnico detalhado para mitigação segura, validação de idempotência e coleta de telemetria:`,
        estimated_time: '3 a 5 minutos',
        steps: [
          {
            step_number: 1,
            action: 'Auditar estado da transação e chave de idempotência',
            explanation:
              'Consulte o endpoint GET /v2/transactions?created_after=14:00 ou inspecione o log pelo header X-Request-ID / Idempotency-Key para verificar se o PSP confirmou a captura via webhook assíncrono após o timeout de 30s do proxy.',
            expected_result:
              'Confirmar se o estado no ledger interno é AUTHORIZED, PENDING_WEBHOOK ou FAILED antes de qualquer retry.',
          },
          {
            step_number: 2,
            action: 'Executar retry seguro preservando a mesma Idempotency-Key',
            explanation:
              'Caso o status seja FAILED ou gateway_timeout sem registro no PSP, reenvie o payload mantendo o mesmo header Idempotency-Key (garantindo deduplicação atômica no gateway) e configure timeout de cliente para 45s.',
            expected_result:
              'Retorno HTTP 200/201 com transaction_id íntegro e sem duplicação de cobrança.',
          },
          {
            step_number: 3,
            action: 'Capturar headers de resposta e trace de rede',
            explanation:
              'Se o HTTP 502/401 persistir, extraia os headers cf-ray / x-amzn-trace-id / x-upstream-latency da resposta de erro para correlação no APM.',
            expected_result:
              'Identificação exata do nó de upstream que abortou a conexão.',
          },
        ],
        fallback_plan:
          'Responda este e-mail com o X-Request-ID e o timestamp UTC das chamadas com falha para acionarmos o bypass de rota secundária no gateway.',
      };
    }

    return {
      greeting_and_tone: `Olá, ${customer.name}. Como estamos ao telefone, vou te guiar de forma direta em 3 passos rápidos para destravar sua exportação agora:`,
      estimated_time: '2 minutos na linha',
      steps: [
        {
          step_number: 1,
          action: 'Dividir o filtro de 30 dias em duas quinzenas',
          explanation:
            'Na tela de relatórios, altere a data inicial e final para pegar primeiro do dia 01 ao dia 15 do mês passado e clique em Exportar CSV.',
          expected_result:
            'A barra passará dos 85% rapidamente e o primeiro arquivo CSV será baixado no seu computador.',
        },
        {
          step_number: 2,
          action: 'Exportar a segunda quinzena (dia 16 ao dia 30/31)',
          explanation:
            'Agora mude o filtro para o período de 16 até o último dia do mês e clique novamente em Exportar CSV.',
          expected_result:
            'Download do segundo arquivo CSV concluído sem travar o navegador.',
        },
        {
          step_number: 3,
          action: 'Solicitar exportação completa por e-mail em segundo plano',
          explanation:
            'Para futuros relatórios de 30 dias completos, marque a opção "Enviar link por e-mail" ao lado do botão Exportar, evitando o processamento pesado na aba do navegador.',
          expected_result:
            'Recebimento do CSV consolidado na sua caixa de entrada em até 2 minutos.',
        },
      ],
      fallback_plan:
        'Continue na linha comigo: se mesmo com 15 dias a barra travar, eu gero o arquivo CSV aqui pelo painel interno e disparo para o seu e-mail corporativo agora mesmo.',
    };
  }

  if (contentType === 'clarifying_questions') {
    if (isV1) {
      return {
        context_note:
          'Precisamos de algumas informações técnicas adicionais para investigar o problema relatado.',
        questions: [
          {
            priority: 1,
            question:
              'Qual o Request-ID ou código da transação que apresentou o erro no console/network?',
            why_it_matters: 'Permite rastrear a requisição nos logs do servidor.',
            target_hypothesis: 'H1',
          },
          {
            priority: 2,
            question:
              'O problema ocorre em outros navegadores ou redes diferentes?',
            why_it_matters: 'Isola problemas de ambiente local.',
            target_hypothesis: 'H2',
          },
          {
            priority: 3,
            question:
              'Qual a versão do navegador e sistema operacional utilizados?',
            why_it_matters: 'Ajuda a reproduzir o cenário.',
            target_hypothesis: 'H2',
          },
        ],
      };
    }

    if (level === 'leigo') {
      return {
        context_note:
          'Dona Helena, para eu verificar agora mesmo se a venda foi cobrada ou não, me responda só essas 3 perguntinhas rápidas aqui no chat:',
        questions: [
          {
            priority: 1,
            question:
              'Quando a senhora entra em "Minhas Vendas", esse pedido das 14h aparece na lista como "Aprovado", "Pendente" ou não aparece lá?',
            why_it_matters:
              'Confirma imediatamente se o pagamento chegou a ser registrado antes da tela dar erro, evitando cobrar duas vezes.',
            target_hypothesis: 'H2',
          },
          {
            priority: 2,
            question:
              'O seu cliente chegou a receber algum aviso ou SMS do banco no celular dele dizendo que a compra foi aprovada?',
            why_it_matters:
              'Verifica se a operadora do cartão aprovou a cobrança mesmo sem a resposta ter voltado para a tela da loja.',
            target_hypothesis: 'H1',
          },
          {
            priority: 3,
            question:
              'Qual foi o valor exato dessa venda (e, se tiver fácil, o nome do cliente ou horário aproximado)?',
            why_it_matters:
              'Permite localizar a tentativa exata das 14h no nosso sistema interno sem precisar que a senhora procure códigos técnicos.',
            target_hypothesis: 'H1',
          },
        ],
      };
    }

    if (level === 'avançado') {
      return {
        context_note:
          'Para isolarmos rapidamente a falha no gateway/authorizer sem rodadas extras de triagem, confirme os 3 pontos abaixo:',
        questions: [
          {
            priority: 1,
            question:
              'Qual o valor do header X-Request-ID (ou Idempotency-Key) e o timestamp UTC das requisições que retornaram HTTP 502/401?',
            why_it_matters:
              'Permite rastrear o trace distribuído no API Gateway e confirmar se a chamada atingiu o serviço de upstream.',
            target_hypothesis: 'H1',
          },
          {
            priority: 2,
            question:
              'Vocês observaram recepção posterior do evento de webhook (payment.succeeded / order.created) para essas transações que sofreram timeout de 30s?',
            why_it_matters:
              'Confirma ou descarta a hipótese de processamento assíncrono concluído com queda apenas na conexão HTTP síncrona.',
            target_hypothesis: 'H2',
          },
          {
            priority: 3,
            question:
              'As chamadas estão reutilizando a mesma conexão keep-alive ou passando por algum proxy/egress NAT específico?',
            why_it_matters:
              'Descarta problemas de pool de conexões ou cache de sessão TLS/OAuth em workers concorrentes.',
            target_hypothesis: 'H3',
          },
        ],
      };
    }

    return {
      context_note:
        'Para destravarmos isso agora na ligação, me confirme apenas estes 3 pontos rápidos:',
      questions: [
        {
          priority: 1,
          question:
            'Se você reduzir o filtro de data para apenas 7 ou 15 dias, o download do CSV conclui normalmente?',
          why_it_matters:
            'Confirma se o travamento em 85% é causado exclusivamente pelo volume de dados do período de 30 dias.',
          target_hypothesis: 'H1',
        },
        {
          priority: 2,
          question:
            'Qual é a filial ou centro de custo selecionado nesse relatório mensal?',
          why_it_matters:
            'Permite estimar a volumetria de linhas e, se necessário, gerar o CSV diretamente pelo nosso banco.',
          target_hypothesis: 'H1',
        },
        {
          priority: 3,
          question:
            'Você está usando o Google Chrome ou outro navegador neste momento?',
          why_it_matters:
            'Descarta bloqueio de pop-up/download por extensão na etapa final de geração do arquivo.',
          target_hypothesis: 'H2',
        },
      ],
    };
  }

  // flow_summary
  if (isV1) {
    return {
      title: `Fluxo de Resolução - Ticket (${customer.id})`,
      ascii_flowchart: [
        '+---------------------------------------+',
        '| Início: Erro reportado no Ticket      |',
        '+---------------------------------------+',
        '                    |',
        '                    v',
        '+---------------------------------------+',
        '| Verificar status da operação/logs     |',
        '+---------------------------------------+',
        '           /                 \\',
        '     [Processado]        [Não Processado]',
        '         /                     \\',
        '        v                       v',
        '+---------------+       +---------------+',
        '| Atualizar UI  |       | Repetir ação  |',
        '+---------------+       +---------------+',
      ].join('\n'),
      decision_nodes: [
        {
          condition: 'A operação foi registrada no servidor?',
          if_yes: 'Atualizar a interface e confirmar conclusão.',
          if_no: 'Limpar cache/sessão e executar novamente.',
        },
      ],
    };
  }

  // v2 flow_summary calibrado
  return {
    title: `Fluxo Visual de Decisão Calibrado (${customer.name} | Nível: ${level.toUpperCase()} | Canal: ${channel.toUpperCase()})`,
    ascii_flowchart: [
      '+---------------------------------------------------------------+',
      `| [INÍCIO] Ticket recebido via ${channel.toUpperCase().padEnd(8)} (${level.toUpperCase()})`.padEnd(64) + '|',
      '+---------------------------------------------------------------+',
      '                                |',
      '                                v',
      '+---------------------------------------------------------------+',
      '| PASSO 1: Verificar se a operação já foi concluída no sistema  |',
      '| (Ex: Tela "Minhas Vendas" / Notificação Banco / Status API)   |',
      '+---------------------------------------------------------------+',
      '                 /                             \\',
      '          [JÁ APROVADA]                  [NÃO REGISTRADA]',
      '               /                                 \\',
      '              v                                   v',
      '+------------------------------+   +----------------------------+',
      '| NÃO COBRAR / NÃO REPETIR!    |   | PASSO 2: Renovar sessão /  |',
      '| Apenas atualizar a tela (F5) |   | ajustar filtro e tentar 1x |',
      '| e emitir o comprovante.      |   +----------------------------+',
      '+------------------------------+                  |',
      '                                                  v',
      '                                   +----------------------------+',
      '                                   | Funcionou na 2ª tentativa? |',
      '                                   +----------------------------+',
      '                                         /                \\',
      '                                      [SIM]              [NÃO]',
      '                                       /                  \\',
      '                                      v                    v',
      '                           +-----------------+  +-------------------+',
      '                           | Atendimento     |  | Acionar Fallback: |',
      '                           | Concluído!      |  | Consulta interna  |',
      '                           +-----------------+  | pelo suporte (N2) |',
      '                                                +-------------------+',
    ].join('\n'),
    decision_nodes: [
      {
        condition:
          'A operação anterior já consta como aprovada/processada em "Minhas Vendas" ou no banco do cliente?',
        if_yes:
          'Interromper novas tentativas imediatamente para evitar duplicidade; apenas recarregar a tela e emitir o comprovante.',
        if_no:
          'Prosseguir para a atualização da sessão (F5 / retry idempotente) e executar uma única nova tentativa.',
      },
      {
        condition:
          'A nova tentativa após atualizar a sessão concluiu em até 10-15 segundos sem Erro 502?',
        if_yes: 'Confirmar sucesso com o cliente e encerrar o chamado.',
        if_no:
          'Não tentar uma 3ª vez; coletar valor/horário (ou Request-ID) e verificar diretamente na retaguarda do gateway.',
      },
    ],
  };
}

/**
 * Executa a chamada ao modelo configurado (Gemini real via HTTP ou Simulador determinístico).
 */
export async function executeLlmCall({
  promptObj,
  customer,
  ticket,
  contentType,
  promptVersion,
  configOverrides = {},
}) {
  const cfg = getConfig(configOverrides);

  if (cfg.provider === 'gemini' && cfg.hasRealApiKey) {
    try {
      const output = await callGeminiApi({
        prompt: promptObj.fullPrompt,
        model: cfg.model,
        apiKey: cfg.apiKey,
        temperature: cfg.temperature,
      });
      return {
        provider: 'gemini',
        model: cfg.model,
        temperature: cfg.temperature,
        output,
      };
    } catch (err) {
      if (configOverrides.strictRealApi) {
        throw err;
      }
      // Fallback gracioso documentado caso a chave falhe ou esteja sem rede no sandbox
      const fallbackOutput = generateSimulatedResponse({
        customer,
        ticket,
        contentType,
        promptVersion,
      });
      return {
        provider: 'mock-fallback',
        model: `${cfg.model} (fallback offline: ${err.message.slice(0, 60)})`,
        temperature: cfg.temperature,
        output: fallbackOutput,
      };
    }
  }

  const output = generateSimulatedResponse({
    customer,
    ticket,
    contentType,
    promptVersion,
  });

  return {
    provider: cfg.provider,
    model: cfg.model,
    temperature: cfg.temperature,
    output,
  };
}
