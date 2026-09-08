# Histórico verificado da home

O H12 compara observações verificadas de patrimônio declarado e situação da candidatura. A primeira observação cria uma referência privada, sem publicar evento. Valores repetidos apenas renovam a observação; diferenças geram antes/depois com fonte e horário de detecção. Troca de eleição ou identidade de origem cria outra referência.

## Publicação

- A fonte precisa ser o pacote oficial do TSE e a identidade precisa estar fechada por SQ, eleição e UF.
- O valor deve coincidir com a ficha persistida. Divergências no observador são ignoradas até a atualização de dados passar pelo fluxo existente.
- O observador não altera fatos de candidatos, patrimônio, financiamento ou recibos de coleta. Só a RPC do histórico escreve referências e eventos.
- Candidatos removidos ou privados não aparecem. Patrimônio retirado de publicação oculta os eventos do candidato e ano.
- Partido ainda não tem produtor: a declaração histórica de partido em uma eleição não comprova troca de filiação atual.
- Não há preenchimento retroativo a partir de datas de coleta. “Detectado em” não significa data do fato.

## Execução

Usar Node 24. `node --import tsx scripts/observe-home-updates.ts --dry-run` consulta e valida fontes, sem escrever histórico. `--apply` ativa exclusivamente o registro de observações confirmadas.

O workflow `observe-home-updates.yml` consulta semanalmente, às quartas, 08:00 UTC, e aceita disparo manual em main. Compartilha o bloqueio da ingestão, não reutiliza pacotes antigos do TSE e falha se não confirmar nenhum valor. Os coletores normais também registram observações após confirmar uma gravação bem-sucedida. O cache de leitura da home revalida em cinco minutos.

## Ordem de ativação

1. Integrar o código validado em main.
2. Executar `apply-verified-candidate-updates-production.yml` com o SHA exato de main; aplica somente a migration 20260908160000, registra o hash no ledger e executa o readback.
3. Executar `observe-home-updates.yml` para criar a referência inicial.
4. Conferir contagens privadas pelo readback, a leitura pública e o estado vazio inicial na home. Eventos reais só aparecerão após uma diferença futura confirmada.

## Provas locais

- `bash scripts/audit/provar-verified-candidate-updates-pg17.sh`: SQL real, ACL, primeira observação, repetição, mudança, dados inválidos, despublicação, concorrência e rollback.
- `node --import tsx --test tests/verified-candidate-changes.test.ts tests/verified-candidate-updates-ui.test.tsx`: contrato dos coletores, modos sem escrita de fatos, antes/depois, fonte e distinção entre vazio e indisponível.
- Gates canônicos de classificação/replay, suíte completa, build, lint e TypeScript.

O rollback remove apenas a estrutura do histórico, sem alterar fatos das fichas. Ele descarta referências e eventos: preservar uma cópia antes de executar se já houver dados a manter.
