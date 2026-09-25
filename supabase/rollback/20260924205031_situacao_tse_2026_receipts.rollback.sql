BEGIN;
LOCK TABLE public.candidatos,public.coleta_log IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE
  changes jsonb := $dataset$[{"slug":"tse-2026-100002553336","sq":"100002553336","before":"aguardando julgamento","after":"indeferido com recurso"},{"slug":"tse-2026-110002553706","sq":"110002553706","before":"indeferido com recurso","after":"deferido"},{"slug":"tse-2026-130002551265","sq":"130002551265","before":"indeferido com recurso","after":"deferido"},{"slug":"tse-2026-140002550779","sq":"140002550779","before":"aguardando julgamento","after":"deferido com recurso"},{"slug":"tse-2026-140002553952","sq":"140002553952","before":"aguardando julgamento","after":"pendente de julgamento"},{"slug":"tse-2026-190002545553","sq":"190002545553","before":"aguardando julgamento","after":"deferido com recurso"},{"slug":"tse-2026-190002550182","sq":"190002550182","before":"aguardando julgamento","after":"pendente de julgamento"},{"slug":"tse-2026-20002553272","sq":"20002553272","before":"aguardando julgamento","after":"deferido"},{"slug":"tse-2026-20002553711","sq":"20002553711","before":"aguardando julgamento","after":"deferido"},{"slug":"tse-2026-20002553726","sq":"20002553726","before":"aguardando julgamento","after":"deferido"},{"slug":"tse-2026-20002553727","sq":"20002553727","before":"aguardando julgamento","after":"deferido"},{"slug":"tse-2026-210002552599","sq":"210002552599","before":"aguardando julgamento","after":"indeferido com recurso"},{"slug":"tse-2026-220002550928","sq":"220002550928","before":"aguardando julgamento","after":"pendente de julgamento"},{"slug":"tse-2026-230002549330","sq":"230002549330","before":"indeferido com recurso","after":"deferido"},{"slug":"tse-2026-240002537632","sq":"240002537632","before":"aguardando julgamento","after":"deferido"},{"slug":"tse-2026-240002539636","sq":"240002539636","before":"aguardando julgamento","after":"deferido"},{"slug":"tse-2026-240002550218","sq":"240002550218","before":"aguardando julgamento","after":"deferido"},{"slug":"tse-2026-250002553252","sq":"250002553252","before":"indeferido com recurso","after":"deferido"},{"slug":"tse-2026-270002551273","sq":"270002551273","before":"indeferido com recurso","after":"deferido com recurso"}]$dataset$::jsonb;
  affected integer;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260924205031' AND fonte='tse-situacao') <> 513 THEN
    RAISE EXCEPTION 'situacao_tse_2026: recibos divergem; rollback manual';
  END IF;
  IF (SELECT count(*) FROM jsonb_to_recordset(changes) AS e(slug text,sq text,before text,after text)
      JOIN public.candidatos c ON c.slug=e.slug AND c.sq_candidato_2026=e.sq
      WHERE c.situacao_candidatura=e.after AND c.status='candidato' AND c.publicavel IS TRUE) <> 19 THEN
    RAISE EXCEPTION 'situacao_tse_2026: pós-imagem divergiu; rollback manual';
  END IF;
  UPDATE public.candidatos c SET situacao_candidatura=e.before
  FROM jsonb_to_recordset(changes) AS e(slug text,sq text,before text,after text)
  WHERE c.slug=e.slug AND c.sq_candidato_2026=e.sq
    AND c.situacao_candidatura=e.after AND c.status='candidato' AND c.publicavel IS TRUE;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>19 THEN RAISE EXCEPTION 'situacao_tse_2026: rollback alterou %, esperado 19',affected; END IF;
  DELETE FROM public.coleta_log WHERE execucao='migration:20260924205031' AND fonte='tse-situacao';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>513 THEN RAISE EXCEPTION 'situacao_tse_2026: rollback removeu %, esperado 513',affected; END IF;
END
$rollback$;
COMMIT;
