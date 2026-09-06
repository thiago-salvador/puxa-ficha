BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.historico_politico IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.patrimonio IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

DELETE FROM public.patrimonio p
USING public.candidatos c
WHERE p.candidato_id=c.id
  AND c.slug='leonardo-avalanche'
  AND p.ano_eleicao=2026
  AND p.fonte LIKE 'TSE DivulgaCandContas 2026, SQ_CANDIDATO 280002553883,%';

UPDATE public.historico_politico h
SET cargo=s.preimage->>'cargo',
    periodo_inicio=(s.preimage->>'periodo_inicio')::integer,
    periodo_fim=NULLIF(s.preimage->>'periodo_fim','')::integer,
    partido=s.preimage->>'partido',
    estado=s.preimage->>'estado',
    eleito_por=s.preimage->>'eleito_por',
    observacoes=s.preimage->>'observacoes',
    cargo_canonico=s.preimage->>'cargo_canonico',
    tipo_evento=s.preimage->>'tipo_evento',
    proveniencia=s.preimage->>'proveniencia',
    despublicacao_motivo=s.preimage->>'despublicacao_motivo',
    despublicado_em=NULLIF(s.preimage->>'despublicado_em','')::timestamptz
FROM public.identidade_timeline_quarentena_snapshot s
WHERE s.migration_version='20260906185805'
  AND s.tabela='historico_politico'
  AND s.row_id=h.id
  AND to_jsonb(h)=s.postimage;

COMMIT;
