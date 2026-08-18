-- READBACK SOMENTE LEITURA de 20260811101200_processos_legados_fontes_oficiais.sql
-- Esperado apos aplicacao + ledger:
-- 6|5|1|5|2|2|1|1|1|0

CREATE TEMP TABLE pf_readback_processos_legados AS
WITH expected(id,slug,acao,tipo,tribunal,numero,descricao,status,data_inicio,data_decisao,gravidade,fonte,url) AS (VALUES
  ('9b4b48fa-3b1b-48fb-a195-b6e4139c7a9d'::uuid,'flavio-bolsonaro','atualizar','criminal','STF','HC 201965','No HC 201965, a 2ª Turma do STF anulou quatro dos cinco relatórios de inteligência financeira que embasaram a denúncia no caso das chamadas rachadinhas. A decisão trata da legalidade dessas provas e não autoriza inferir o estado atual de outras apurações.','anulado_parcialmente',NULL::date,DATE '2021-11-30',NULL::text,'STF','https://portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=477496&ori=1'),
  ('18050e24-bd22-43b1-88ac-d3710bcedaf3'::uuid,'tarcisio-gov-sp','atualizar','procedural','TCU','TC 008.761/2020-5','O Acórdão 1089/2025-TCU-Plenário reproduz trecho de relatório da Polícia Federal que cita Tarcísio Gomes de Freitas, então diretor do DNIT. O acórdão não o lista entre os responsáveis e esta ficha não infere imputação ou situação processual contra ele.','comunicacao_processual_publicada_merito_nao_inferido',NULL::date,DATE '2025-05-14',NULL::text,'TCU - Acórdão 1089/2025-Plenário','https://pesquisa.apps.tcu.gov.br/doc/acordao-completo/1089/2025/Plen%C3%A1rio'),
  ('a964addf-bab0-40cc-88c0-9dd859869fe1'::uuid,'haddad-gov-sp','atualizar','eleitoral','TRE-SP','0000017-45.2016.6.26.0001','O TRE-SP absolveu Fernando Haddad, por ausência de provas, da condenação em primeira instância por falsidade ideológica eleitoral relacionada a despesas declaradas na campanha de 2012; o julgamento também declarou a nulidade parcial da sentença quanto a crimes não descritos na denúncia.','absolvido',NULL::date,DATE '2021-07-27',NULL::text,'TRE-SP','https://www.tre-sp.jus.br/comunicacao/noticias/2021/Julho/tre-absolve-fernando-haddad-por-ausencia-de-provas-de-falsidade-ideologica-eleitoral'),
  ('233d3564-008e-44a4-8f4a-93de8e8fe9ae'::uuid,'haddad-gov-sp','atualizar','eleitoral','TSE','0607928-52.2022.6.26.0000','O TSE manteve multa de R$ 10 mil a Fernando Haddad por propaganda eleitoral irregular em 2022, decorrente do uso do nome de adversário em impulsionamento pago na internet.','condenado',NULL::date,DATE '2024-02-29','baixa','TSE','https://www.tse.jus.br/comunicacao/radio/2024/Fevereiro/direto-do-plenario-tse-mantem-multa-a-fernando-haddad-por-propaganda-irregular-em-2022'),
  ('e2252a89-90f1-4700-a473-b63522443215'::uuid,'felicio-ramuth','atualizar','procedural','MPSP','43.0719.0000337/2020-0','O Diário Oficial do MPSP listou o procedimento 43.0719.0000337/2020-0, com Amélia Naomi Omura e Felício Ramuth como interessados, sob o tema improbidade administrativa e o assunto agente público. A publicação não informa desfecho e não autoriza inferir acusação ou responsabilidade.','comunicacao_processual_publicada_merito_nao_inferido',NULL::date,NULL::date,NULL::text,'MPSP','https://www.mpsp.mp.br/w/di%C3%A1rio-oficial-mpsp-12/09/2020'),
  ('75292421-804d-435c-8982-34054dd49bcf'::uuid,'felicio-ramuth','despublicar',NULL,NULL,NULL,NULL,NULL,NULL::date,NULL::date,NULL,NULL,NULL)
),
actual AS (
  SELECT e.*,p.candidato_id,p.tipo AS tipo_atual,p.tribunal AS tribunal_atual,
         p.numero_processo AS numero_atual,p.descricao AS descricao_atual,
         p.status AS status_atual,p.data_inicio AS data_inicio_atual,
         p.data_decisao AS data_decisao_atual,p.gravidade AS gravidade_atual,
         p.fonte AS fonte_atual,p.url_fonte AS url_atual,c.slug AS slug_atual
  FROM expected e
  LEFT JOIN public.processos p ON p.id=e.id
  LEFT JOIN public.candidatos c ON c.id=p.candidato_id
),
metricas AS (
  SELECT
    6::bigint AS linhas_legadas,
    count(*) FILTER (WHERE acao='atualizar' AND
      (slug_atual,tipo_atual,tribunal_atual,numero_atual,descricao_atual,status_atual,
       data_inicio_atual,data_decisao_atual,gravidade_atual,fonte_atual,url_atual)
      IS NOT DISTINCT FROM
      (slug,tipo,tribunal,numero,descricao,status,data_inicio,data_decisao,gravidade,fonte,url)) AS linhas_atualizadas,
    count(*) FILTER (WHERE acao='despublicar' AND candidato_id IS NULL) AS linhas_despublicadas,
    count(*) FILTER (WHERE acao='atualizar' AND url_atual ~ '^https://' AND fonte_atual IS NOT NULL) AS fontes_oficiais,
    count(*) FILTER (WHERE status_atual='comunicacao_processual_publicada_merito_nao_inferido') AS neutras_sem_merito,
    count(*) FILTER (WHERE status_atual IN ('anulado_parcialmente','absolvido')) AS terminal_com_resultado,
    count(*) FILTER (WHERE status_atual='condenado' AND numero_atual='0607928-52.2022.6.26.0000') AS condenacao_eleitoral,
    (SELECT count(*) FROM public.coleta_log l JOIN public.candidatos c ON c.id=l.candidato_id
      WHERE l.execucao='migration:20260811101200' AND c.slug='felicio-ramuth'
        AND l.fonte='processos-curadoria' AND l.resultado='indeterminado'
        AND l.volume=0 AND l.url IS NULL
        AND l.escopo='candidato' AND l.alvo='felicio-ramuth'
        AND l.natureza='coleta'
        AND l.executado_em='2026-08-11 00:00:00-03'::timestamptz
        AND l.detalhe='Bloqueio editorial: a alegação legada de investigação na Justiça de Andorra foi despublicada. As buscas em fontes oficiais não localizaram ato nominal que sustente número, partes, mérito ou situação processual; não converter em ausência judicial.') AS bloqueios_explicitos,
    (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260811101200') AS bloqueios_total,
    (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20260811101200') AS ledger,
    count(*) FILTER (WHERE
      (acao='atualizar' AND (slug_atual,tipo_atual,tribunal_atual,numero_atual,descricao_atual,status_atual,data_inicio_atual,data_decisao_atual,gravidade_atual,fonte_atual,url_atual)
        IS DISTINCT FROM (slug,tipo,tribunal,numero,descricao,status,data_inicio,data_decisao,gravidade,fonte,url))
      OR (acao='despublicar' AND candidato_id IS NOT NULL)) AS divergencias
  FROM actual
)
SELECT linhas_legadas,linhas_atualizadas,linhas_despublicadas,fontes_oficiais,
       neutras_sem_merito,terminal_com_resultado,condenacao_eleitoral,
       bloqueios_explicitos,bloqueios_total,ledger,divergencias
FROM metricas;

DO $readback$
DECLARE r pf_readback_processos_legados%ROWTYPE;
BEGIN
  SELECT * INTO STRICT r FROM pf_readback_processos_legados;
  IF r.linhas_legadas <> 6 OR r.linhas_atualizadas <> 5
     OR r.linhas_despublicadas <> 1 OR r.fontes_oficiais <> 5
     OR r.neutras_sem_merito <> 2 OR r.terminal_com_resultado <> 2
     OR r.condenacao_eleitoral <> 1 OR r.bloqueios_explicitos <> 1 OR r.bloqueios_total <> 1
     OR r.ledger <> 1 OR r.divergencias <> 0 THEN
    RAISE EXCEPTION 'readback 20260811101200: %', row_to_json(r);
  END IF;
END
$readback$;

TABLE pf_readback_processos_legados;

-- Inspecao nominal: cinco linhas publicadas e a alegacao despublicada.
SELECT e.slug,e.acao,p.numero_processo,p.status,p.fonte,p.url_fonte
FROM (VALUES
  ('9b4b48fa-3b1b-48fb-a195-b6e4139c7a9d'::uuid,'flavio-bolsonaro','atualizar'),
  ('18050e24-bd22-43b1-88ac-d3710bcedaf3'::uuid,'tarcisio-gov-sp','atualizar'),
  ('a964addf-bab0-40cc-88c0-9dd859869fe1'::uuid,'haddad-gov-sp','atualizar'),
  ('233d3564-008e-44a4-8f4a-93de8e8fe9ae'::uuid,'haddad-gov-sp','atualizar'),
  ('e2252a89-90f1-4700-a473-b63522443215'::uuid,'felicio-ramuth','atualizar'),
  ('75292421-804d-435c-8982-34054dd49bcf'::uuid,'felicio-ramuth','despublicar')
) e(id,slug,acao)
LEFT JOIN public.processos p ON p.id=e.id
ORDER BY e.slug,e.id;
