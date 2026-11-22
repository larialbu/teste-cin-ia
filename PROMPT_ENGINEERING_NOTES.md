# Notas de Engenharia de Prompt (`PROMPT_ENGINEERING_NOTES.md`)

Este documento detalha a arquitetura de **Engenharia de Prompt**, a metodologia **Specification-Driven Development (SDD)**, o **Prompt Evaluation Harness**, as diferenças controladas entre as versões `v1` e `v2`, e as decisões de trade-off adotadas neste projeto.

---

## 1. Visão Geral da Estratégia (SDD + Prompt Evaluation Harness)

Em vez de tratar prompts como strings estáticas acopladas ao código, o projeto foi estruturado sob dois conceitos de engenharia de IA:

1. **Specification-Driven Development (SDD)**:
   - As especificações formais em [`specs/`](./specs/) definem os contratos de domínio (`CustomerProfile`), os contratos JSON para cada um dos 4 tipos de conteúdo (`diagnosis`, `resolution_steps`, `clarifying_questions`, `flow_summary`) e as invariantes de validação em [`src/schemas/validator.js`](./src/schemas/validator.js).
2. **Prompt Evaluation Harness**:
   - Um motor de avaliação controlada ([`src/harness/runner.js`](./src/harness/runner.js)) que trava todas as variáveis independentes (`customer_id`, `ticket`, `content_type`, `provider`, `model`, `temperature`) e varia **exclusivamente** a versão do prompt (`v1` vs `v2`), validando os schemas e registrando a autoavaliação estruturada sob a rubrica obrigatória de 3 critérios (`clarity`, `customer_fit`, `actionability`).

---

## 2. Os 5 Pilares do Motor de Prompt (`src/prompts/engine.js`)

O módulo [`src/prompts/engine.js`](./src/prompts/engine.js) compila cada prompt dinamicamente em 5 blocos explícitos e auditáveis:

1. **Persona Prompting (`buildPersonaBlock`)**:
   - Define o papel do assistente, responsabilidades de triagem empírica e **limites operacionais/éticos** (proibição de inventar evidências ausentes no ticket, proibição de solicitar senhas ou chaves privadas, e proibição de despejar raciocínio interno desestruturado fora do contrato JSON).
2. **Context Setting (`buildContextBlock`)**:
   - Injeta os parâmetros do perfil do cliente (`id`, `name`, `technical_level`, `communication_style`, `channel`) e o relato integral do `ticket`.
   - Na versão `v2`, adiciona uma **Matriz Multidimensional de Calibração** que cruza as 3 dimensões do cliente.
3. **Decomposição do Diagnóstico (`buildDecompositionBlock`)**:
   - Instrui o modelo a separar fatos observados (`available_evidence`), hipóteses ordenadas por probabilidade (`H1`, `H2`, `H3`), lacunas de informação (`missing_data`) e conclusão acionável (`probable_conclusion`), sem armazenar *chain-of-thought* bruto desnecessário.
4. **Output Formatting (`buildOutputFormatBlock`)**:
   - Especifica o JSON Schema determinístico para cada uma das 4 estratégias (`generateDiagnosis`, `generateResolutionSteps`, `generateClarifyingQuestions`, `generateFlowSummary`), exigindo JSON puro (`application/json`).
5. **Versionamento de Prompt (`PROMPT_VERSIONS_META`)**:
   - Identifica e rastreia explicitamente a versão utilizada (`v1` ou `v2`) tanto no prompt quanto no registro persistido em `data/history.json` e `samples/`.

---

## 3. Comparação Controlada: Versão `v1` vs Versão `v2`

### O que muda da `v1` para a `v2`?

| Dimensão do Prompt | `v1` (Baseline Structured Prompt) | `v2` (Persona-Calibrated & Channel-Matrix Prompt) |
| :--- | :--- | :--- |
| **Persona & Guardrails** | Define apenas "assistente de suporte técnico" de forma genérica. | Define Engenheiro de Suporte Sênior com limites explícitos de segurança e anti-alucinação. |
| **Adaptação ao Nível Técnico (`leigo`, `intermediário`, `avançado`)** | Menciona o nível técnico no bloco de contexto, mas não impõe restrições vocabulares negativas ou positivas. | Aplica **Restrições Léxicas Explícitas**: proíbe jargões sem tradução para `leigo` (traduzindo *HTTP 502 / gateway* para linguagem de negócio) e exige precisão arquitetural (*Idempotency-Key*, *X-Request-ID*, *webhook retry*) para `avançado`. |
| **Adaptação ao Estilo e Canal (`chat`, `e-mail`, `telefone`)** | Trata todos os canais com a mesma densidade textual. | Modula estrutura por canal: blocos curtos e imediatos para `chat`, roteiro guiado sincrônico para `telefone` e runbook autossuficiente para `e-mail`. |
| **Segurança Operacional no Passo a Passo** | Sugere limpar cache e repetir a operação sem antes garantir a verificação de estado. | Exige que o **Passo 1** seja sempre uma **verificação segura de estado** (ex: checar *"Minhas Vendas"* ou status de idempotência para evitar cobrança duplicada). |
| **Ancoragem de Perguntas (`clarifying_questions`)** | Gera perguntas genéricas de suporte (ex: "Qual navegador/SO?" ou "Qual Request-ID?" mesmo para usuário leigo). | Aplica a Navalha de Occam: 3 perguntas priorizadas (`priority: 1..3`), cada uma vinculada a uma hipótese (`target_hypothesis: H1/H2`) e respondível pelo nível técnico do cliente. |

