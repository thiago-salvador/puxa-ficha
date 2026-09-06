BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.chapas_2026 IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.patrimonio_ausencia_oficial IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

UPDATE public.chapas_2026 ch
SET vice_candidato_id=NULLIF(s.preimage->>'vice_candidato_id','')::uuid
FROM public.identidade_timeline_quarentena_snapshot s
WHERE s.migration_version='20260906154500'
  AND s.tabela='chapas_2026'
  AND s.row_id=ch.id
  AND to_jsonb(ch)=s.postimage;

UPDATE public.candidatos c
SET status=s.preimage->>'status',
    sq_candidato_2026=NULLIF(s.preimage->>'sq_candidato_2026',''),
    fonte_dados=ARRAY(SELECT jsonb_array_elements_text(s.preimage->'fonte_dados')),
    verificacao_campos=s.preimage->'verificacao_campos',
    ultima_atualizacao=(s.preimage->>'ultima_atualizacao')::timestamptz
FROM public.identidade_timeline_quarentena_snapshot s
WHERE s.migration_version='20260906154500'
  AND s.tabela='candidatos'
  AND s.row_id=c.id
  AND to_jsonb(c)=s.postimage;

DELETE FROM public.patrimonio_ausencia_oficial a
USING public.candidatos c
WHERE a.candidato_id=c.id
  AND c.slug='laudicerio-aguiar'
  AND a.ano_eleicao=2026
  AND a.execucao='migration:20260906154500';

COMMIT;
