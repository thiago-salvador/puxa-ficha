# Validação do lote de pesquisas, 10/09/2026

- `npm run verify:pesquisas`, Node 24.19.0: exit 0. Auditoria, 65 testes de dados/componentes, build, seis testes de navegador, lint, ortografia, TypeScript da aplicação/scripts e diff-check passaram.
- `tests/a11y-production-workflow.test.ts`: 25/25, contrato dos smokes atualizado para as fontes atuais.
- Revisão independente: 167 vínculos estaduais novos chegam às fichas; os 13 presidenciais também são conferidos pelo teste de integração. Identidade ativa, cargo, UF e integridade das capturas verificados.
- Consulta manual no navegador local: Alan Rick, Quaest 33%, divulgação 27/08/2026, campo 23 a 26/08 e link da Gazeta do Povo presentes.
- A prova móvel revelou transbordamento dos textos acessíveis do gráfico patrimonial; posicionar seu contêiner reduziu a largura do documento de 530 a 390 pixels. O gate completo passou após essa correção mínima.
- Os novos dados incluem 28 rodadas e 391 resultados brutos. PR: Curi, Greca e Ratinho; MT: Laudicério; TO: Subtenente Luiz Carlos continuam sem vínculo novo confirmado. A tabela espontânea inconsistente de MT permanece indeterminada.
- Agendamento Codex ativo: segunda e quinta às 9h, São Paulo. Requer ambiente local disponível; cursor e pendências ficam no estado versionado.
- Produção não verificada para este lote. O smoke de produção exige SHA e ambiente públicos, portanto não é substituído por uma execução local. Merge/deploy e conferência da versão servida permanecem etapas distintas.

[confidence: alta, source: execução local /private/tmp/pf-pesquisas-verify-final-20260910.log, testes e manifestos deste diretório, automação Codex verificada] [codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
