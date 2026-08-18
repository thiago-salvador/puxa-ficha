# Fase 4: transporte libpq do readback público

Data: 12/08/2026. Base: `main` publicado em `9c5ae509`.

## Resultado do ato autorizado

- PR #176 mergeada e publicada no mesmo SHA;
- readback `20260812123000` verde em produção;
- dez tags públicas revalidadas com HTTP 200 no run `31602792598`;
- Fase 4 interrompida antes do ledger, sem escrita, migration, coleta ou cron.

## Causa reproduzida

O runner atribuía a URI completa a `PGDATABASE`. O libpq interpreta essa
variável como nome do banco, não como connection string, e tenta o socket local
quando `PGHOST` não está definido. Depois de decompor a URI, `verify-full`
também mostrou corretamente que o host precisa da CA oficial do Supabase.

## Correção fail-closed

- decompor a URI já validada em `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` e
  `PGDATABASE`, mantendo o segredo fora do argv;
- versionar a CA oficial Supabase Root 2021 e travar `verify-full`;
- cobrir o transporte e o sigilo por teste executável;
- executar a prova final em workflow manual, no SHA de `main`, usando
  `SUPABASE_DB_URL` e os secrets Supabase já disponíveis no GitHub Actions;
- publicar os artefatos mesmo em falha, sem schedule, migration, coleta ou cron.

O certificado versionado tem fingerprint SHA-256
`80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`.

[codex-stamp: log feito pelo Codex; Claude deve ignorar se nao for util ou incorporar se fizer sentido]
