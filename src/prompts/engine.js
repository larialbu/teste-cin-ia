/**
 * Motor de Engenharia de Prompt (Spec 02).
 *
 * Demonstra explicitamente os 5 elementos exigidos no desafio:
 * 1. Persona prompting (papel, responsabilidade e limites)
 * 2. Context setting (dados relevantes do cliente e do ticket)
 * 3. Decomposição do diagnóstico (hipóteses, evidências, informações faltantes e conclusão)
 * 4. Output formatting (schema JSON, campos, nível de detalhe e restrições)
 * 5. Versionamento de prompt (v1 vs v2 para comparação controlada no Harness)
 */

export const PROMPT_VERSIONS_META = {
  v1: {
    version: 'v1',
    name: 'v1 - Baseline Structured Support Prompt',
    strategy_summary:
      'Prompt estruturado básico: define papel, injeta perfil e ticket, solicita decomposição e schema JSON, mas sem matriz explícita de restrição vocabular por nível técnico nem adaptação estrutural por canal.',
  },
  v2: {
    version: 'v2',
    name: 'v2 - Persona-Calibrated & Channel-Matrix Prompt',
    strategy_summary:
      'Prompt avançado calibrado por matriz multidimensional: aplica restrições léxicas negativas/positivas por nível técnico, modulação de densidade por estilo de comunicação, regras de formatação por canal (chat/e-mail/telefone), ancoragem entre hipóteses e perguntas, e checklist de auto-verificação.',
  },
};

const TECHNICAL_LEVEL_CALIBRATION = {
  leigo: {
    vocabulary_rules:
      'PROIBIDO usar jargões técnicos puros sem tradução imediata (ex: em vez de apenas "HTTP 502 Bad Gateway", explique como "uma falha temporária de comunicação entre a loja e a operadora do cartão"; em vez de "cache/payload", use "memória temporária do navegador").',
    depth_rules:
      'Foque na segurança emocional do usuário (ex: tranquilizar sobre cobrança duplicada) e em ações visuais simples na tela (botões, menus visíveis).',
  },
  intermediário: {
    vocabulary_rules:
      'Use termos funcionais de produto e tecnologia do dia a dia (ex: "filtro de período", "timeout do navegador", "limpar cache", "extensões", "status do pedido"), evitando apenas detalhes de infraestrutura baixo nível.',
    depth_rules:
      'Combine orientação prática na interface com pequenas verificações de contorno (ex: dividir o período do relatório ou testar em aba anônima).',
  },
  avançado: {
    vocabulary_rules:
      'Use vocabulário técnico preciso e direto de engenharia de software/infraestrutura (ex: "HTTP 502/401", "upstream timeout", "idempotency-key", "webhook retry", "JWT clock skew", "connection pool", "cURL", "headers de resposta").',
    depth_rules:
      'Vá direto à causa raiz arquitetural, logs de observabilidade, headers HTTP, payloads e testes reproduzíveis via CLI/API sem analogias infantis.',
  },
};

const COMMUNICATION_STYLE_CALIBRATION = {
  direto:
    'Seja conciso, objetivo e orientado à ação imediata. Frases curtas, zero floreios introdutórios, listas enxutas.',
  detalhado:
    'Forneça explicação completa de causa-efeito, contexto técnico/operacional, pré-requisitos de cada etapa e critérios claros de validação.',
  didático:
    'Adote tom acolhedor, paciente e educativo. Explique o "porquê" de cada passo em linguagem acessível e indique exatamente o que o usuário verá na tela ao concluir.',
};

const CHANNEL_CALIBRATION = {
  chat:
    'Formato otimizado para janela de CHAT: blocos curtos, frases escaneáveis, passos rápidos que o cliente consegue executar enquanto conversa em tempo real.',
  'e-mail':
    'Formato otimizado para E-MAIL: resposta completa, autossuficiente e bem estruturada para minimizar idas e vindas assíncronas, cobrindo cenário principal e plano de contingência.',
  telefone:
    'Formato otimizado para TELEFONE: roteiro guiado passo a passo para condução sincrônica na linha, com confirmações verbais curtas ("Me avise quando aparecer na sua tela...").',
};

