-- Readback somente leitura da chave composta e do backfill preparado da issue #138.
-- Esperado apos aplicacao autorizada: 1849 Camara, as 4 materias Senado intactas,
-- e delta total de exatamente +4 linhas no candidato.

WITH alvo AS (
  SELECT '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid AS candidato_id
), protegidas AS (
  SELECT p.proposicao_id_api, p.tipo, p.numero, p.ano, p.ementa
  FROM public.projetos_lei p JOIN alvo a ON a.candidato_id = p.candidato_id
  WHERE p.fonte = 'Senado'
    AND p.proposicao_id_api IN ('123202', '123149', '123094', '121483')
), camara_alvos AS (
  SELECT p.proposicao_id_api, p.tipo, p.numero, p.ano, p.ementa, p.fonte
  FROM public.projetos_lei p JOIN alvo a ON a.candidato_id = p.candidato_id
  WHERE p.fonte = 'Camara'
    AND p.proposicao_id_api IN ('123202', '123149', '123094', '121483')
)
SELECT
  (SELECT count(*) FROM public.projetos_lei p JOIN alvo a ON a.candidato_id = p.candidato_id WHERE p.fonte = 'Camara') AS camara_total,
  (SELECT count(*) FROM public.projetos_lei p JOIN alvo a ON a.candidato_id = p.candidato_id WHERE p.fonte = 'Senado' AND p.proposicao_id_api IN ('123202', '123149', '123094', '121483')) AS senado_protegidas,
  (SELECT count(*) FROM camara_alvos) AS camara_alvos,
  (SELECT count(*) FROM protegidas) AS senado_readback,
  (SELECT count(*) FROM public.projetos_lei p JOIN alvo a ON a.candidato_id = p.candidato_id) AS total,
  (SELECT count(*) FROM public.projetos_lei p JOIN alvo a ON a.candidato_id = p.candidato_id) - 1845 AS delta_total_vs_baseline,
  (SELECT count(*) FROM camara_alvos WHERE tipo = 'EMC' AND ano = 2003 AND fonte = 'Camara') AS camara_emc_2003;
