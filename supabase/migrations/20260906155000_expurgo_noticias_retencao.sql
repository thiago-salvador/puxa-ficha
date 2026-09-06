-- Apaga notícias além dos 365 dias prometidos na política de privacidade.
-- Corte congelado para que a coorte seja reproduzível e falhe se mudar antes
-- da aplicação. Esta exclusão é intencionalmente definitiva.

BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.noticias_candidato IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
  assinatura text;
BEGIN
  SELECT count(*),
         md5(coalesce(string_agg(id::text || '|' || coalesce(data_publicacao::text,''), E'\n' order by id),''))
  INTO quantidade, assinatura
  FROM public.noticias_candidato
  WHERE data_publicacao < timestamptz '2025-09-06T15:35:00Z';

  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' THEN
    IF quantidade<>1451 OR assinatura IS DISTINCT FROM 'a9d0c4839e291b241f3e3ef6748df992' THEN
      RAISE EXCEPTION 'retenção de notícias: coorte divergiu, linhas=% assinatura=%', quantidade, assinatura;
    END IF;
  END IF;

  -- @write tabela=noticias_candidato ref=retencao-20260906 chave=2025-09-06T15:35:00Z campos=delete
  DELETE FROM public.noticias_candidato
  WHERE data_publicacao < timestamptz '2025-09-06T15:35:00Z';

  GET DIAGNOSTICS quantidade=ROW_COUNT;
  IF current_setting('pf.replay', true) IS DISTINCT FROM 'true' AND quantidade<>1451 THEN
    RAISE EXCEPTION 'retenção de notícias: exclusões esperadas=1451 atuais=%', quantidade;
  END IF;
END
$apply$;

COMMIT;
