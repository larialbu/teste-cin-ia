---
name: prompt-harness-sdd
description: >-
  Runbook for Specification-Driven Development (SDD) and Prompt Evaluation Harness operations.
  Use this skill whenever creating, evolving, benchmarking, or auditing prompt versions (v1, v2, vN),
  customer profiles, content generation strategies, or rubric evaluations in this repository.
---

# Prompt Evaluation Harness & SDD Skill

Esta skill guia o ciclo de vida **Specification-Driven Development (SDD)** e execução do **Prompt Evaluation Harness** do projeto.

## Fluxo SDD para Evolução de Prompts

1. **Atualizar ou Consultar a Especificação (`specs/`)**:
   - Verifique os contratos em [01-domain-and-profiles.spec.md](../../../specs/01-domain-and-profiles.spec.md), [02-prompt-engineering.spec.md](../../../specs/02-prompt-engineering.spec.md) e [03-harness-and-cache.spec.md](../../../specs/03-harness-and-cache.spec.md).
2. **Implementar / Ajustar Estratégia no Motor de Prompt (`src/prompts/`)**:
   - Garanta que os 5 componentes obrigatórios (`persona`, `context`, `decomposition`, `output_format`, `version`) estão presentes.
   - Mantenha as 4 funções geradoras separadas em `src/services/generators.js` (`generateDiagnosis`, `generateResolutionSteps`, `generateClarifyingQuestions`, `generateFlowSummary`).
3. **Executar o Harness de Comparação (`v1` vs `v2`)**:
   - Execute o script do harness ou comando CLI:
     ```bash
     npm run harness
     ```
   - O Harness executa o par `Cliente + Ticket` controlado nas versões `v1` e `v2`, valida o schema JSON, testa o cache SHA-256 e persiste a avaliação com a rubrica de 3 critérios (`clarity`, `customer_fit`, `actionability`).
4. **Validar com a Suíte de Testes SDD**:
   - Execute:
     ```bash
     npm test
     ```
   - Todos os testes de contrato, cache determinístico, geradores e rubrica devem passar.

