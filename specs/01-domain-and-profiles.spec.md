# Spec 01: Domain Model, Customer Profiles & Content Schemas (SDD)

## 1. Objetivo da Especificação
Definir os contratos de dados para Perfis de Clientes, Tickets de Suporte e os 4 tipos de conteúdo gerados pelo sistema.

## 2. Schema de Perfil de Cliente (`CustomerProfile`)
Armazenado em `data/customers.json` (3 a 5 perfis).
- `id` (`string`): Identificador único (ex: `"cust_01"`).
- `name` (`string`): Nome do cliente e contexto curto.
- `technical_level` (`"leigo" | "intermediário" | "avançado"`): Nível técnico do usuário.
- `communication_style` (`"direto" | "detalhado" | "didático"`): Estilo preferido de comunicação.
- `channel` (`"chat" | "e-mail" | "telefone"`): Canal de atendimento ativo.

## 3. Contratos dos 4 Tipos de Conteúdo (`content_type`)

### 3.1. `diagnosis` (Diagnóstico do Problema)
Saída estruturada e verificável (sem necessidade de armazenar raciocínio interno longo do modelo):
```json
{
  "summary": "Resumo executivo do diagnóstico adaptado ao perfil",
  "hypotheses": [
    {
      "id": "H1",
      "description": "Hipótese principal",
      "likelihood": "alta | média | baixa"
    }
  ],
  "available_evidence": ["Sinal ou evidência extraída do relato do ticket"],
  "missing_data": ["Informação técnica ou operacional ausente no ticket"],
  "probable_conclusion": "Conclusão provável acionável com base nos sinais atuais"
}
```

### 3.2. `resolution_steps` (Passo a Passo de Resolução)
Adaptado ao `technical_level`, `communication_style` e `channel`:
```json
{
  "greeting_and_tone": "Abertura alinhada ao canal e estilo do cliente",
  "estimated_time": "Tempo estimado para execução",
  "steps": [
    {
      "step_number": 1,
      "action": "Ação principal clara",
      "explanation": "Explicação adaptada ao nível técnico e estilo",
      "expected_result": "Como saber se o passo funcionou"
    }
  ],
  "fallback_plan": "O que fazer caso os passos acima não resolvam"
}
```

### 3.3. `clarifying_questions` (Perguntas de Esclarecimento)
Priorizadas para coletar **somente** o necessário para avançar no atendimento:
```json
{
  "context_note": "Breve justificativa do porquê essas perguntas são necessárias",
  "questions": [
    {
      "priority": 1,
      "question": "Pergunta formulada na linguagem adequada ao perfil",
      "why_it_matters": "Qual hipótese esta pergunta confirma ou descarta",
      "target_hypothesis": "H1"
    }
  ]
}
```

### 3.4. `flow_summary` (Resumo Visual do Fluxo)
Fluxograma ASCII e árvore estruturada de decisão:
```json
{
  "title": "Título do fluxo de triagem e resolução",
  "ascii_flowchart": "Diagrama ASCII em múltiplas linhas usando caixas e setas (+---+, |, v, -->)",
  "decision_nodes": [
    {
      "condition": "Condição ou ponto de verificação",
      "if_yes": "Caminho caso verdadeiro",
      "if_no": "Caminho caso falso"
    }
  ]
}
```
