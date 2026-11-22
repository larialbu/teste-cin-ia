# Spec 03: Evaluation Harness, Cache & Persistence (SDD)

## 1. Estratégia de Cache Determinístico
- **Chave Canônica (SHA-256)**:
  Calculada a partir do JSON ordenado de:
  `{ customer_id, ticket: ticket.trim(), content_type, prompt_version, provider, model, temperature }`.
- **Comportamento**:
  - Antes de acionar a API da LLM, consulta `data/cache.json` (e o histórico compatível em `data/history.json`).
  - Se houver *Cache Hit*, retorna imediatamente o resultado armazenado com metadado `cache_hit: true`, evitando chamadas repetidas e custo de tokens.

## 2. Persistência e Histórico (`data/history.json` e `samples/`)
Cada registro segue a estrutura:
```json
{
  "id": "exec_...",
  "timestamp": "2026-11-21T21:50:00.000Z",
  "customer_id": "cust_01",
  "customer_profile": { ... },
  "ticket": "...",
  "prompt_version": "v1",
  "content_type": "diagnosis",
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "cache_key": "sha256...",
  "cache_hit": false,
  "output": { ... },
  "evaluation": {
    "clarity": { "score": 4, "justification": "..." },
    "customer_fit": { "score": 5, "justification": "..." },
    "actionability": { "score": 4, "justification": "..." }
  }
}
```

## 3. Prompt Evaluation Harness (`src/harness/runner.js`)
O Harness executa experimentos controlados (A/B entre `v1` e `v2`):
1. Trava `customer_id`, `ticket`, `provider`, `model` e `temperature`.
2. Executa `v1` e `v2` para o mesmo cenário.
3. Valida ambos os outputs contra os contratos SDD (`src/schemas/validator.js`).
4. Aplica/registra a avaliação segundo a rubrica obrigatória de 3 critérios (`clarity`, `customer_fit`, `actionability`, notas de 1 a 5 + justificativa).
5. Salva a comparação consolidada em `data/history.json` e exporta artefatos prontos em `samples/`.
