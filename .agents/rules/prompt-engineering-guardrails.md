# Guardrails de Engenharia de Prompt e Rubrica

## Invariantes de Adaptação ao Perfil
1. **Nível Técnico (`technical_level`)**:
   - `leigo`: Proibido usar jargões sem analogia simples (ex: explicar DNS/cache/token como "endereço", "memória temporária", "chave de acesso"). Passos visuais baseados na interface.
   - `intermediário`: Pode mencionar configurações, extensões, console do navegador ou status HTTP básicos, mantendo explicação prática.
   - `avançado`: Vocabulário técnico direto (headers, payload, logs, trace, CLI, cURL, status codes, políticas de CORS/IAM), sem explicações introdutórias óbvias.
2. **Estilo de Comunicação (`communication_style`)**:
   - `direto`: Frases curtas, listas objetivas, zero rodeios, foco imediato na ação.
   - `detalhado`: Contexto completo, explicação de causa-efeito, pré-requisitos e validações pós-ação.
   - `didático`: Tom acolhedor e orientador, explicando *por que* cada passo é feito e como confirmar se deu certo.
3. **Canal de Atendimento (`channel`)**:
   - `chat`: Blocos curtos, escaneáveis, fáceis de ler em janela estreita.
   - `e-mail`: Estrutura completa e autossuficiente para reduzir idas e vindas assíncronas.
   - `telefone`: Roteiro falado/guiado para o atendente ou cliente acompanhar em tempo real, com checkpoints claros.

## Rubrica Obrigatória (1 a 5)
- `clarity`: Clareza, organização e ausência de ambiguidade.
- `customer_fit`: Adequação de vocabulário, profundidade e tom ao perfil selecionado.
- `actionability`: Capacidade do cliente ou atendente saber exatamente o próximo passo concreto.
