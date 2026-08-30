-- Readback somente leitura do backfill 20260830120000.
-- Esperado apos aplicacao autorizada: zero registro com QID cru, os 63 slugs com
-- o rotulo do mapa, e o ledger com esta versao no topo.

DO $assert$
DECLARE
  restou_qid integer;
  no_ledger integer;
  ledger_top text;
BEGIN
  SELECT count(*) INTO restou_qid
  FROM public.candidatos
  WHERE profissao_declarada ~ '^Q[0-9]+$';
  IF restou_qid <> 0 THEN
    RAISE EXCEPTION 'profissao QID readback: sobraram % registros com QID cru', restou_qid;
  END IF;

  IF (SELECT count(*) FROM public.candidatos WHERE slug IN ('joao-campos', 'joel-rodrigues') AND profissao_declarada = 'Servidor público') <> 2 THEN
    RAISE EXCEPTION 'profissao QID readback: Q212238 nao virou Servidor público nos 2 registros';
  END IF;
  IF (SELECT count(*) FROM public.candidatos WHERE slug IN ('gabriel-azevedo') AND profissao_declarada = 'Ator') <> 1 THEN
    RAISE EXCEPTION 'profissao QID readback: Q33999 nao virou Ator nos 1 registros';
  END IF;
  IF (SELECT count(*) FROM public.candidatos WHERE slug IN ('paulo-martins-gov-pr') AND profissao_declarada = 'Escritor') <> 1 THEN
    RAISE EXCEPTION 'profissao QID readback: Q36180 nao virou Escritor nos 1 registros';
  END IF;
  IF (SELECT count(*) FROM public.candidatos WHERE slug IN ('mateus-simoes') AND profissao_declarada = 'Professor') <> 1 THEN
    RAISE EXCEPTION 'profissao QID readback: Q37226 nao virou Professor nos 1 registros';
  END IF;
  IF (SELECT count(*) FROM public.candidatos WHERE slug IN ('geraldo-alckmin', 'natasha-slhessarenko') AND profissao_declarada = 'Médico') <> 2 THEN
    RAISE EXCEPTION 'profissao QID readback: Q39631 nao virou Médico nos 2 registros';
  END IF;
  IF (SELECT count(*) FROM public.candidatos WHERE slug IN ('acm-neto', 'adailton-furia', 'ciro-gomes-gov-ce', 'david-almeida', 'elmano-de-freitas', 'haddad-gov-sp', 'jose-eliton', 'juliana-brizola', 'pedro-cunha-lima') AND profissao_declarada = 'Advogado') <> 9 THEN
    RAISE EXCEPTION 'profissao QID readback: Q40348 nao virou Advogado nos 9 registros';
  END IF;
  IF (SELECT count(*) FROM public.candidatos WHERE slug IN ('ataides-oliveira', 'otaviano-pivetta', 'paula-belmonte') AND profissao_declarada = 'Empresário') <> 3 THEN
    RAISE EXCEPTION 'profissao QID readback: Q43845 nao virou Empresário nos 3 registros';
  END IF;
  IF (SELECT count(*) FROM public.candidatos WHERE slug IN ('gilberto-kassab') AND profissao_declarada = 'Engenheiro') <> 1 THEN
    RAISE EXCEPTION 'profissao QID readback: Q81096 nao virou Engenheiro nos 1 registros';
  END IF;
  IF (SELECT count(*) FROM public.candidatos WHERE slug IN ('adriana-accorsi', 'alan-rick', 'alexandre-curi', 'amelio-cayres', 'beto-faro', 'cleitinho', 'confucio-moura', 'da-vitoria', 'daniel-vilela', 'dr-furlan', 'edegar-pretto', 'eduardo-braga', 'eduardo-braide', 'eduardo-girao', 'eduardo-paes', 'erika-hilton', 'felicio-ramuth', 'gilson-machado', 'guto-silva', 'hana-ghassan', 'hildon-chaves', 'jose-carlos-aleluia', 'laurez-moreira', 'leandro-grass', 'mailza-assis', 'marconi-perillo', 'marcos-vieira', 'nikolas-ferreira', 'omar-aziz', 'paulo-hartung', 'pazolini', 'raquel-lyra', 'ricardo-cappelli', 'roberto-cidade', 'rodrigo-bacellar', 'rodrigo-pacheco', 'simao-jatene', 'washington-reis', 'wellington-fagundes', 'wilder-morais') AND profissao_declarada = 'Político') <> 40 THEN
    RAISE EXCEPTION 'profissao QID readback: Q82955 nao virou Político nos 40 registros';
  END IF;
  IF (SELECT count(*) FROM public.candidatos WHERE slug IN ('anderson-ferreira', 'jeronimo', 'silvio-mendes') AND profissao_declarada = 'Futebolista') <> 3 THEN
    RAISE EXCEPTION 'profissao QID readback: Q937857 nao virou Futebolista nos 3 registros';
  END IF;

  SELECT count(*) INTO no_ledger
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260830120000';
  SELECT max(version) INTO ledger_top
  FROM supabase_migrations.schema_migrations;
  IF no_ledger <> 1 OR ledger_top IS DISTINCT FROM '20260830120000' THEN
    RAISE EXCEPTION 'profissao QID readback: ledger nao confere (linhas=%, topo=%)', no_ledger, ledger_top;
  END IF;
END
$assert$;

SELECT
  (SELECT count(*) FROM public.candidatos WHERE profissao_declarada ~ '^Q[0-9]+$') AS restou_qid,
  (SELECT count(*) FROM public.candidatos WHERE profissao_declarada IN ('Advogado', 'Ator', 'Empresário', 'Engenheiro', 'Escritor', 'Futebolista', 'Médico', 'Político', 'Professor', 'Servidor público')) AS com_rotulo_do_mapa,
  (SELECT max(version) FROM supabase_migrations.schema_migrations) AS ledger_top;