---

## 4. Resultado da Rubrica Obrigatória (`v1` vs `v2`)

Cenário avaliado no Harness (salvo em [`samples/comparison_v1_vs_v2_diagnosis_cust_01.json`](./samples/comparison_v1_vs_v2_diagnosis_cust_01.json) e [`samples/comparison_v1_vs_v2_resolution_cust_01.json`](./samples/comparison_v1_vs_v2_resolution_cust_01.json)):
- **Cliente**: `cust_01` — Dona Helena (Lojista de Bairro | Nível: `leigo` | Estilo: `didático` | Canal: `chat`)
- **Ticket (`tkt_01`)**: *"Estou tentando fechar uma venda na plataforma desde as 14h, mas quando clico em finalizar pagamento com cartão a tela fica carregando por uns 30 segundos e depois aparece 'Erro 502 - Falha na comunicação com o gateway'. Não sei se o valor foi cobrado do cartão ou se posso tentar de novo sem duplicar a cobrança."*

| Critério da Rubrica (1 a 5) | Nota `v1` | Justificativa `v1` | Nota `v2` | Justificativa `v2` |
| :--- | :---: | :--- | :---: | :--- |
| **1. Clareza (`clarity`)** | **3 / 5** | A saída da `v1` é estruturada nos campos solicitados e gramaticalmente compreensível, porém apresenta termos técnicos sem contextualização e pouca formatação voltada à leitura rápida no canal do cliente. | **5 / 5** | Excelente organização visual e precisão: a `v2` separa claramente fatos, hipóteses numeradas (`H1`-`H3`) e passos verificáveis, eliminando ambiguidades e tranquilizando o cliente logo na abertura. |
| **2. Adequação ao nível do cliente (`customer_fit`)** | **2 / 5** | Fraca adequação ao perfil `leigo`/`didático`: a `v1` utiliza jargões de engenharia (*upstream timeout*, *idempotência*, *commit/rollback*, *Request-ID*) que geram insegurança e confusão para uma lojista não técnica no chat. | **5 / 5** | Totalmente calibrada ao perfil (`leigo`, estilo `didático`, canal `chat`): a matriz da `v2` traduz o Erro 502/timeout para a linguagem exata do usuário e adapta o formato ao canal `chat`. |
| **3. Acionabilidade (`actionability`)** | **3 / 5** | Embora sugira verificar o status antes de repetir a ação, as instruções da `v1` pedem ações pouco práticas para o usuário (como inspecionar logs de servidor ou arquivo HAR no F12), reduzindo a capacidade de execução imediata. | **5 / 5** | Altamente acionável: o primeiro passo previne efeitos colaterais (como cobrança duplicada em *"Minhas Vendas"*), cada etapa indica exatamente o que observar na tela e há um plano de fallback claro. |
| **Média Final** | **2.67 / 5** | Baseline funcional, porém desalinhado à persona leiga. | **5.00 / 5** | Prompt calibrado vencedor no Harness. |

---

## 5. Decisões Técnicas, Trade-offs e Limitações Conhecidas

1. **Quatro Chamadas Especializadas vs. Chamada Única Monolítica**:
   - *Decisão*: Implementar 4 funções geradoras separadas (`generateDiagnosis`, `generateResolutionSteps`, `generateClarifyingQuestions`, `generateFlowSummary`), cada uma com seu próprio bloco de decomposição e schema JSON.
   - *Trade-off*: Aumenta o número de requisições quando os 4 conteúdos são gerados simultaneamente, mas evita degradação de qualidade por *context dilution* e permite cachear/avaliar cada estratégia de forma granular.
2. **Cache Determinístico SHA-256 em Disco (`data/cache.json`)**:
   - *Decisão*: Normalizar o texto do ticket (`trim` + colapso de múltiplos espaços) e gerar um hash SHA-256 da tupla `(customer_id, ticket, content_type, prompt_version, provider, model, temperature)`.
   - *Trade-off*: O cache é exato/canônico (não semântico). Pequenas alterações de pontuação no ticket geram uma nova chave, garantindo reprodutibilidade estrita nos experimentos do Harness sem falsos positivos de similaridade vetorial.
3. **Dual-Mode LLM Engine (Google Gemini API + Simulador Determinístico Offline)**:
   - *Decisão*: O sistema conecta nativamente à API `generativelanguage.googleapis.com` (`gemini-2.5-flash`) quando `GEMINI_API_KEY` está configurada no `.env`, e conta com um simulador determinístico sensível às diferenças entre `v1` e `v2` para execução offline, testes automatizados (`npm test`) e avaliação reprodutível sem expor segredos no repositório.
   - *Limitação*: O modo simulado cobre com alta fidelidade os cenários de referência e perfis cadastrados, enquanto variações abertas de domínio dependem da chave `GEMINI_API_KEY` ativa para inferência generativa completa.

