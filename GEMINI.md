# Workspace Rules (`GEMINI.md`)

@[AGENTS.md](./AGENTS.md)

## Diretrizes Operacionais para Agentes
- Ao criar ou evoluir prompts, consulte a skill `.agents/skills/prompt-harness-sdd/SKILL.md`.
- Ao testar alterações, execute `npm test` e `node src/cli.js --help` para garantir que todos os contratos SDD e o Evaluation Harness continuam íntegros.
- Se precisar expor as ferramentas deste repositório via protocolo MCP (Model Context Protocol), utilize o servidor `src/mcp/server.js` configurado em `mcp_config.json`.

