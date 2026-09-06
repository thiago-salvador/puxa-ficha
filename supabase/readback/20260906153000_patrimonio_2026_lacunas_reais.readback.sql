DO $readback$
DECLARE quantidade integer;
BEGIN
  SELECT count(*) INTO quantidade FROM (
    SELECT p.candidato_id FROM public.patrimonio p
    JOIN public.candidatos c ON c.id=p.candidato_id
    WHERE (c.slug,p.ano_eleicao,p.valor_total,jsonb_array_length(p.bens)) IN (
      ('rico-pinheiro',2026,4380000::numeric,3),
      ('ruth-reis',2026,1324017.48::numeric,11)
    )
    UNION ALL
    SELECT a.candidato_id FROM public.patrimonio_ausencia_oficial a
    JOIN public.candidatos c ON c.id=a.candidato_id
    WHERE (c.slug,a.ano_eleicao,a.sq_candidato) IN (
      ('dr-luisinho',2026,'10002533539'),
      ('well-macedo',2026,'140002554108')
    )
  ) x;
  IF quantidade<>4 THEN RAISE EXCEPTION 'readback patrimonio 2026: esperado=4 atual=%', quantidade; END IF;
END
$readback$;
