-- Encerra dois itens da fila editorial sem promover afirmação frágil.
--
-- Ciro Gomes: a única URL cadastrada não pôde ser revalidada nesta rodada.
-- Soldado Sampaio: o fato é confirmado pelo perfil oficial da ALE-RR, mas é
-- redundante com a trajetória e estava visível como texto de IA sem revisão
-- humana. Em ambos os casos o estado seguro é manter o item fora da ficha.

BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.pontos_atencao IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
BEGIN
  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' THEN
    IF (SELECT md5(to_jsonb(pa)::text) FROM public.pontos_atencao pa
        WHERE id='88373c8d-43c9-400d-a896-5f11e3fd3ed7')
       IS DISTINCT FROM '2095d501f4161a05b87a9c131db0805b' THEN
      RAISE EXCEPTION 'fila editorial: preimage de Ciro Gomes divergiu';
    END IF;
    IF (SELECT md5(to_jsonb(pa)::text) FROM public.pontos_atencao pa
        WHERE id='a48921e3-0988-4125-bb39-4ea2729a57a2')
       IS DISTINCT FROM '22b9b6a463578bc5be594b7a6c353631' THEN
      RAISE EXCEPTION 'fila editorial: preimage de Soldado Sampaio divergiu';
    END IF;
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=20260906154000 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT '20260906154000','pontos_atencao',pa.id,pa.candidato_id,to_jsonb(pa),
         to_jsonb(pa) || jsonb_build_object(
           'visivel',false,
           'despublicacao_motivo',case pa.id
             when '88373c8d-43c9-400d-a896-5f11e3fd3ed7'::uuid
               then 'Fonte original indisponível para revalidação em 2026-09-06; afirmação não promovida à ficha.'
             else 'Conteúdo redundante com a trajetória e publicado por IA sem revisão humana; removido da ficha.'
           end,
           'despublicado_em','2026-09-06T15:35:00Z'
         ),
         timestamptz '2026-09-06T15:35:00Z'
  FROM public.pontos_atencao pa
  WHERE pa.id IN (
    '88373c8d-43c9-400d-a896-5f11e3fd3ed7',
    'a48921e3-0988-4125-bb39-4ea2729a57a2'
  )
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=pontos_atencao ref=20260906154000 campos=visivel,despublicacao_motivo,despublicado_em
  UPDATE public.pontos_atencao pa
  SET visivel=(s.postimage->>'visivel')::boolean,
      despublicacao_motivo=s.postimage->>'despublicacao_motivo',
      despublicado_em=(s.postimage->>'despublicado_em')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version='20260906154000'
    AND s.tabela='pontos_atencao'
    AND s.row_id=pa.id
    AND to_jsonb(pa)=s.preimage;

  GET DIAGNOSTICS quantidade=ROW_COUNT;
  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' AND quantidade<>2 THEN
    RAISE EXCEPTION 'fila editorial: escritas esperadas=2 atuais=%', quantidade;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pontos_atencao
    WHERE id IN (
      '88373c8d-43c9-400d-a896-5f11e3fd3ed7',
      'a48921e3-0988-4125-bb39-4ea2729a57a2'
    )
      AND (visivel IS TRUE OR despublicacao_motivo IS NULL OR despublicado_em IS NULL)
  ) THEN
    RAISE EXCEPTION 'fila editorial: pós-condição falhou';
  END IF;
END
$apply$;

COMMIT;
