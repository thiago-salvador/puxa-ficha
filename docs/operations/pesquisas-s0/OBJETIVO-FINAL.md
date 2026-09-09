# Automação de pesquisas: objetivo e critérios de conclusão

Escopo reafirmado por Thiago na conversa: pesquisas de intenção de voto para Presidente e Governadores, com todos os candidatos e dados publicados, mantidas atualizadas por automação.

## Sucesso

O processo descobre novas pesquisas e retificações, consulta registro e documentação oficial, extrai os cenários completos, valida a identidade dos candidatos e publica somente dados verificados. A cobertura é monitorada para Brasil e todas as 27 unidades federativas. Ausência de pesquisa ou candidato em determinado cenário é indicada como ausência; nunca recebe um percentual inventado.

## Sequência de execução aprovada

1. Corrigir coleta e consolidação existentes. Provar localmente e no GitHub. Responsável: Codex, como executor e verificador.
2. Integrar a consulta pública do PesqEle, mantendo sessão transitória, allowlist, limites e evidência verificável. Usar resultados públicos do instituto/veículo para percentuais; registro TSE para seus metadados. Um registro pode cobrir mais de um cargo e não autoriza misturar os cenários.
3. Substituir a extração de pares por extração de cada cenário completo, incluindo todos os candidatos, brancos/nulos e indecisos publicados. Separar turno, cargo, geografia, espontânea/estimulada e pergunta. Rejeitar percentuais ambíguos ou cenário incompleto.
4. Descobrir publicações novas independentemente das URLs já no catálogo. Monitorar Brasil e 27 UFs, múltiplos institutos aprovados, períodos de campo e publicação. Sinalizar lacunas de cobertura e fontes indisponíveis.
5. Validar diffs e executar a atualização recorrente com logs, alerta de falha e prova da informação servida. Ativação em produção/merge continua uma ação separada, a ser autorizada quando a mudança estiver pronta e verificável.

Fluxo: descoberta → registro/documentação → cenários completos → identidade e comparabilidade → proposta verificada → publicação autorizada → leitura pública e monitoramento.

## Testes que definem conclusão

- Ao menos uma coleta real de Presidente e uma de Governador reconciliadas com o TSE, localmente e no runner.
- Casos com mais de dois candidatos preservam todos os nomes e percentuais publicados, sem misturar turnos ou cargos.
- Nova URL e retificação são descobertas sem edição manual do catálogo.
- Inventário de cobertura contém BR e as 27 UFs, com ausência e falha de fonte distinguíveis.
- Pesquisa inalterada não cria atualização; mudança válida é idempotente; conflito ou incompletude impede publicação.
- Cadência, última verificação, data da pesquisa e fonte ficam auditáveis. Falha real impede aparência de atualização bem-sucedida.
- A prova final inclui execução recorrente e leitura do site publicado. Código, testes locais e branch publicada não bastam.

## Alternativas e limites

O download do TSE falhou localmente e no GitHub. A consulta pública do PesqEle funcionou no navegador e em um protótipo HTTP de busca e detalhes. O novo coletor usará essa rota pública, sem acessar anexos que o TSE informa estarem indisponíveis até o fim das eleições. Se a consulta mudar ou faltar metadado, permanece bloqueado; não preencher do catálogo antigo para fabricar uma captura atual.

O cron existente permanece diário durante a recuperação. Aumento de frequência vem depois de descoberta e coleta completas. Não há necessidade de um novo serviço ou runtime para os passos em andamento.
