-- ROLLBACK CIRURGICO de 20260811101200_processos_legados_fontes_oficiais.sql
-- Executar somente com autorizacao nominal e dentro de transacao externa unica.
-- Falha fechado se qualquer uma das cinco linhas atualizadas, o bloqueio
-- editorial ou o ledger tiverem recebido curadoria posterior.

CREATE TEMP TABLE _pf_processos_legados_rollback (
  id uuid PRIMARY KEY,
  slug text NOT NULL,
  acao text NOT NULL,
  tipo_anterior text NOT NULL,
  tribunal_anterior text,
  numero_anterior text,
  descricao_anterior text,
  status_anterior text,
  data_inicio_anterior date,
  data_decisao_anterior date,
  gravidade_anterior text,
  fonte_anterior text,
  url_anterior text,
  tipo_novo text,
  tribunal_novo text,
  numero_novo text,
  descricao_nova text,
  status_novo text,
  data_inicio_nova date,
  data_decisao_nova date,
  gravidade_nova text,
  fonte_nova text,
  url_nova text
) ON COMMIT DROP;

INSERT INTO _pf_processos_legados_rollback VALUES
  ('9b4b48fa-3b1b-48fb-a195-b6e4139c7a9d','flavio-bolsonaro','atualizar','criminal','TJ-RJ',NULL,'Investigado por peculato, lavagem de dinheiro e organizacao criminosa no caso das rachadinhas no gabinete da ALERJ.','em andamento',DATE '2019-01-01',NULL,'critica','MP-RJ',NULL,'criminal','STF','HC 201965','No HC 201965, a 2ª Turma do STF anulou quatro dos cinco relatórios de inteligência financeira que embasaram a denúncia no caso das chamadas rachadinhas. A decisão trata da legalidade dessas provas e não autoriza inferir o estado atual de outras apurações.','anulado_parcialmente',NULL,DATE '2021-11-30',NULL,'STF','https://portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=477496&ori=1'),
  ('18050e24-bd22-43b1-88ac-d3710bcedaf3','tarcisio-gov-sp','atualizar','criminal','Justica Federal',NULL,'Contratos assinados como diretor do DNIT sob investigacao da PF por suspeita de corrupcao','em_andamento',NULL,NULL,'media',NULL,NULL,'procedural','TCU','TC 008.761/2020-5','O Acórdão 1089/2025-TCU-Plenário reproduz trecho de relatório da Polícia Federal que cita Tarcísio Gomes de Freitas, então diretor do DNIT. O acórdão não o lista entre os responsáveis e esta ficha não infere imputação ou situação processual contra ele.','comunicacao_processual_publicada_merito_nao_inferido',NULL,DATE '2025-05-14',NULL,'TCU - Acórdão 1089/2025-Plenário','https://pesquisa.apps.tcu.gov.br/doc/acordao-completo/1089/2025/Plen%C3%A1rio'),
  ('a964addf-bab0-40cc-88c0-9dd859869fe1','haddad-gov-sp','atualizar','eleitoral','TRE-SP',NULL,'Condenado em 1a instancia por caixa dois na campanha de 2012 (R$ 2,6 mi da UTC Engenharia). Absolvido pelo TRE-SP','absolvido',NULL,NULL,'alta',NULL,NULL,'eleitoral','TRE-SP','0000017-45.2016.6.26.0001','O TRE-SP absolveu Fernando Haddad, por ausência de provas, da condenação em primeira instância por falsidade ideológica eleitoral relacionada a despesas declaradas na campanha de 2012; o julgamento também declarou a nulidade parcial da sentença quanto a crimes não descritos na denúncia.','absolvido',NULL,DATE '2021-07-27',NULL,'TRE-SP','https://www.tre-sp.jus.br/comunicacao/noticias/2021/Julho/tre-absolve-fernando-haddad-por-ausencia-de-provas-de-falsidade-ideologica-eleitoral'),
  ('233d3564-008e-44a4-8f4a-93de8e8fe9ae','haddad-gov-sp','atualizar','eleitoral','TSE',NULL,'Multa de R$ 10 mil por propaganda irregular nas eleicoes de 2022','condenado',NULL,NULL,'baixa',NULL,NULL,'eleitoral','TSE','0607928-52.2022.6.26.0000','O TSE manteve multa de R$ 10 mil a Fernando Haddad por propaganda eleitoral irregular em 2022, decorrente do uso do nome de adversário em impulsionamento pago na internet.','condenado',NULL,DATE '2024-02-29','baixa','TSE','https://www.tse.jus.br/comunicacao/radio/2024/Fevereiro/direto-do-plenario-tse-mantem-multa-a-fernando-haddad-por-propaganda-irregular-em-2022'),
  ('e2252a89-90f1-4700-a473-b63522443215','felicio-ramuth','atualizar','improbidade','MP-SP',NULL,'Acusado de improbidade administrativa e irregularidades em licitacoes durante gestao em Sao Jose dos Campos','em_andamento',NULL,NULL,'media',NULL,NULL,'procedural','MPSP','43.0719.0000337/2020-0','O Diário Oficial do MPSP listou o procedimento 43.0719.0000337/2020-0, com Amélia Naomi Omura e Felício Ramuth como interessados, sob o tema improbidade administrativa e o assunto agente público. A publicação não informa desfecho e não autoriza inferir acusação ou responsabilidade.','comunicacao_processual_publicada_merito_nao_inferido',NULL,NULL,NULL,'MPSP','https://www.mpsp.mp.br/w/di%C3%A1rio-oficial-mpsp-12/09/2020'),
  ('75292421-804d-435c-8982-34054dd49bcf','felicio-ramuth','despublicar','criminal','Justica de Andorra',NULL,'Investigado pela Justica de Andorra por lavagem de dinheiro, movimentacao de US$ 1,6 milhao em conta no AndBank (2009-2011). Justica bloqueou US$ 1,4 milhao','em_andamento',NULL,NULL,'alta',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);

