# Plano: atualização e completude dos dados

Escopo: criar contratos versionados, auditoria de candidaturas e freshness, golden fixtures e workflow diário somente leitura. Aplicação de qualquer dado continua fora do escopo.

| Etapa | Entrada | Entrega | Verificação | Estado |
|---|---|---|---|---|
| 1. Contrato | código, banco somente leitura e workflows atuais | registro de fontes e SLAs | schema e cobertura sem duplicidade | concluída |
| 2. Candidaturas | `consulta_cand_2026`, snapshot oficial e fichas | universo normalizado e diff tipado | golden set real e fail-closed | concluída |
| 3. Freshness | registro e evidências de última atualização | classificação por fonte | relógio determinístico e política de alegações negativas | concluída |
| 4. Automação | scripts e testes aprovados | workflow diário e manual | contrato de permissões e zero escrita | concluída |
| 5. Integração | todos os artefatos | verificação completa e diff local | eval e ledger 100% PASS | concluída |

Restrições: sem commit, push, PR, deploy, segredo novo, dependência nova ou escrita em Supabase.
