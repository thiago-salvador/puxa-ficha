BEGIN;

CREATE TEMP TABLE candidate_photo_updates (
  slug text PRIMARY KEY,
  foto_url text NOT NULL
) ON COMMIT DROP;

INSERT INTO candidate_photo_updates (slug, foto_url)
VALUES
  ('eudo-raffael', '/candidates/eudo-raffael.jpg'),
  ('thor-dantas', '/candidates/thor-dantas.jpg'),
  ('giovanni-sampaio', '/candidates/giovanni-sampaio.jpg'),
  ('huggo-leonardo', '/candidates/huggo-leonardo.jpg'),
  ('jarir-pereira', '/candidates/jarir-pereira.jpg'),
  ('ze-batista', '/candidates/ze-batista.avif'),
  ('izalci-lucas', '/candidates/izalci-lucas.jpg'),
  ('kiko-caputo', '/candidates/kiko-caputo.jpg'),
  ('telemaco-brandao', '/candidates/telemaco-brandao.jpg'),
  ('andre-luis', '/candidates/andre-luis.webp'),
  ('henrique-areas', '/candidates/henrique-areas.webp'),
  ('indira-xavier', '/candidates/indira-xavier.webp'),
  ('rafael-duda', '/candidates/rafael-duda.jpg'),
  ('jeferson-bezerra', '/candidates/jeferson-bezerra.webp'),
  ('renato-gomes', '/candidates/renato-gomes.png'),
  ('raquel-bricio', '/candidates/raquel-bricio.avif'),
  ('olimpio-rocha', '/candidates/olimpio-rocha.webp'),
  ('camila-falcao', '/candidates/camila-falcao.webp'),
  ('renan-hallais', '/candidates/renan-hallais.jpg'),
  ('elizeu-aguiar', '/candidates/elizeu-aguiar.jpg'),
  ('francisco-jurity', '/candidates/francisco-jurity.png'),
  ('geraldo-carvalho', '/candidates/geraldo-carvalho.jpg'),
  ('gisvaldo-oliveira', '/candidates/gisvaldo-oliveira.avif'),
  ('gustavo-henrique', '/candidates/gustavo-henrique.jpg'),
  ('ravenna-castro', '/candidates/ravenna-castro.jpg'),
  ('santiago-belizario', '/candidates/santiago-belizario.jpg'),
  ('rafael-luz', '/candidates/rafael-luz.jpg'),
  ('dario-barbosa', '/candidates/dario-barbosa.jpg'),
  ('roberio-paulino', '/candidates/roberio-paulino.jpg'),
  ('ricardo-frota', '/candidates/ricardo-frota.jpg'),
  ('antonia-pedrosa', '/candidates/antonia-pedrosa.jpg'),
  ('dr-helton-monteiro', '/candidates/dr-helton-monteiro.jpg'),
  ('emanuel-cacho', '/candidates/emanuel-cacho.jpg'),
  ('ricardo-marques', '/candidates/ricardo-marques.jpg'),
  ('camilo-terra', '/candidates/camilo-terra.jpg'),
  ('izadora-dias', '/candidates/izadora-dias.jpg');

UPDATE public.candidatos c
SET
  foto_url = p.foto_url,
  fonte_dados = (
    SELECT ARRAY(
      SELECT DISTINCT value
      FROM unnest(
        COALESCE(c.fonte_dados, ARRAY[]::text[])
        || ARRAY['curadoria-foto-local-20260629']::text[]
      ) AS source(value)
      ORDER BY value
    )
  ),
  ultima_atualizacao = NOW()
FROM candidate_photo_updates p
WHERE c.slug = p.slug
  AND (
    c.foto_url IS NULL
    OR btrim(c.foto_url) = ''
    OR c.foto_url = p.foto_url
  );

DO $$
DECLARE
  payload_count integer;
  matched_candidate_count integer;
  matched_public_count integer;
  public_missing_photo_count integer;
BEGIN
  SELECT count(*) INTO payload_count
  FROM candidate_photo_updates;

  IF payload_count <> 36 THEN
    RAISE EXCEPTION 'candidate photos payload count must be 36, got %', payload_count;
  END IF;

  SELECT count(*) INTO matched_candidate_count
  FROM public.candidatos c
  JOIN candidate_photo_updates p ON p.slug = c.slug
  WHERE c.foto_url = p.foto_url;

  IF matched_candidate_count <> 36 THEN
    RAISE EXCEPTION 'candidate photos matched in candidatos must be 36, got %', matched_candidate_count;
  END IF;

  SELECT count(*) INTO matched_public_count
  FROM public.candidatos_publico c
  JOIN candidate_photo_updates p ON p.slug = c.slug
  WHERE c.foto_url = p.foto_url;

  IF matched_public_count <> 36 THEN
    RAISE EXCEPTION 'candidate photos matched in candidatos_publico must be 36, got %', matched_public_count;
  END IF;

  SELECT count(*) INTO public_missing_photo_count
  FROM public.candidatos_publico
  WHERE foto_url IS NULL OR btrim(foto_url) = '';

  IF public_missing_photo_count <> 0 THEN
    RAISE EXCEPTION 'published candidates without foto_url after local photo fill: %', public_missing_photo_count;
  END IF;
END $$;

COMMIT;