DO $$
DECLARE
  ledger_rows integer;
  linhas_novas integer;
  andorra_ausente integer;
  bloqueios integer;
BEGIN
  SELECT count(*) INTO ledger_rows
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260811101200';

  SELECT count(*) INTO linhas_novas
  FROM _pf_processos_legados_rollback e
  JOIN public.processos p ON p.id = e.id
  WHERE e.acao = 'atualizar'
    AND (p.tipo,p.tribunal,p.numero_processo,p.descricao,p.status,p.data_inicio,
         p.data_decisao,p.gravidade,p.fonte,p.url_fonte)
        IS NOT DISTINCT FROM
        (e.tipo_novo,e.tribunal_novo,e.numero_novo,e.descricao_nova,e.status_novo,
         e.data_inicio_nova,e.data_decisao_nova,e.gravidade_nova,e.fonte_nova,e.url_nova);

  SELECT count(*) INTO andorra_ausente
  FROM _pf_processos_legados_rollback e
  LEFT JOIN public.processos p ON p.id = e.id
  WHERE e.acao = 'despublicar' AND p.id IS NULL;

  SELECT count(*) INTO bloqueios
  FROM public.coleta_log l
  JOIN public.candidatos c ON c.id=l.candidato_id
  WHERE l.execucao = 'migration:20260811101200'
    AND l.fonte = 'processos-curadoria'
    AND l.escopo = 'candidato'
    AND l.alvo = 'felicio-ramuth'
    AND l.natureza = 'coleta'
    AND c.slug = 'felicio-ramuth'
    AND l.resultado = 'indeterminado'
    AND l.volume = 0
    AND l.url IS NULL
    AND l.executado_em = '2026-08-11 00:00:00-03'::timestamptz
    AND l.detalhe = 'Bloqueio editorial: a alegação legada de investigação na Justiça de Andorra foi despublicada. As buscas em fontes oficiais não localizaram ato nominal que sustente número, partes, mérito ou situação processual; não converter em ausência judicial.'
    AND (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260811101200') = 1;

  IF ledger_rows <> 1 OR linhas_novas <> 5 OR andorra_ausente <> 1 OR bloqueios <> 1 THEN
    RAISE EXCEPTION 'rollback recusado: ledger %, novas %, Andorra ausente %, bloqueios %',
      ledger_rows, linhas_novas, andorra_ausente, bloqueios;
  END IF;
END $$;

UPDATE public.processos p
SET tipo=e.tipo_anterior, tribunal=e.tribunal_anterior, numero_processo=e.numero_anterior,
    descricao=e.descricao_anterior, status=e.status_anterior,
    data_inicio=e.data_inicio_anterior, data_decisao=e.data_decisao_anterior,
    gravidade=e.gravidade_anterior, fonte=e.fonte_anterior, url_fonte=e.url_anterior
FROM _pf_processos_legados_rollback e
WHERE p.id=e.id AND e.acao='atualizar';

INSERT INTO public.processos
  (id,candidato_id,tipo,tribunal,numero_processo,descricao,status,data_inicio,
   data_decisao,gravidade,fonte,url_fonte)
SELECT e.id,c.id,e.tipo_anterior,e.tribunal_anterior,e.numero_anterior,
       e.descricao_anterior,e.status_anterior,e.data_inicio_anterior,
       e.data_decisao_anterior,e.gravidade_anterior,e.fonte_anterior,e.url_anterior
FROM _pf_processos_legados_rollback e
JOIN public.candidatos c ON c.slug=e.slug
WHERE e.acao='despublicar';

DELETE FROM public.coleta_log
WHERE execucao='migration:20260811101200';

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n
  FROM _pf_processos_legados_rollback e
  JOIN public.candidatos c ON c.slug=e.slug
  JOIN public.processos p ON p.id=e.id AND p.candidato_id=c.id
  WHERE (p.tipo,p.tribunal,p.numero_processo,p.descricao,p.status,p.data_inicio,
         p.data_decisao,p.gravidade,p.fonte,p.url_fonte)
        IS NOT DISTINCT FROM
        (e.tipo_anterior,e.tribunal_anterior,e.numero_anterior,e.descricao_anterior,
         e.status_anterior,e.data_inicio_anterior,e.data_decisao_anterior,
         e.gravidade_anterior,e.fonte_anterior,e.url_anterior);
  IF n <> 6 THEN
    RAISE EXCEPTION 'rollback processos legados: esperadas 6 linhas restauradas, encontradas %', n;
  END IF;
END $$;

DELETE FROM supabase_migrations.schema_migrations
WHERE version='20260811101200';
