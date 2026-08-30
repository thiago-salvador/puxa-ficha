-- Resolve profissao_declarada gravada como QID cru do Wikidata.
-- NAO aplicar em producao sem autorizacao nomeada e readback desta mesma rodada.
--
-- ACHADO (H3 do master-review de 2026-08-28, re-medido em 30/08): 63 registros de
-- public.candidatos tem `profissao_declarada` no formato `^Q[0-9]+$`, e a ficha
-- publica exibia o codigo. Producao renderizava
-- "... PUC-RJ · Q82955 · MASCULINO" no hero de /candidato/eduardo-paes.
--
-- A supressao na UI ja foi feita em outra frente: as superficies publicas passam
-- o campo por `publicTaxonomyValue`, entao o QID nao aparece mais para ninguem.
-- Esta migration corrige a RAIZ, o valor no banco.
--
-- MAPA, com fonte por QID. Os rotulos vem da API do Wikidata
-- (action=wbgetentities, props=labels, languages=pt-br|pt|en), lida em
-- 2026-08-30, e estao congelados em
-- data/qid-profissao/profissao-declarada-qid-20260830.json junto com os 63 slugs:
--
--   Q82955  40x  ->  Político           (wikidata pt-br: político; en: politician)
--   Q40348   9x  ->  Advogado           (wikidata pt-br: advogado(a); en: lawyer)
--   Q43845   3x  ->  Empresário         (wikidata pt-br: empresário; en: businessperson)
--   Q937857   3x  ->  Futebolista        (wikidata pt-br: futebolista; en: association football player)
--   Q212238   2x  ->  Servidor público   (wikidata pt-br: servidor público; en: civil servant)
--   Q39631   2x  ->  Médico             (wikidata pt-br: médico; en: physician)
--   Q33999   1x  ->  Ator               (wikidata pt-br: ator; en: actor)
--   Q36180   1x  ->  Escritor           (wikidata pt-br: escritor; en: writer)
--   Q37226   1x  ->  Professor          (wikidata pt-br: professor(a); en: teacher)
--   Q81096   1x  ->  Engenheiro         (wikidata pt-br: engenheiro; en: engineer)
--
-- A forma que vai para a coluna e capitalizada e sem marcador de genero, para
-- casar com o resto de `profissao_declarada`, que vem do TSE nesse formato.
--
-- ESTRITO POR PAR. O UPDATE casa slug E o QID exato medido. Um registro cujo
-- valor tenha mudado desde a medicao nao e tocado: o backfill nao adivinha o
-- estado atual de nada. Rerodar e no-op, porque nenhuma linha continua com QID.

BEGIN;

DO $precondition$
DECLARE
  com_qid integer;
  alvos_presentes integer;
