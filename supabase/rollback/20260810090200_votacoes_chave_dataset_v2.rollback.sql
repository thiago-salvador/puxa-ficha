-- Rollback de 20260810090200: remove as 12 matérias do dataset v2.
--
-- Endereça pela chave (fonte, votacao_id_api), que é o que a migration criou.
-- Os votos vêm depois, por ingest, então apagar as votações basta; o delete de
-- votos_candidato fica por segurança caso o ingest já tenha rodado.
--
-- SEM `BEGIN;`/`COMMIT;` próprios: quem executa envolve este arquivo inteiro,
-- inclusive a remoção do ledger abaixo, numa transação externa única.

DO $$
DECLARE v_assinatura_payload text; v_votos_posteriores integer;
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
       WHERE version = '20260810090200') <> 1 THEN
    RAISE EXCEPTION 'rollback 20260810090200: ledger ausente ou duplicado';
  END IF;
  SELECT md5(string_agg(
           concat_ws(chr(30), coalesce(titulo,'<null>'), coalesce(descricao,'<null>'),
             coalesce(data_votacao::text,'<null>'), coalesce(casa,'<null>'),
             coalesce(fonte,'<null>'), coalesce(votacao_id_api,'<null>'),
             coalesce(proposicao_id,'<null>'), coalesce(tema,'<null>'),
             coalesce(impacto_popular,'<null>')),
           chr(31) ORDER BY votacao_id_api))
    INTO v_assinatura_payload
    FROM public.votacoes_chave
   WHERE fonte = 'camara';
  IF v_assinatura_payload IS DISTINCT FROM 'f8cc5853102457caaa3e3d4b7326ea55' THEN
    RAISE EXCEPTION 'rollback 20260810090200: payload atual diverge da forward (%)', v_assinatura_payload;
  END IF;
  SELECT count(*) INTO v_votos_posteriores
    FROM public.votos_candidato v JOIN public.votacoes_chave k ON k.id=v.votacao_id
   WHERE k.fonte='camara' AND k.votacao_id_api IN (
     '14493-503','2123843-93','340812-195','2270800-135',
     '2515648-44','2351506-122','2383019-54','2473389-58','2494565-52',
     '2430143-140','2409076-34','2324721-94'
   );
  IF v_votos_posteriores <> 0 THEN
    RAISE EXCEPTION 'rollback 20260810090200: % voto(s) posterior(es) dependem do lote', v_votos_posteriores;
  END IF;
END
$$;

delete from public.votos_candidato
 where votacao_id in (
   select id from public.votacoes_chave
    where fonte = 'camara'
      and votacao_id_api in (
        '14493-503','2123843-93','340812-195','2270800-135',
        '2515648-44','2351506-122','2383019-54','2473389-58','2494565-52',
        '2430143-140','2409076-34','2324721-94'
      )
 );

delete from public.votacoes_chave
 where fonte = 'camara'
   and votacao_id_api in (
     '14493-503','2123843-93','340812-195','2270800-135',
     '2515648-44','2351506-122','2383019-54','2473389-58','2494565-52',
     '2430143-140','2409076-34','2324721-94'
   );

delete from supabase_migrations.schema_migrations
 where version = '20260810090200';
