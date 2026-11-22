# Rules & Engineering Standards (`AGENTS.md`)

Este repositório segue **Specification-Driven Development (SDD)** e uma arquitetura de **Prompt Evaluation Harness** para o Desafio Técnico de IA e Engenharia de Prompt.

## 1. Princípios de SDD (Spec-Driven Development)
- **Single Source of Truth**: Toda alteração de código, contrato JSON ou template de prompt deve respeitar as especificações documentadas em `specs/` (`01-domain-and-profiles.spec.md`, `02-prompt-engineering.spec.md`, `03-harness-and-cache.spec.md`).
- **Contract-First**: Nenhuma função geradora ou prompt pode retornar texto livre sem validação contra o contrato JSON correspondente de seu `content_type` (`diagnosis`, `resolution_steps`, `clarifying_questions`, `flow_summary`).
- **Zero Dependências Desnecessárias**: Utilize prioritariamente módulos nativos do Node.js 24 (`node:fs`, `node:crypto`, `node:http`, `node:readline`, `node:test`, `fetch` nativo) para manter o projeto enxuto, rápido e auditável.

## 2. Regras de Engenharia de Prompt
- Todo prompt montado em `src/prompts/engine.js` deve conter explicitamente os 5 pilares exigidos:
  1. **Persona Prompting**: Papel, responsabilidades e limites éticos/técnicos do assistente.
  2. **Context Setting**: Injeção estruturada do perfil do cliente (`technical_level`, `communication_style`, `channel`) e do ticket.
  3. **Diagnostic Decomposition**: Separação explícita de `hypotheses`, `available_evidence`, `missing_data` e `probable_conclusion` (sem expor chain-of-thought bruto irrelevante).
  4. **Output Formatting**: Schema JSON determinístico e restrições de formatação por canal e nível técnico.
  5. **Prompt Versioning**: Identificação explícita da versão (`v1`, `v2`) com rastreabilidade no histórico JSON.

## 3. Regras de Segurança, Cache e Harness
- **Segurança de Credenciais**: Jamais commitar `.env` ou chaves reais de API (`GEMINI_API_KEY`). Apenas `.env.example` é versionado.
- **Cache Determinístico**: Toda chamada ao provedor LLM deve passar pelo cache SHA-256 baseado na tupla canônica `(customer_id, ticket, content_type, prompt_version, provider, model, temperature)`.
- **Comparação Justa (Fair Benchmark Harness)**: Ao comparar duas versões de prompt (`v1` vs `v2`), o Harness deve travar (`lock`) cliente, ticket, provedor, modelo e temperatura, variando **exclusivamente** a versão do prompt, e registrar a avaliação sob a rubrica fixa de 3 critérios (`clarity`, `customer_fit`, `actionability`, escala 1 a 5 + justificativa).

