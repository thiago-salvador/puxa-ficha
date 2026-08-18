-- Rollback da 20260809070000_verificacao_campos_b2_cleber_gilberto.sql.
--
-- Desfaz TUDO o que a forward fez: as tres chaves TSE nas duas fichas e a linha
-- do ledger. Rollback que deixa a versao no ledger faz o repositorio e o banco
-- discordarem sobre o que aconteceu, que e a issue #131.
--
-- ## A guarda esta no SQL, nao num comentario esperando alguem descomentar
--
-- O rollback so remove chave cujo valor ainda e EXATAMENTE `2026-08-06`, o que a
-- forward escreveu. Se uma reverificacao posterior ja carimbou outra data, essa
-- data e verificacao real e nova, e apaga-la seria destruir dado bom em nome de
-- desfazer dado velho. Nesse caso o rollback ABORTA e nao destroi nada.
--
-- `-` em jsonb remove a chave inteira, que e o oposto de gravar `null`: chave
-- ausente devolve a ficha ao estado `ausente` de `resolverFrescorTsePerfil`,
-- enquanto `null` continuaria sendo uma chave presente e sobrescreveria o
-- proximo merge.
--
-- SEM `BEGIN;`/`COMMIT;` PROPRIOS, mesma regra da forward: quem executa envolve
-- este arquivo mais a remocao da linha do ledger numa transacao externa unica.

DO $rb$
DECLARE
  v_divergentes integer;
  v_restantes integer;
BEGIN
  SELECT count(*) INTO v_divergentes
    FROM public.candidatos
   WHERE slug IN ('cleber-rabelo', 'gilberto-vasconcelos')
     AND (
       COALESCE(verificacao_campos ->> 'candidate_registration', '2026-08-06') <> '2026-08-06'
       OR COALESCE(verificacao_campos ->> 'candidate_complement', '2026-08-06') <> '2026-08-06'
       OR COALESCE(verificacao_campos ->> 'social_networks', '2026-08-06') <> '2026-08-06'
     );

  IF v_divergentes > 0 THEN
    RAISE EXCEPTION
      'rollback abortado: % ficha(s) com data de verificacao diferente de 2026-08-06; ha verificacao mais nova a preservar',
      v_divergentes;
  END IF;

  UPDATE public.candidatos
     SET verificacao_campos =
           verificacao_campos - 'candidate_registration' - 'candidate_complement' - 'social_networks'
   WHERE slug IN ('cleber-rabelo', 'gilberto-vasconcelos');

  SELECT count(*) INTO v_restantes
    FROM public.candidatos
   WHERE slug IN ('cleber-rabelo', 'gilberto-vasconcelos')
     AND (verificacao_campos ?| ARRAY['candidate_registration', 'candidate_complement', 'social_networks']);

  IF v_restantes <> 0 THEN
    RAISE EXCEPTION 'rollback incompleto: % ficha(s) ainda com chave TSE', v_restantes;
  END IF;
END
$rb$;

DELETE FROM supabase_migrations.schema_migrations
 WHERE version = '20260809070000';