BEGIN
  WITH alvo(slug, qid, rotulo) AS (
    VALUES
      ('joao-campos', 'Q212238', 'Servidor público'),
      ('joel-rodrigues', 'Q212238', 'Servidor público'),
      ('gabriel-azevedo', 'Q33999', 'Ator'),
      ('paulo-martins-gov-pr', 'Q36180', 'Escritor'),
      ('mateus-simoes', 'Q37226', 'Professor'),
      ('geraldo-alckmin', 'Q39631', 'Médico'),
      ('natasha-slhessarenko', 'Q39631', 'Médico'),
      ('acm-neto', 'Q40348', 'Advogado'),
      ('adailton-furia', 'Q40348', 'Advogado'),
      ('ciro-gomes-gov-ce', 'Q40348', 'Advogado'),
      ('david-almeida', 'Q40348', 'Advogado'),
      ('elmano-de-freitas', 'Q40348', 'Advogado'),
      ('haddad-gov-sp', 'Q40348', 'Advogado'),
      ('jose-eliton', 'Q40348', 'Advogado'),
      ('juliana-brizola', 'Q40348', 'Advogado'),
      ('pedro-cunha-lima', 'Q40348', 'Advogado'),
      ('ataides-oliveira', 'Q43845', 'Empresário'),
      ('otaviano-pivetta', 'Q43845', 'Empresário'),
      ('paula-belmonte', 'Q43845', 'Empresário'),
      ('gilberto-kassab', 'Q81096', 'Engenheiro'),
      ('adriana-accorsi', 'Q82955', 'Político'),
      ('alan-rick', 'Q82955', 'Político'),
      ('alexandre-curi', 'Q82955', 'Político'),
      ('amelio-cayres', 'Q82955', 'Político'),
      ('beto-faro', 'Q82955', 'Político'),
      ('cleitinho', 'Q82955', 'Político'),
      ('confucio-moura', 'Q82955', 'Político'),
      ('da-vitoria', 'Q82955', 'Político'),
      ('daniel-vilela', 'Q82955', 'Político'),
      ('dr-furlan', 'Q82955', 'Político'),
      ('edegar-pretto', 'Q82955', 'Político'),
      ('eduardo-braga', 'Q82955', 'Político'),
      ('eduardo-braide', 'Q82955', 'Político'),
      ('eduardo-girao', 'Q82955', 'Político'),
      ('eduardo-paes', 'Q82955', 'Político'),
      ('erika-hilton', 'Q82955', 'Político'),
      ('felicio-ramuth', 'Q82955', 'Político'),
      ('gilson-machado', 'Q82955', 'Político'),
      ('guto-silva', 'Q82955', 'Político'),
      ('hana-ghassan', 'Q82955', 'Político'),
      ('hildon-chaves', 'Q82955', 'Político'),
      ('jose-carlos-aleluia', 'Q82955', 'Político'),
      ('laurez-moreira', 'Q82955', 'Político'),
      ('leandro-grass', 'Q82955', 'Político'),
      ('mailza-assis', 'Q82955', 'Político'),
      ('marconi-perillo', 'Q82955', 'Político'),
      ('marcos-vieira', 'Q82955', 'Político'),
      ('nikolas-ferreira', 'Q82955', 'Político'),
      ('omar-aziz', 'Q82955', 'Político'),
      ('paulo-hartung', 'Q82955', 'Político'),
      ('pazolini', 'Q82955', 'Político'),
      ('raquel-lyra', 'Q82955', 'Político'),
      ('ricardo-cappelli', 'Q82955', 'Político'),
      ('roberto-cidade', 'Q82955', 'Político'),
      ('rodrigo-bacellar', 'Q82955', 'Político'),
      ('rodrigo-pacheco', 'Q82955', 'Político'),
      ('simao-jatene', 'Q82955', 'Político'),
      ('washington-reis', 'Q82955', 'Político'),
      ('wellington-fagundes', 'Q82955', 'Político'),
      ('wilder-morais', 'Q82955', 'Político'),
      ('anderson-ferreira', 'Q937857', 'Futebolista'),
      ('jeronimo', 'Q937857', 'Futebolista'),
      ('silvio-mendes', 'Q937857', 'Futebolista')
  )
  SELECT count(*) INTO alvos_presentes
  FROM alvo a
  JOIN public.candidatos c ON c.slug = a.slug AND c.profissao_declarada = a.qid;

  -- GUARD DE AUSENCIA, e ele vem primeiro de proposito.
  -- Num replay linear em banco vazio nenhum destes candidatos existe ainda, e
  -- ausencia ali e banco vazio, nao violacao de invariante. Sem este ramo a
  -- migration entraria no conjunto de quebras de replay do repositorio
  -- (scripts/audit/quebras-previstas.json), que e exatamente o que o gate de
  -- classificacao impede para arquivo novo.
  IF alvos_presentes = 0 THEN
    RAISE NOTICE 'profissao QID: nenhum alvo presente (replay ou base vazia); nada aplicado';
    RETURN;
  END IF;

  SELECT count(*) INTO com_qid
  FROM public.candidatos
  WHERE profissao_declarada ~ '^Q[0-9]+$';

  -- Daqui para baixo o banco TEM os alvos, entao divergencia e divergencia.
  -- Falha fechada em duas direcoes. Mais QID do que o medido significa que a
  -- ingestao voltou a gravar codigo e este mapa esta incompleto: aplicar
  -- deixaria o resto invisivel. Menos alvo presente que QID significa que a
  -- medicao envelheceu.
  IF com_qid > 63 THEN
    RAISE EXCEPTION 'profissao QID: banco tem % registros com QID, acima dos 63 medidos em 2026-08-30; remedir antes de aplicar', com_qid;
  END IF;
  IF alvos_presentes <> com_qid THEN
    RAISE EXCEPTION 'profissao QID: % registros com QID mas so % casam slug+QID medidos; remedir antes de aplicar', com_qid, alvos_presentes;
  END IF;
  RAISE NOTICE 'profissao QID: % registros elegiveis', alvos_presentes;
END
$precondition$;

