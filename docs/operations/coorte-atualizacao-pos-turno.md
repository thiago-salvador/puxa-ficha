# Coorte de atualização depois de cada turno de 2026

O primeiro turno é em **04/10/2026** e o segundo em **25/10/2026**. Este procedimento só começa depois de cada votação. O agendamento de `resultados-tse-fase-eleitoral.yml` roda em 05 e 06/10 e em 26 e 27/10, às 12:00 UTC, e **apenas publica um plano**. Não altera fichas nem banco. Reexecutar o plano manualmente se a totalização ainda não estiver fechada.

## Antes do primeiro turno

1. Revisar o PR da migration `20260927050000_candidaturas_fase_2026_schema.sql`, o topo de `supabase_migrations.schema_migrations` com uma consulta **somente leitura**, o predecessor `20260927040200_pedro_cunha_lima_senado_homonimo` e o SHA-256 em `supabase/fase-eleitoral/schema.json`. Se outra migration tiver entrado, ajustar a cadeia antes do merge. Conferir o replay completo em PostgreSQL 17, os três números medidos do manifesto de replay, `npm test` e todos os gates locais do PR.
2. Depois do merge e da confirmação do SHA de `main`, acionar `apply-fase-eleitoral-production.yml` com `conjunto=schema`, `expected_sha=<SHA de main>` e `mode=dry-run`. O workflow só aceita `main` no SHA exato e verifica ledger, digest e readback dentro da transação que termina em `ROLLBACK`.
3. Após revisar o ensaio, acionar o mesmo workflow com `mode=apply`. Ele repete o ensaio antes de gravar. Conferir o ledger e o readback independentemente. A tabela começa vazia: **nenhuma rotina muda de coorte neste passo**. Não usar `supabase db push`.

## Coleta de 04/10/2026 e aplicação a partir de 05/10/2026

O código de apresentação deve estar promovido até 03/10 e permanecer desligado enquanto a tabela de fase estiver vazia. A virada é feita pelo resultado completo gravado, nunca pelo relógio. Preparar o plano após a totalização e aplicar o resultado do primeiro turno somente a partir de 05/10, com autorização nominal de produção. Não fazer deploy na noite da votação.

Só começar o plano quando os arquivos oficiais indicarem totalização final (`tf=s`) e todas as seções totalizadas (`s=st`). Plano parcial ou com pendências executivas não gera migration: ninguém é marcado. Se o resultado ainda estiver incompleto, manter a UI sem fase e repetir a leitura depois. O fallback neutro do Senado não afirma eleição ou derrota.

1. Abrir o artefato do workflow `resultados-tse-fase-eleitoral.yml` para `turno=1`, ou rodar `npm run resultados:tse -- plano --turno=1 --out=reports/resultados-tse`. O plano lê `ele-c.json` e os JSON de `resultados.tse.jus.br/oficial`, cruza candidaturas por `sq_candidato_2026` e guarda URL e SHA-256 de cada arquivo. Conferir eleição/cargo/UF/turno, `f=o`, `tf=s`, seções totalizadas, status e pendências por candidatura. Arquivo ausente, inválido ou parcial de Presidente ou Governador mantém essas candidaturas na coorte, sem mudança de fase. O Senado sai da coorte após o primeiro turno mesmo se o arquivo de resultado falhar; nesse caso, a ficha mostra só a data de encerramento, sem alegar eleição ou derrota. Nova coleta é necessária para afirmar resultado individual.
2. Gerar em um branch `npm run resultados:tse -- gerar --plano=reports/resultados-tse/plano-turno-1.json --versao=AAAAMMDDHHMMSS` somente com plano completo e sem pendências executivas. Revisar nominativamente o diff, as contagens por fase, os casos sem resultado individual, a data de encerramento, os digests e o predecessor de produção. O gerador escreve migration, readback, rollback, readback do rollback, allowlist, recorte e manifesto `turno-1`. A migration não mexe em `publicavel` ou nos dados históricos. Senado inteiro sai da atualização; Presidente e Governador só mudam quando o resultado oficial estiver completo e confirmado.
3. Medir replay em PostgreSQL 17 e atualizar os três valores de replay exigidos pelo repositório. Rodar todos os gates locais e abrir PR. Após merge, conferir SHA e topo do ledger; acionar `apply-fase-eleitoral-production.yml` com `conjunto=turno-1`, `expected_sha=<SHA exato de main já mergeado>` e `mode=dry-run`, depois `mode=apply` somente a partir de 05/10 com autorização nominal para aplicar o resultado em produção. Conferir recibo `coleta_log` e readback independentemente.

4. Revalidar todas as camadas que apresentam a fase:

   ```sh
   gh workflow run revalidate-cache.yml --ref main -f tags=public-candidato-ficha,public-candidato-metadata,public-candidatos,public-candidatos-resumo,public-candidatos-comparaveis
   ```

   A home usa as tags de resumo e comparáveis; as listas usam candidatos e resumo. Conferir a conclusão do workflow antes do smoke. A Colinha consulta sem cache e sua URL contém escolhas sensíveis: não colocar essa URL em analytics, logs públicos ou recibos.

5. Abrir a página renderizada e hidratada de um senador eleito, um não eleito, um senador sem resultado individual, um finalista executivo e uma candidatura que saiu. A ficha monta no cliente: HTML do servidor isoladamente não prova a presença do selo. Conferir também home, `/governadores`, `/uf/[uf]`, confronto com os dois finalistas em ordem alfabética e Colinha nova e antiga, em 375 px e desktop. Senador sem resultado individual deve ter apenas a nota neutra. O selo usa “Fonte: TSE, resultado oficial do 1º turno”, sem data ou percentual. A nota de encerramento continua indicando exclusivamente a data de encerramento da atualização.

## Depois do segundo turno: 26/10/2026 em diante

Repetir o procedimento do primeiro turno com `turno=2` e `conjunto=turno-2`. O plano só considera candidaturas em `segundo_turno`; Senado não participa. O resultado oficial encerra a atualização dos dois finalistas, eleitos ou não. Usar o predecessor que estiver no topo real do ledger depois do primeiro turno; nunca presumir que é a versão do branch.

## Falha e reversão

Se identidade, contagem, digest, readback ou ledger divergir, parar antes do apply. Fonte executiva ausente ou incompleta permanece pendente e sem alteração; fonte do Senado ausente só autoriza o encerramento neutro da atualização, sem claim de resultado. Não usar `--aceitar-parcial`. Para uma escrita já aplicada, primeiro conferir que a migration do conjunto está no topo e revisar a postimagem. O workflow `rollback-fase-eleitoral-production.yml` exige o SHA exato de `main`, executa dry-run e readback do rollback antes de `mode=apply`. Reverter `turno-2` antes de `turno-1`, e `turno-1` antes de `schema`. Rollback também é escrita em produção e exige autorização específica.
