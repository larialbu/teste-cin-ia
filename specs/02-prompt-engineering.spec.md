# Spec 02: Prompt Engineering Engine & Versioning (SDD)

## 1. Objetivo
Especificar o motor de montagem dinâmica de prompts (`src/prompts/engine.js`) e as diferenças controladas entre as versões `v1` e `v2` para avaliação no Harness.

## 2. Os 5 Elementos Obrigatórios do Motor
Cada prompt compilado deve ser auditável e composto por:
1. **Persona Prompting (`personaBlock`)**: Define o papel do especialista de suporte, responsabilidades e limites (não inventar fatos fora do ticket, não pedir credenciais/senhas).
2. **Context Setting (`contextBlock`)**: Injeta os parâmetros do cliente (`id`, `name`, `technical_level`, `communication_style`, `channel`) e o texto integral do `ticket`.
3. **Diagnostic Decomposition (`decompositionBlock`)**: Instrui a separação rigorosa entre hipóteses, evidências observadas, dados faltantes e conclusão provável.
4. **Output Formatting (`outputFormatBlock`)**: Define o JSON Schema exato para o `content_type` solicitado e restrições de formatação por canal.
5. **Prompt Versioning (`prompt_version`)**:
   - `v1` (**Baseline Structured Prompt**): Prompt funcional, direto e estruturado com o schema básico e menção simples ao perfil do cliente, porém sem matriz explícita de calibração léxica/canal nem exemplos de restrição negativa por perfil.
   - `v2` (**Calibrated Persona & Channel-Matrix Prompt**): Prompt otimizado que inclui matriz explícita de calibração por `technical_level` (vocabulário permitido vs. proibido), regras de formatação específicas por `channel` (`chat` vs `e-mail` vs `telefone`), modulação de `communication_style` (`direto`, `detalhado`, `didático`), ancoragem de hipóteses (`H1`, `H2`) e critérios de auto-verificação antes de emitir o JSON final.

## 3. Quatro Estratégias Separadas
O módulo `src/services/generators.js` deve expor 4 funções independentes:
- `generateDiagnosis(params)`
- `generateResolutionSteps(params)`
- `generateClarifyingQuestions(params)`
- `generateFlowSummary(params)`
