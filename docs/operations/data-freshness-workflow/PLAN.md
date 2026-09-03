# Plano: atualização e completude dos dados

Escopo: criar contratos versionados, auditoria de candidaturas e freshness, golden fixtures, workflow diário somente leitura e alerta acionável. Aplicação de qualquer dado continua fora do escopo.

| Etapa | Entrada | Entrega | Verificação | Estado |
|---|---|---|---|---|
| 1. Contrato | código, banco somente leitura e workflows atuais | registro de fontes e SLAs | schema e cobertura sem duplicidade | concluída |
| 2. Candidaturas | `consulta_cand_2026`, snapshot oficial e fichas | universo normalizado e diff tipado | golden set real e fail-closed | concluída |
| 3. Freshness | registro e evidências de última atualização | classificação por fonte | relógio determinístico e política de alegações negativas | concluída |
| 4. Automação | scripts e testes aprovados | workflow diário e manual | contrato de permissões e zero escrita | concluída |
| 5. Integração | todos os artefatos | verificação completa e diff local | eval e ledger 100% PASS | concluída |
| 6. Alerta acionável | `summary.md`, resultado do job e URL da execução | issue vermelha atribuída, deduplicada e com recomendações | testes de criação, atualização, recuperação e isolamento de permissões | em validação |

Restrições: sem correção automática, deploy, segredo novo, dependência nova ou escrita em Supabase. A única escrita remota do runtime é a issue de incidente, isolada em um job com `issues: write` e sem acesso ao banco.

## Revisão registrada nos monitores dependentes do TSE

`scripts/data/tse-dependent-monitors.json` aceita, por ficha de `program_files`, um campo opcional `revisoes`. Cada entrada nomeia um `id_arquivo` e grava a medição que fechou a revisão: `revisado_em`, `pacote_url`, `pacote_sha256`, `pacote_last_modified`, `resultado` (`ausente_do_pacote`) e `referencia`. Serve ao único desfecho em que a revisão termina sem ingestão: a DivulgaCandContas anuncia um arquivo `codTipo 5` que o pacote oficial da UF não carrega, e o importador nunca ingere PDF por URL avulsa (`docs/operations/programas-governo-governadores-2026-ingestao.md`).

O alerta `program_file_available` passa a valer só para arquivo `codTipo 5` cujo `idArquivo` não conste de uma revisão registrada. Arquivo anunciado sem `idArquivo` nunca é silenciado, e a revisão vale apenas para o id que nomeia.

A revisão expira por `id_arquivo` novo, e só por isso: o monitor fala com a DivulgaCandContas e nunca com o CDN, então pacote republicado não expira nada sozinho. Por isso a revisão grava o pacote medido, o `summary.md` publica a linha de revisão junto do alerta, e revisão vencida por pacote novo sai daqui por PR. Em 03/09/2026 o pacote de CE foi republicado às 06:49:12Z e passou a carregar o PDF de Vera Lúcia, exatamente o caso que essa expiração manual cobre.