WITH alvo(slug, qid, rotulo) AS (
  VALUES
    ('joao-campos', 'Q212238', 'Servidor público'),
      ('joel-rodrigues', 'Q212238', 'Servidor público'),
      ('gabriel-azevedo', 'Q33999', 'Ator'),
      ('paulo-martins-gov-pr', 'Q36180', 'Escritor'),
      ('mateus-simoes', 'Q37226', 'Professor'),
      ('geraldo-alckmin', 'Q39631', 'Médico'),
      ('natasha-slhessarenko', 'Q39631', 'Médico'),
      ('acm-neto', 'Q40348', 'Advogado'),
      ('adailton-furia', 'Q40348', 'Advogado'),
      ('ciro-gomes-gov-ce', 'Q40348', 'Advogado'),
      ('david-almeida', 'Q40348', 'Advogado'),
      ('elmano-de-freitas', 'Q40348', 'Advogado'),
      ('haddad-gov-sp', 'Q40348', 'Advogado'),
      ('jose-eliton', 'Q40348', 'Advogado'),
      ('juliana-brizola', 'Q40348', 'Advogado'),
      ('pedro-cunha-lima', 'Q40348', 'Advogado'),
      ('ataides-oliveira', 'Q43845', 'Empresário'),
      ('otaviano-pivetta', 'Q43845', 'Empresário'),
      ('paula-belmonte', 'Q43845', 'Empresário'),
      ('gilberto-kassab', 'Q81096', 'Engenheiro'),
      ('adriana-accorsi', 'Q82955', 'Político'),
      ('alan-rick', 'Q82955', 'Político'),
      ('alexandre-curi', 'Q82955', 'Político'),
      ('amelio-cayres', 'Q82955', 'Político'),
      ('beto-faro', 'Q82955', 'Político'),
      ('cleitinho', 'Q82955', 'Político'),
      ('confucio-moura', 'Q82955', 'Político'),
      ('da-vitoria', 'Q82955', 'Político'),
      ('daniel-vilela', 'Q82955', 'Político'),
      ('dr-furlan', 'Q82955', 'Político'),
      ('edegar-pretto', 'Q82955', 'Político'),
      ('eduardo-braga', 'Q82955', 'Político'),
      ('eduardo-braide', 'Q82955', 'Político'),
      ('eduardo-girao', 'Q82955', 'Político'),
      ('eduardo-paes', 'Q82955', 'Político'),
      ('erika-hilton', 'Q82955', 'Político'),
      ('felicio-ramuth', 'Q82955', 'Político'),
      ('gilson-machado', 'Q82955', 'Político'),
      ('guto-silva', 'Q82955', 'Político'),
      ('hana-ghassan', 'Q82955', 'Político'),
      ('hildon-chaves', 'Q82955', 'Político'),
      ('jose-carlos-aleluia', 'Q82955', 'Político'),
      ('laurez-moreira', 'Q82955', 'Político'),
      ('leandro-grass', 'Q82955', 'Político'),
      ('mailza-assis', 'Q82955', 'Político'),
      ('marconi-perillo', 'Q82955', 'Político'),
      ('marcos-vieira', 'Q82955', 'Político'),
      ('nikolas-ferreira', 'Q82955', 'Político'),
      ('omar-aziz', 'Q82955', 'Político'),
      ('paulo-hartung', 'Q82955', 'Político'),
      ('pazolini', 'Q82955', 'Político'),
      ('raquel-lyra', 'Q82955', 'Político'),
      ('ricardo-cappelli', 'Q82955', 'Político'),
      ('roberto-cidade', 'Q82955', 'Político'),
      ('rodrigo-bacellar', 'Q82955', 'Político'),
      ('rodrigo-pacheco', 'Q82955', 'Político'),
      ('simao-jatene', 'Q82955', 'Político'),
      ('washington-reis', 'Q82955', 'Político'),
      ('wellington-fagundes', 'Q82955', 'Político'),
      ('wilder-morais', 'Q82955', 'Político'),
      ('anderson-ferreira', 'Q937857', 'Futebolista'),
      ('jeronimo', 'Q937857', 'Futebolista'),
      ('silvio-mendes', 'Q937857', 'Futebolista')
)
UPDATE public.candidatos c
SET profissao_declarada = a.rotulo
FROM alvo a
WHERE c.slug = a.slug
  AND c.profissao_declarada = a.qid;

COMMIT;