const OUTPUT_SCHEMAS = {
  diagnosis: {
    description:
      'Diagnóstico estruturado do problema em hipóteses, evidências disponíveis, dados faltantes e conclusão provável (sem expor raciocínio interno bruto fora da estrutura).',
    schema: {
      summary: 'string (resumo executivo calibrado ao perfil do cliente)',
      hypotheses: [
        {
          id: 'string (ex: H1, H2, H3)',
          description: 'string (descrição clara da hipótese)',
          likelihood: 'string ("alta" | "média" | "baixa")',
        },
      ],
      available_evidence: [
        'string (sinais e fatos concretos extraídos diretamente do ticket)',
      ],
      missing_data: [
        'string (informações que faltam para fechar 100% o diagnóstico)',
      ],
      probable_conclusion:
        'string (conclusão mais provável e recomendação imediata)',
    },
  },
  resolution_steps: {
    description:
      'Passo a passo acionável de resolução adaptado ao nível técnico, estilo de comunicação e canal de atendimento do cliente.',
    schema: {
      greeting_and_tone:
        'string (saudação e abertura alinhadas ao canal e estilo do cliente)',
      estimated_time: 'string (ex: "2 a 3 minutos")',
      steps: [
        {
          step_number: 'number (1, 2, 3...)',
          action: 'string (título curto da ação)',
          explanation:
            'string (instrução adaptada ao nível técnico, estilo e canal)',
          expected_result:
            'string (como o cliente ou atendente confirma que o passo deu certo)',
        },
      ],
      fallback_plan:
        'string (o que fazer se os passos acima não resolverem o problema)',
    },
  },
  clarifying_questions: {
    description:
      'Perguntas de esclarecimento estritamente priorizadas para coletar apenas as informações essenciais que faltam para avançar no atendimento.',
    schema: {
      context_note:
        'string (explicação breve adaptada ao cliente sobre por que essas perguntas ajudam a resolver mais rápido)',
      questions: [
        {
          priority: 'number (1 = mais crítica, 2, 3...)',
          question:
            'string (pergunta redigida no vocabulário e canal adequados ao cliente)',
          why_it_matters:
            'string (qual dado faltante esta pergunta resolve ou qual hipótese ela valida)',
          target_hypothesis: 'string (ex: "H1", "H2")',
        },
      ],
    },
  },
  flow_summary: {
    description:
      'Resumo visual do fluxo de decisão em formato de fluxograma ASCII legível e lista estruturada de nós de decisão.',
    schema: {
      title: 'string (título do fluxo de atendimento/diagnóstico)',
      ascii_flowchart:
        'string (fluxograma ASCII multi-linha usando caixas +---+ e setas | v -->)',
      decision_nodes: [
        {
          condition: 'string (pergunta ou ponto de verificação no fluxo)',
          if_yes: 'string (ação/caminho se verdadeiro)',
          if_no: 'string (ação/caminho se falso)',
        },
      ],
    },
  },
};

/**
 * 1. Persona Prompting
 */
export function buildPersonaBlock(version) {
  if (version === 'v1') {
    return `[1. PERSONA]
Você é um assistente de suporte técnico ao cliente. Seu objetivo é analisar o problema relatado e ajudar o cliente a resolvê-lo de acordo com o perfil dele.`;
  }

  return `[1. PERSONA & LIMITES OPERACIONAIS]
Você é um Engenheiro de Suporte Técnico Sênior e Especialista em Comunicação Adaptativa.
Responsabilidades:
- Diagnosticar incidentes com rigor empírico, separando fatos observados de hipóteses.
- Traduzir conceitos técnicos para a exata camada cognitiva do cliente ("leigo", "intermediário" ou "avançado"), respeitando seu estilo ("direto", "detalhado" ou "didático") e canal ("chat", "e-mail" ou "telefone").
Limites e Guardrails:
- NUNCA invente evidências que não estejam no ticket.
- NUNCA solicite senhas, dados completos de cartão de crédito ou chaves privadas (secret keys).
- NUNCA emita raciocínio interno desestruturado fora dos campos JSON solicitados.`;
}

/**
 * 2. Context Setting
 */
export function buildContextBlock(customer, ticket, version) {
  const baseContext = `[2. CONTEXTO DO CLIENTE E TICKET]
- Cliente ID: ${customer.id}
- Nome: ${customer.name}
- Nível Técnico: ${customer.technical_level}
- Estilo de Comunicação: ${customer.communication_style}
- Canal de Atendimento: ${customer.channel}
- Ticket / Problema Relatado:
"""
${ticket.trim()}
"""`;

  if (version === 'v1') {
    return baseContext;
  }

  const techCal =
    TECHNICAL_LEVEL_CALIBRATION[customer.technical_level] ||
    TECHNICAL_LEVEL_CALIBRATION['intermediário'];
  const styleCal =
    COMMUNICATION_STYLE_CALIBRATION[customer.communication_style] ||
    COMMUNICATION_STYLE_CALIBRATION['direto'];
  const channelCal =
    CHANNEL_CALIBRATION[customer.channel] || CHANNEL_CALIBRATION['chat'];

  return `${baseContext}

[2.1 MATRIZ DE CALIBRAÇÃO OBRIGATÓRIA PARA ESTE PERFIL (v2)]
- Calibração Léxica (${customer.technical_level.toUpperCase()}): ${techCal.vocabulary_rules}
- Calibração de Profundidade (${customer.technical_level.toUpperCase()}): ${techCal.depth_rules}
- Calibração de Estilo (${customer.communication_style.toUpperCase()}): ${styleCal}
- Calibração de Canal (${customer.channel.toUpperCase()}): ${channelCal}`;
}

