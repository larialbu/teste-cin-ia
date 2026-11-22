# Checklist de Auditoria SDD e Entrega

Antes de considerar qualquer mudança concluída, verifique:
1. `data/customers.json` possui entre 3 e 5 perfis válidos (`leigo`, `intermediário`, `avançado` | `direto`, `detalhado`, `didático` | `chat`, `e-mail`, `telefone`).
2. As 4 estratégias (`diagnosis`, `resolution_steps`, `clarifying_questions`, `flow_summary`) produzem JSON estruturado válido.
3. O cache evita chamadas duplicadas para a mesma chave canônica SHA-256.
4. `samples/` e `data/history.json` contêm execuções reais e a comparação completa `v1` vs `v2` com as 3 notas e justificativas da rubrica.
5. `PROMPT_ENGINEERING_NOTES.md` documenta a arquitetura dos prompts, diferenças entre `v1` e `v2`, trade-offs e limitações.
