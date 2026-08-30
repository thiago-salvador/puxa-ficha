\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE _profissao_qid_rollback ON COMMIT DROP AS SELECT r.*,c.profissao_declarada AS current_value,c.ultima_atualizacao AS current_updated_at FROM (SELECT l.*,substring(l.detalhe from 27)::jsonb AS d FROM public.coleta_log l WHERE l.execucao='migration:20260830120000:profissao-qid-tse-2026') r JOIN public.candidatos c ON c.id=r.candidato_id AND c.slug=r.alvo;
DO $$ DECLARE ledger integer; receipts integer; exact_rows integer; BEGIN
  SELECT count(*) INTO ledger FROM supabase_migrations.schema_migrations WHERE version='20260830120000';
  SELECT count(*) INTO receipts FROM _profissao_qid_rollback;
  SELECT count(*) INTO exact_rows FROM _profissao_qid_rollback r WHERE r.fonte='tse-candidaturas' AND r.resultado='encontrado' AND r.volume=1 AND r.url='https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip' AND r.natureza='escrita' AND r.d->>'source_sha256'='eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27' AND r.current_value IS NOT DISTINCT FROM r.d->>'target_value' AND r.current_updated_at=r.executado_em;
  IF ledger<>1 OR receipts<>63 OR exact_rows<>63 THEN RAISE EXCEPTION 'profissao QID rollback recusado ledger=% receipts=% exact=%',ledger,receipts,exact_rows; END IF;
END $$;
-- @write tabela=candidatos slug=acm-neto campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=adailton-furia campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=adriana-accorsi campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=alan-rick campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=alexandre-curi campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=amelio-cayres campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=anderson-ferreira campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=ataides-oliveira campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=beto-faro campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=ciro-gomes-gov-ce campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=cleitinho campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=confucio-moura campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=da-vitoria campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=daniel-vilela campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=david-almeida campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=dr-furlan campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=edegar-pretto campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=eduardo-braga campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=eduardo-braide campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=eduardo-girao campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=eduardo-paes campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=elmano-de-freitas campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=erika-hilton campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=felicio-ramuth campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=gabriel-azevedo campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=geraldo-alckmin campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=gilberto-kassab campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=gilson-machado campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=guto-silva campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=haddad-gov-sp campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=hana-ghassan campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=hildon-chaves campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=jeronimo campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=joao-campos campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=joel-rodrigues campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=jose-carlos-aleluia campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=jose-eliton campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=juliana-brizola campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=laurez-moreira campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=leandro-grass campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=mailza-assis campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=marconi-perillo campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=marcos-vieira campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=mateus-simoes campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=natasha-slhessarenko campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=nikolas-ferreira campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=omar-aziz campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=otaviano-pivetta campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=paula-belmonte campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=paulo-hartung campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=paulo-martins-gov-pr campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=pazolini campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=pedro-cunha-lima campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=raquel-lyra campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=ricardo-cappelli campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=roberto-cidade campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=rodrigo-bacellar campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=rodrigo-pacheco campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=silvio-mendes campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=simao-jatene campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=washington-reis campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=wellington-fagundes campos=profissao_declarada,ultima_atualizacao
-- @write tabela=candidatos slug=wilder-morais campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c SET profissao_declarada=r.d->>'previous_value',ultima_atualizacao=(r.d->>'previous_updated_at')::timestamptz FROM _profissao_qid_rollback r WHERE c.id=r.candidato_id AND c.slug=r.alvo;
DELETE FROM public.coleta_log WHERE execucao='migration:20260830120000:profissao-qid-tse-2026';
DELETE FROM supabase_migrations.schema_migrations WHERE version='20260830120000';
DO $$ BEGIN IF (SELECT count(*) FROM public.candidatos WHERE profissao_declarada ~ '^Q[0-9]+$')<>63 OR EXISTS(SELECT 1 FROM public.coleta_log WHERE execucao='migration:20260830120000:profissao-qid-tse-2026') THEN RAISE EXCEPTION 'profissao QID rollback pós-condição falhou'; END IF; END $$;
COMMIT;