/**
 * 3. Decomposição do Diagnóstico e Estratégia por Tipo de Conteúdo
 */
export function buildDecompositionBlock(contentType, version) {
  const commonDecomposition = `[3. DECOMPOSIÇÃO DO DIAGNÓSTICO E ESTRATÉGIA (${contentType})]
Não exponha raciocínio interno longo ou divagações. Estruture sua análise internamente seguindo 4 pilares verificáveis:
1) Hipóteses numeradas (H1, H2, H3) ordenadas por probabilidade;
2) Evidências disponíveis extraídas literalmente dos sintomas do ticket;
3) Dados faltantes necessários para confirmar a causa raiz;
4) Conclusão provável acionável.`;

  if (version === 'v1') {
    return `${commonDecomposition}
Gere o conteúdo do tipo "${contentType}" conforme o formato de saída abaixo.`;
  }

  const specificInstructionsV2 = {
    diagnosis:
      'Diretriz v2 para DIAGNÓSTICO: Formule hipóteses mutuamente distintas (ex: H1 falha/timeout no serviço externo ou gateway, H2 estado inconsistente/duplicidade ou sessão local, H3 limitação de rede/payload). Adapte o campo "summary" e "probable_conclusion" ao nível técnico do cliente.',
    resolution_steps:
      'Diretriz v2 para PASSO A PASSO: O Passo 1 DEVE ser uma verificação segura de estado (ex: checar se a operação já foi processada antes de tentar de novo, evitando duplicidade). Cada passo deve ter um "expected_result" verificável pelo perfil do usuário.',
    clarifying_questions:
      'Diretriz v2 para PERGUNTAS DE ESCLARECIMENTO: Aplique o princípio da Navalha de Occam — faça de 3 a 4 perguntas cirúrgicas ordenadas por prioridade (1 = mais crítica). Cada pergunta deve estar vinculada a uma hipótese ("target_hypothesis": "H1", etc.) e ser formulada na linguagem que o cliente realmente sabe responder.',
    flow_summary:
      'Diretriz v2 para RESUMO VISUAL DO FLUXO: Construa um fluxograma ASCII limpo com caixas (+---+) e bifurcações claras ([SIM] / [NÃO]), acompanhado dos nós de decisão estruturados para fácil leitura em terminal ou documentação.',
  };

  return `${commonDecomposition}
${specificInstructionsV2[contentType] || ''}`;
}

/**
 * 4. Output Formatting & 5. Prompt Versioning
 */
export function buildOutputFormatBlock(contentType, version) {
  const schemaDef = OUTPUT_SCHEMAS[contentType];
  const baseFormat = `[4. FORMATO DE SAÍDA (OUTPUT FORMATTING)]
Tipo solicitado: ${contentType} (${schemaDef.description})
Retorne EXCLUSIVAMENTE um objeto JSON válido (sem blocos markdown \`\`\`json ao redor se possível, apenas o JSON puro) seguindo exatamente este schema:
${JSON.stringify(schemaDef.schema, null, 2)}

[5. METADADOS DE VERSIONAMENTO]
Prompt Version: ${version} (${PROMPT_VERSIONS_META[version]?.name || version})
Idioma obrigatório: Português do Brasil (pt-BR).`;

  if (version === 'v1') {
    return baseFormat;
  }

  return `${baseFormat}

[5.1 CHECKLIST DE AUTO-VERIFICAÇÃO ANTES DE RESPONDER (v2)]
- O vocabulário respeita estritamente as restrições do nível técnico do cliente?
- A formatação e o tom estão adequados ao canal e estilo de comunicação?
- Todos os campos obrigatórios do JSON estão preenchidos sem valores vazios?`;
}

/**
 * Função principal que monta o prompt completo dinamicamente.
 */
export function buildPrompt({ customer, ticket, contentType, promptVersion = 'v2' }) {
  const version = PROMPT_VERSIONS_META[promptVersion] ? promptVersion : 'v2';

  const sections = {
    persona: buildPersonaBlock(version),
    context: buildContextBlock(customer, ticket, version),
    decomposition: buildDecompositionBlock(contentType, version),
    output_format: buildOutputFormatBlock(contentType, version),
    version_meta: PROMPT_VERSIONS_META[version],
  };

  const fullPrompt = [
    sections.persona,
    sections.context,
    sections.decomposition,
    sections.output_format,
  ].join('\n\n');

  return {
    promptVersion: version,
    contentType,
    customerId: customer.id,
    sections,
    fullPrompt,
  };
}
