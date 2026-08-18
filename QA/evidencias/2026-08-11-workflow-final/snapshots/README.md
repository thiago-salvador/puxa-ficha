# Recibos read-only do critério 8

Estes artefatos registram dois instantes reais do estado remoto e local durante o workflow. A captura não executa migration, coleta, merge, deploy, cron ou workflow. O script usa `git` somente para leitura, `GET` no deployment e no PostgREST, leitura de metadados e logs do GitHub Actions e, quando a credencial existe, um `SELECT` com `default_transaction_read_only=on`.

## Cadeia dos recibos

- `antes.json` é cópia byte a byte de `/private/tmp/pf-ajustes-final-snapshot.json`, capturado em `2026-08-11T12:49:11.509Z`. SHA-256: `e0f7a4c54985223f36f2957aedb8268c8fec49c2dad1ed8518141f75c323f54a`.
- `depois.json` foi gerado com `npx tsx scripts/audit/snapshot-pf-ajustes-remoto.ts --output=/tmp/pf-ajustes-c8-depois.json` em `2026-08-11T13:11:24.163Z`. SHA-256: `6ea22be577cb6cdda5580c66f78950a7b20d939dd0ed76797ee126159e81239e`.
- `comparacao.json` contém somente igualdades e valores derivados desses dois JSONs.

## Resultado factual

Entre os dois recibos, não mudaram os refs local e remoto de `main` e `rc-lancamento`, o SHA da integração, o SHA publicado em produção nem nenhuma das contagens consultadas. O estado comum foi `main` remoto e produção em `7e3e4165b0536aee50a68647488e93dd6127446c`, `rc-lancamento` remoto em `d17163fb58ad1c8d780d82be71e428671821306d`, 194 fichas públicas, 30 processos, 0 linhas dos lotes judiciais 69 e 66, 0 execução TSE-8, Senado em 13 por 81, contrato de financiamento ausente com `PGRST205` e 0 linhas do rerun de patrimônio.

A conexão direta ao ledger não estava disponível porque `SUPABASE_DB_URL` não existe no ambiente local. Nenhuma conexão foi tentada. Como evidência substituta, `depois.json` registra o último `ledger-guard.yml` em `main`: run `31468778542`, concluído com sucesso no mesmo SHA de produção, com 371 versões lidas, topo `20260809060000`, 376 arquivos no repositório daquele run e declaração positiva do gate de consistência.

## Limite explícito

O recibo anterior não guardou o status nem um hash do checkout principal. O recibo posterior mostra esse checkout já dirty, com 38 entradas e HEAD `0b08a3b6e763be3cf438f45553062dd57f30244b`; o reflog registra a última mudança de `main` em `2026-08-09T18:53:38-03:00`. Isso prova que o ref não avançou durante o intervalo, mas não permite afirmar que o conteúdo não commitado do checkout principal permaneceu byte a byte idêntico. `rc-lancamento` não estava anexado a um worktree no recibo posterior; seu ref e o remoto permaneceram iguais.

## Incidente de materialização e restauro

Na primeira aplicação dos dois JSONs, o caminho relativo foi resolvido no checkout principal e criou temporariamente apenas `antes.json` e `depois.json` sob o novo diretório `QA/evidencias/2026-08-11-workflow-final/snapshots`. Os dois arquivos novos foram removidos imediatamente, seguidos dos diretórios vazios criados por essa operação. Nenhum arquivo preexistente foi sobrescrito. O SHA-256 do `git status --porcelain=v1 -z` do checkout principal era `d7db0e26839b7da99f83768820ecf76e50dc760f675292acc921f4c9df8a9631` antes e voltou ao mesmo valor depois do restauro. Portanto, não sobrou alteração durável, mas houve essa criação local transitória durante a produção da prova.
