-- Remedia QIDs em profissao_declarada usando somente declaração oficial TSE 2026.
-- O nome do arquivo preserva a versão já aberta no PR; rótulos do Wikidata não são gravados.
BEGIN;
CREATE TEMP TABLE _profissao_qid_expected(slug text primary key,previous_value text,target_value text,sq_candidato text,occupation_code text,source_role text,source_uf text,source_kind text) ON COMMIT DROP;
INSERT INTO _profissao_qid_expected VALUES
  ('acm-neto','Q40348','EMPRESÁRIO','50002533190','257','GOVERNADOR','BA','tse_2026_declared_occupation'),
  ('adailton-furia','Q40348','OUTROS','220002536806','999','GOVERNADOR','RO','tse_2026_declared_occupation'),
  ('adriana-accorsi','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('alan-rick','Q82955','JORNALISTA E REDATOR','10002532492','171','GOVERNADOR','AC','tse_2026_declared_occupation'),
  ('alexandre-curi','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('amelio-cayres','Q82955','DEPUTADO','270002544545','277','VICE-GOVERNADOR','TO','tse_2026_declared_occupation'),
  ('anderson-ferreira','Q937857',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('ataides-oliveira','Q43845','EMPRESÁRIO','270002548412','257','GOVERNADOR','TO','tse_2026_declared_occupation'),
  ('beto-faro','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('ciro-gomes-gov-ce','Q40348','ADVOGADO','60002531351','131','GOVERNADOR','CE','tse_2026_declared_occupation'),
  ('cleitinho','Q82955','SENADOR','130002552296','276','GOVERNADOR','MG','tse_2026_declared_occupation'),
  ('confucio-moura','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('da-vitoria','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('daniel-vilela','Q82955','GOVERNADOR','90002540993','274','GOVERNADOR','GO','tse_2026_declared_occupation'),
  ('david-almeida','Q40348','OUTROS','40002536086','999','GOVERNADOR','AM','tse_2026_declared_occupation'),
  ('dr-furlan','Q82955','MÉDICO','30002530014','111','GOVERNADOR','AP','tse_2026_declared_occupation'),
  ('edegar-pretto','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('eduardo-braga','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('eduardo-braide','Q82955','ADVOGADO','100002545679','131','GOVERNADOR','MA','tse_2026_declared_occupation'),
  ('eduardo-girao','Q82955','SENADOR','280002539825','276','VICE-PRESIDENTE','BR','tse_2026_declared_occupation'),
  ('eduardo-paes','Q82955','OUTROS','190002543380','999','GOVERNADOR','RJ','tse_2026_declared_occupation'),
  ('elmano-de-freitas','Q40348','GOVERNADOR','60002543969','274','GOVERNADOR','CE','tse_2026_declared_occupation'),
  ('erika-hilton','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('felicio-ramuth','Q82955','OUTROS','250002541302','999','VICE-GOVERNADOR','SP','tse_2026_declared_occupation'),
  ('gabriel-azevedo','Q33999','PROFESSOR DE ENSINO SUPERIOR','130002549557','142','GOVERNADOR','MG','tse_2026_declared_occupation'),
  ('geraldo-alckmin','Q39631','MÉDICO','280002542549','111','VICE-PRESIDENTE','BR','tse_2026_declared_occupation'),
  ('gilberto-kassab','Q81096',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('gilson-machado','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('guto-silva','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('haddad-gov-sp','Q40348','PROFESSOR DE ENSINO SUPERIOR','250002549705','142','GOVERNADOR','SP','tse_2026_declared_occupation'),
  ('hana-ghassan','Q82955','GOVERNADOR','140002551598','274','GOVERNADOR','PA','tse_2026_declared_occupation'),
  ('hildon-chaves','Q82955','EMPRESÁRIO','220002542916','257','GOVERNADOR','RO','tse_2026_declared_occupation'),
  ('jeronimo','Q937857','SERVIDOR PÚBLICO ESTADUAL','50002536314','297','GOVERNADOR','BA','tse_2026_declared_occupation'),
  ('joao-campos','Q212238','ENGENHEIRO','170002537230','101','GOVERNADOR','PE','tse_2026_declared_occupation'),
  ('joel-rodrigues','Q212238','TÉCNICO CONTABILIDADE, ESTATÍSTICA, ECONOMIA DOMÉSTICA E ADMINISTRAÇÃO','180002538530','151','GOVERNADOR','PI','tse_2026_declared_occupation'),
  ('jose-carlos-aleluia','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('jose-eliton','Q40348',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('juliana-brizola','Q40348','OUTROS','210002551508','999','GOVERNADOR','RS','tse_2026_declared_occupation'),
  ('laurez-moreira','Q82955','ADVOGADO','270002544494','131','GOVERNADOR','TO','tse_2026_declared_occupation'),
  ('leandro-grass','Q82955','PROFESSOR DE ENSINO SUPERIOR','70002552496','142','GOVERNADOR','DF','tse_2026_declared_occupation'),
  ('mailza-assis','Q82955','GOVERNADOR','10002544107','274','GOVERNADOR','AC','tse_2026_declared_occupation'),
  ('marconi-perillo','Q82955','EMPRESÁRIO','90002543463','257','GOVERNADOR','GO','tse_2026_declared_occupation'),
  ('marcos-vieira','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('mateus-simoes','Q37226','GOVERNADOR','130002541911','274','GOVERNADOR','MG','tse_2026_declared_occupation'),
  ('natasha-slhessarenko','Q39631','MÉDICO','110002544985','111','GOVERNADOR','MT','tse_2026_declared_occupation'),
  ('nikolas-ferreira','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('omar-aziz','Q82955','SENADOR','40002532272','276','GOVERNADOR','AM','tse_2026_declared_occupation'),
  ('otaviano-pivetta','Q43845','GOVERNADOR','110002551480','274','GOVERNADOR','MT','tse_2026_declared_occupation'),
  ('paula-belmonte','Q43845','EMPRESÁRIO','70002552965','257','GOVERNADOR','DF','tse_2026_declared_occupation'),
  ('paulo-hartung','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('paulo-martins-gov-pr','Q36180',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('pazolini','Q82955','SERVIDOR PÚBLICO ESTADUAL','80002552682','297','GOVERNADOR','ES','tse_2026_declared_occupation'),
  ('pedro-cunha-lima','Q40348',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('raquel-lyra','Q82955','GOVERNADOR','170002537227','274','GOVERNADOR','PE','tse_2026_declared_occupation'),
  ('ricardo-cappelli','Q82955','JORNALISTA E REDATOR','70002551557','171','GOVERNADOR','DF','tse_2026_declared_occupation'),
  ('roberto-cidade','Q82955','GOVERNADOR','40002541741','274','GOVERNADOR','AM','tse_2026_declared_occupation'),
  ('rodrigo-bacellar','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('rodrigo-pacheco','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('silvio-mendes','Q937857',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('simao-jatene','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('washington-reis','Q82955',NULL,NULL,NULL,NULL,NULL,'no_verified_tse_2026_link'),
  ('wellington-fagundes','Q82955','MÉDICO','110002551737','111','GOVERNADOR','MT','tse_2026_declared_occupation'),
  ('wilder-morais','Q82955','ENGENHEIRO','90002551791','101','GOVERNADOR','GO','tse_2026_declared_occupation');
CREATE TEMP TABLE _profissao_qid_snapshot ON COMMIT DROP AS
SELECT c.id,e.*,c.ultima_atualizacao AS previous_updated_at,statement_timestamp() AS migration_em
FROM _profissao_qid_expected e JOIN public.candidatos c ON c.slug=e.slug AND c.profissao_declarada=e.previous_value;
DO $$ DECLARE qids integer; matched integer; BEGIN
  SELECT count(*) INTO matched FROM _profissao_qid_snapshot;
  IF matched=0 THEN RAISE NOTICE 'profissao QID: nenhum alvo presente; replay/no-op'; RETURN; END IF;
  SELECT count(*) INTO qids FROM public.candidatos WHERE profissao_declarada ~ '^Q[0-9]+$';
  IF qids<>63 OR matched<>63 THEN RAISE EXCEPTION 'profissao QID: estado divergente qids=% pares_exatos=% esperado=63',qids,matched; END IF;
  IF EXISTS(SELECT 1 FROM public.coleta_log WHERE execucao='migration:20260830120000:profissao-qid-tse-2026') THEN RAISE EXCEPTION 'profissao QID: receipts da execução já existem'; END IF;
END $$;
-- @write tabela=coleta_log slug=acm-neto campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=adailton-furia campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=adriana-accorsi campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=alan-rick campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=alexandre-curi campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=amelio-cayres campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=anderson-ferreira campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=ataides-oliveira campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=beto-faro campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=ciro-gomes-gov-ce campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=cleitinho campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=confucio-moura campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=da-vitoria campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=daniel-vilela campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=david-almeida campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=dr-furlan campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=edegar-pretto campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=eduardo-braga campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=eduardo-braide campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=eduardo-girao campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=eduardo-paes campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=elmano-de-freitas campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=erika-hilton campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=felicio-ramuth campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=gabriel-azevedo campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=geraldo-alckmin campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=gilberto-kassab campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=gilson-machado campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=guto-silva campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=haddad-gov-sp campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=hana-ghassan campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=hildon-chaves campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=jeronimo campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=joao-campos campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=joel-rodrigues campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=jose-carlos-aleluia campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=jose-eliton campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=juliana-brizola campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=laurez-moreira campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=leandro-grass campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=mailza-assis campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=marconi-perillo campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=marcos-vieira campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=mateus-simoes campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=natasha-slhessarenko campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=nikolas-ferreira campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=omar-aziz campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=otaviano-pivetta campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=paula-belmonte campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=paulo-hartung campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=paulo-martins-gov-pr campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=pazolini campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=pedro-cunha-lima campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=raquel-lyra campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=ricardo-cappelli campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=roberto-cidade campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=rodrigo-bacellar campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=rodrigo-pacheco campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=silvio-mendes campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=simao-jatene campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=washington-reis campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=wellington-fagundes campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
-- @write tabela=coleta_log slug=wilder-morais campos=fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza
INSERT INTO public.coleta_log(fonte,escopo,alvo,candidato_id,executado_em,resultado,volume,detalhe,url,execucao,natureza)
SELECT 'tse-candidaturas','candidato',s.slug,s.id,s.migration_em,'encontrado',1,'profissao_qid_tse_2026_v1:'||(jsonb_build_object('contract_version',1,'slug',s.slug,'previous_value',s.previous_value,'target_value',s.target_value,'previous_updated_at',s.previous_updated_at,'sq_candidato',s.sq_candidato,'occupation_code',s.occupation_code,'source_role',s.source_role,'source_uf',s.source_uf,'source_kind',s.source_kind,'source_sha256','eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27'))::text,'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip','migration:20260830120000:profissao-qid-tse-2026','escrita'
FROM _profissao_qid_snapshot s WHERE s.slug IN ('acm-neto','adailton-furia','adriana-accorsi','alan-rick','alexandre-curi','amelio-cayres','anderson-ferreira','ataides-oliveira','beto-faro','ciro-gomes-gov-ce','cleitinho','confucio-moura','da-vitoria','daniel-vilela','david-almeida','dr-furlan','edegar-pretto','eduardo-braga','eduardo-braide','eduardo-girao','eduardo-paes','elmano-de-freitas','erika-hilton','felicio-ramuth','gabriel-azevedo','geraldo-alckmin','gilberto-kassab','gilson-machado','guto-silva','haddad-gov-sp','hana-ghassan','hildon-chaves','jeronimo','joao-campos','joel-rodrigues','jose-carlos-aleluia','jose-eliton','juliana-brizola','laurez-moreira','leandro-grass','mailza-assis','marconi-perillo','marcos-vieira','mateus-simoes','natasha-slhessarenko','nikolas-ferreira','omar-aziz','otaviano-pivetta','paula-belmonte','paulo-hartung','paulo-martins-gov-pr','pazolini','pedro-cunha-lima','raquel-lyra','ricardo-cappelli','roberto-cidade','rodrigo-bacellar','rodrigo-pacheco','silvio-mendes','simao-jatene','washington-reis','wellington-fagundes','wilder-morais');
-- @write tabela=candidatos slug=acm-neto campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='acm-neto' AND s.slug='acm-neto' AND c.profissao_declarada='Q40348';
-- @write tabela=candidatos slug=adailton-furia campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='adailton-furia' AND s.slug='adailton-furia' AND c.profissao_declarada='Q40348';
-- @write tabela=candidatos slug=adriana-accorsi campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='adriana-accorsi' AND s.slug='adriana-accorsi' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=alan-rick campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='alan-rick' AND s.slug='alan-rick' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=alexandre-curi campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='alexandre-curi' AND s.slug='alexandre-curi' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=amelio-cayres campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='amelio-cayres' AND s.slug='amelio-cayres' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=anderson-ferreira campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='anderson-ferreira' AND s.slug='anderson-ferreira' AND c.profissao_declarada='Q937857';
-- @write tabela=candidatos slug=ataides-oliveira campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='ataides-oliveira' AND s.slug='ataides-oliveira' AND c.profissao_declarada='Q43845';
-- @write tabela=candidatos slug=beto-faro campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='beto-faro' AND s.slug='beto-faro' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=ciro-gomes-gov-ce campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='ciro-gomes-gov-ce' AND s.slug='ciro-gomes-gov-ce' AND c.profissao_declarada='Q40348';
-- @write tabela=candidatos slug=cleitinho campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='cleitinho' AND s.slug='cleitinho' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=confucio-moura campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='confucio-moura' AND s.slug='confucio-moura' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=da-vitoria campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='da-vitoria' AND s.slug='da-vitoria' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=daniel-vilela campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='daniel-vilela' AND s.slug='daniel-vilela' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=david-almeida campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='david-almeida' AND s.slug='david-almeida' AND c.profissao_declarada='Q40348';
-- @write tabela=candidatos slug=dr-furlan campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='dr-furlan' AND s.slug='dr-furlan' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=edegar-pretto campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='edegar-pretto' AND s.slug='edegar-pretto' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=eduardo-braga campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='eduardo-braga' AND s.slug='eduardo-braga' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=eduardo-braide campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='eduardo-braide' AND s.slug='eduardo-braide' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=eduardo-girao campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='eduardo-girao' AND s.slug='eduardo-girao' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=eduardo-paes campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='eduardo-paes' AND s.slug='eduardo-paes' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=elmano-de-freitas campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='elmano-de-freitas' AND s.slug='elmano-de-freitas' AND c.profissao_declarada='Q40348';
-- @write tabela=candidatos slug=erika-hilton campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='erika-hilton' AND s.slug='erika-hilton' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=felicio-ramuth campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='felicio-ramuth' AND s.slug='felicio-ramuth' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=gabriel-azevedo campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='gabriel-azevedo' AND s.slug='gabriel-azevedo' AND c.profissao_declarada='Q33999';
-- @write tabela=candidatos slug=geraldo-alckmin campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='geraldo-alckmin' AND s.slug='geraldo-alckmin' AND c.profissao_declarada='Q39631';
-- @write tabela=candidatos slug=gilberto-kassab campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='gilberto-kassab' AND s.slug='gilberto-kassab' AND c.profissao_declarada='Q81096';
-- @write tabela=candidatos slug=gilson-machado campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='gilson-machado' AND s.slug='gilson-machado' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=guto-silva campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='guto-silva' AND s.slug='guto-silva' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=haddad-gov-sp campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='haddad-gov-sp' AND s.slug='haddad-gov-sp' AND c.profissao_declarada='Q40348';
-- @write tabela=candidatos slug=hana-ghassan campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='hana-ghassan' AND s.slug='hana-ghassan' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=hildon-chaves campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='hildon-chaves' AND s.slug='hildon-chaves' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=jeronimo campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='jeronimo' AND s.slug='jeronimo' AND c.profissao_declarada='Q937857';
-- @write tabela=candidatos slug=joao-campos campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='joao-campos' AND s.slug='joao-campos' AND c.profissao_declarada='Q212238';
-- @write tabela=candidatos slug=joel-rodrigues campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='joel-rodrigues' AND s.slug='joel-rodrigues' AND c.profissao_declarada='Q212238';
-- @write tabela=candidatos slug=jose-carlos-aleluia campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='jose-carlos-aleluia' AND s.slug='jose-carlos-aleluia' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=jose-eliton campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='jose-eliton' AND s.slug='jose-eliton' AND c.profissao_declarada='Q40348';
-- @write tabela=candidatos slug=juliana-brizola campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='juliana-brizola' AND s.slug='juliana-brizola' AND c.profissao_declarada='Q40348';
-- @write tabela=candidatos slug=laurez-moreira campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='laurez-moreira' AND s.slug='laurez-moreira' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=leandro-grass campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='leandro-grass' AND s.slug='leandro-grass' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=mailza-assis campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='mailza-assis' AND s.slug='mailza-assis' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=marconi-perillo campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='marconi-perillo' AND s.slug='marconi-perillo' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=marcos-vieira campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='marcos-vieira' AND s.slug='marcos-vieira' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=mateus-simoes campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='mateus-simoes' AND s.slug='mateus-simoes' AND c.profissao_declarada='Q37226';
-- @write tabela=candidatos slug=natasha-slhessarenko campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='natasha-slhessarenko' AND s.slug='natasha-slhessarenko' AND c.profissao_declarada='Q39631';
-- @write tabela=candidatos slug=nikolas-ferreira campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='nikolas-ferreira' AND s.slug='nikolas-ferreira' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=omar-aziz campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='omar-aziz' AND s.slug='omar-aziz' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=otaviano-pivetta campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='otaviano-pivetta' AND s.slug='otaviano-pivetta' AND c.profissao_declarada='Q43845';
-- @write tabela=candidatos slug=paula-belmonte campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='paula-belmonte' AND s.slug='paula-belmonte' AND c.profissao_declarada='Q43845';
-- @write tabela=candidatos slug=paulo-hartung campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='paulo-hartung' AND s.slug='paulo-hartung' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=paulo-martins-gov-pr campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='paulo-martins-gov-pr' AND s.slug='paulo-martins-gov-pr' AND c.profissao_declarada='Q36180';
-- @write tabela=candidatos slug=pazolini campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='pazolini' AND s.slug='pazolini' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=pedro-cunha-lima campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='pedro-cunha-lima' AND s.slug='pedro-cunha-lima' AND c.profissao_declarada='Q40348';
-- @write tabela=candidatos slug=raquel-lyra campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='raquel-lyra' AND s.slug='raquel-lyra' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=ricardo-cappelli campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='ricardo-cappelli' AND s.slug='ricardo-cappelli' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=roberto-cidade campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='roberto-cidade' AND s.slug='roberto-cidade' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=rodrigo-bacellar campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='rodrigo-bacellar' AND s.slug='rodrigo-bacellar' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=rodrigo-pacheco campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='rodrigo-pacheco' AND s.slug='rodrigo-pacheco' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=silvio-mendes campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='silvio-mendes' AND s.slug='silvio-mendes' AND c.profissao_declarada='Q937857';
-- @write tabela=candidatos slug=simao-jatene campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='simao-jatene' AND s.slug='simao-jatene' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=washington-reis campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='washington-reis' AND s.slug='washington-reis' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=wellington-fagundes campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='wellington-fagundes' AND s.slug='wellington-fagundes' AND c.profissao_declarada='Q82955';
-- @write tabela=candidatos slug=wilder-morais campos=profissao_declarada,ultima_atualizacao
UPDATE public.candidatos c
SET profissao_declarada=s.target_value, ultima_atualizacao=s.migration_em
FROM _profissao_qid_snapshot s
WHERE c.id=s.id AND c.slug='wilder-morais' AND s.slug='wilder-morais' AND c.profissao_declarada='Q82955';
DO $$ DECLARE n integer; receipts integer; BEGIN
  SELECT count(*) INTO n FROM _profissao_qid_snapshot;
  IF n=0 THEN RETURN; END IF;
  SELECT count(*) INTO n FROM _profissao_qid_snapshot s JOIN public.candidatos c ON c.id=s.id AND c.slug=s.slug AND c.profissao_declarada IS NOT DISTINCT FROM s.target_value AND c.ultima_atualizacao=s.migration_em;
  SELECT count(*) INTO receipts FROM public.coleta_log WHERE execucao='migration:20260830120000:profissao-qid-tse-2026';
  IF n<>63 OR receipts<>63 OR EXISTS(SELECT 1 FROM public.candidatos WHERE profissao_declarada ~ '^Q[0-9]+$') THEN RAISE EXCEPTION 'profissao QID pós-condição linhas=% receipts=%',n,receipts; END IF;
END $$;
COMMIT;
