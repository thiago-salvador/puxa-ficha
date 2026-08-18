-- =====================================================================
-- Etapa 4 da auditoria de integridade: re-auditoria de links do conjunto
-- final publicado (docs/auditoria-integridade-2026-07-24.md, achado V1).
--
-- O QUE ESTA MIGRATION CORRIGE
-- Depois de simular o efeito das migrations 20260725120000 a 20260725170000,
-- o conjunto de fontes que continuaria PUBLICADO tem 64 URLs distintas.
-- Reteste com curl e User-Agent de Chrome 126 no macOS, em 2026-07-25:
--   61 responderam HTTP 200
--    1 respondeu HTTP 404
--    2 nao responderam (codigo 000, sem resposta do servidor)
-- Esta migration trata essas 3 URLs, para que o conjunto final publicado
-- fique com zero URL que nao responde 200.
--
-- Comando exato usado no reteste (por URL):
--   curl -s -o /dev/null -w "%{http_code}" \
--     -A "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
--         (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" \
--     -L --max-time 45 <url>
--
-- ---------------------------------------------------------------------
-- BLOCO 1: HTTP 404 por placeholder de template nao resolvido (2 pontos)
--
-- A URL publicada e literalmente
--   https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_{ano}.zip
-- com o token "{ano}" nao substituido. E o mesmo bug de ingestao ja
-- identificado na etapa 1B para eduardo-braide (feb712e3), que saiu do ar na
-- migration 20260725120000. Estes dois escaparam daquela varredura porque a
-- regra de la era "URL aponta para o dominio nu", e esta URL tem caminho.
--
-- Reteste em 2026-07-25: HTTP 404.
-- Nao existe "a URL certa" para colocar no lugar: o pacote consulta_cand do
-- TSE e por ano, e a claim agrega varios anos numa frase so (mesmo achado
-- estrutural da etapa 1B). Entao a claim sai do ar por falta de lastro, nao
-- por suspeita de falsidade, e volta assim que a fonte por ano for anexada.
--
-- SELECT DE VALIDACAO EXECUTADO ANTES DE ESCREVER ESTE ARQUIVO
-- (producao, somente leitura, 2026-07-25)
--
--   select pa.id, c.slug, pa.gravidade, pa.gerado_por, pa.verificado,
--          pa.visivel, pa.titulo, pa.fontes::text
--   from public.pontos_atencao pa
--   join public.candidatos c on c.id = pa.candidato_id
--   where pa.id in ('c42f394c-49ea-4e93-b21d-dbf0186512f1',
--                   'df1ea0bc-afc2-407f-8db0-c031841d438e');
--
-- Resultado observado, os dois com visivel = true, verificado = true,
-- gerado_por = 'curadoria', gravidade = 'baixa':
--   c42f394c | enilton-rodrigues | "Sem historico de mandato eletivo registrado"
--            | fontes = [{url: ".../consulta_cand_{ano}.zip",
--                         titulo: "TSE Dados Abertos - consulta_cand 2016/2018/2020/2022/2024"}]
--   df1ea0bc | orleans-brandao   | "Carreira politica: 2 mandato(s) registrado(s)"
--            | fontes = [{url: ".../consulta_cand_{ano}.zip", ...},
--                        {url: "https://app.stc.ma.gov.br/legisla/", ...}]
--   (a segunda fonte de df1ea0bc responde 200, mas e o indice do portal, nao
--    o registro que sustentaria os 2 mandatos afirmados)
-- ---------------------------------------------------------------------

BEGIN;

UPDATE public.pontos_atencao
SET visivel = false,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'despublicacao_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 4 (re-auditoria de links)',
        'motivo', 'fonte unica com caminho retorna HTTP 404: a URL publicada carrega o placeholder de template {ano} nao resolvido, mesmo bug de ingestao tratado na etapa 1B para eduardo-braide',
        'fonte_morta', 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_{ano}.zip',
        'http_status_reteste', '404',
        'data_reteste', '2026-07-25',
        'reversivel', true
      )
    )
WHERE id IN (
  'c42f394c-49ea-4e93-b21d-dbf0186512f1', -- enilton-rodrigues
  'df1ea0bc-afc2-407f-8db0-c031841d438e'  -- orleans-brandao
)
  AND fontes::text LIKE '%consulta_cand_{ano}.zip%'
  AND visivel IS DISTINCT FROM false;

-- ---------------------------------------------------------------------
-- BLOCO 2: duas URLs oficiais do TRF3 que nao respondem (1 ponto)
--
-- O ponto 08108b52 (aecio-neves, gravidade baixa, "Absolvido no caso J&F;
-- decisao mantida pelo TRF3") cita tres fontes. A primeira
-- (portal.stf.jus.br, Inquerito 4506) responde 200 e fica como esta. As
-- outras duas sao do dominio web.trf3.jus.br e nao responderam.
--
-- IMPORTANTE, PARA NAO CONFUNDIR COM O ACHADO V1: estas duas URLs sao REAIS,
-- nao sao citacao fabricada. Os motores de busca as devolvem com o titulo
-- exato que esta gravado no banco. O que falhou foi a conexao:
--   - curl (HTTP/2 e HTTP/1.1, IPv6 e IPv4 forcado): codigo 000, exit 92
--   - urllib do Python (stack TLS diferente): TimeoutError na leitura
--   - o dominio inteiro nao responde, inclusive https://www.trf3.jus.br/
--   - a auditoria de 2026-07-24 ja havia registrado o mesmo comportamento e
--     classificado como "sem conexao (nao confundir com 404)"
-- Ou seja, dois dias seguidos e dois clientes HTTP independentes. Nao da
-- para afirmar que a pagina existe hoje, e a regra deste fluxo e que fonte
-- publicada precisa responder 200 num teste real.
--
-- Solucao aplicada: as duas URLs sao trocadas por duas materias do Consultor
-- Juridico que cobrem exatamente os dois atos processuais e responderam
-- HTTP 200 em 2026-07-25. As URLs antigas ficam gravadas em
-- dados_relacionados, para restauracao imediata quando o dominio do TRF3
-- voltar a responder (a fonte primaria oficial e melhor que a imprensa e
-- deve voltar quando for verificavel).
--
-- PROVA 1 (ConJur, 10/03/2022, HTTP 200 em 2026-07-25, trecho extraido do
-- HTML da propria pagina nesta etapa):
--   "Esse foi o entendimento do juiz federal Ali Mazloum, da 7a Vara Criminal
--    de Sao Paulo, para absolver o deputado federal Aecio Neves (PSDB-MG), a
--    sua irma, Andrea Neves, Frederico Pacheco de Medeiros e Mendherson Souza
--    Lima."
--
-- PROVA 2 (ConJur, 27/07/2023, HTTP 200 em 2026-07-25, trecho extraido do
-- HTML da propria pagina nesta etapa):
--   "A 11a Turma do Tribunal Regional Federal da 3a Regiao, de forma unanime,
--    absolveu o ex-senador e ex-candidato a Presidencia, hoje deputado
--    federal, Aecio Neves (PSDB) em caso que envolve uma gravacao entregue
--    pelo empresario Joesley Batista, da J&F, ao Ministerio Publico Federal"
--
-- As duas sustentam a afirmacao publicada: absolvicao em primeira instancia
-- e manutencao pelo TRF3.
-- ---------------------------------------------------------------------

UPDATE public.pontos_atencao
SET fontes = '[{"url": "https://portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=375717", "data": "2018-04-17", "titulo": "STF recebe denúncia no Inquérito 4506"}, {"url": "https://www.conjur.com.br/2022-mar-10/juiz-absolve-aecio-andrea-neves-acusacao-corrupcao-passiva/", "data": "2022-03-10", "titulo": "Consultor Jurídico: juiz absolve Aécio e Andréa Neves da acusação de corrupção passiva"}, {"url": "https://www.conjur.com.br/2023-jul-27/aecio-neves-absolvido-trf-gravacao-joesley/", "data": "2023-07-27", "titulo": "Consultor Jurídico: Aécio Neves é absolvido no TRF-3 em caso de pedido de empréstimo"}]'::jsonb,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'troca_fonte_2026_07_25', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 4 (re-auditoria de links)',
        'motivo', 'as duas URLs oficiais do TRF3 sao reais mas o dominio web.trf3.jus.br nao respondeu em 2026-07-24 nem em 2026-07-25, em dois clientes HTTP independentes; substituidas por fontes verificaveis ate o dominio voltar',
        'urls_trf3_a_restaurar', jsonb_build_array(
          'https://web.trf3.jus.br/noticias-sjsp/Noticiar/ExibirNoticia/227-justica-federal-absolve-deputado-federal-aecio-neves',
          'https://web.trf3.jus.br/noticias/Noticiar/ExibirNoticia/425021-decima-primeira-turma-mantem-sentenca-que-absolveu'
        ),
        'http_status_reteste', '000 (sem resposta)',
        'data_reteste', '2026-07-25',
        'reversivel', true
      )
    )
WHERE id = '08108b52-b6cd-4757-a5a3-c29db172f50c'
  AND fontes::text LIKE '%web.trf3.jus.br%';

COMMIT;

-- =====================================================================
-- VERIFICACAO POS-APLICACAO (rodar manualmente depois do deploy)
--
--   -- deve retornar zero linhas: nenhuma fonte publicada com o placeholder
--   select pa.id, c.slug
--   from public.pontos_atencao pa
--   join public.candidatos c on c.id = pa.candidato_id
--   where c.publicavel and pa.visivel and pa.fontes::text like '%{ano}%';
--
--   -- deve retornar zero linhas: nenhuma fonte publicada apontando ao TRF3
--   select pa.id, c.slug
--   from public.pontos_atencao pa
--   join public.candidatos c on c.id = pa.candidato_id
--   where c.publicavel and pa.visivel and pa.fontes::text like '%web.trf3.jus.br%';
--
--   -- deve retornar 2 (os dois pontos despublicados por esta migration)
--   select count(*) from public.pontos_atencao
--   where dados_relacionados -> 'despublicacao_2026_07_25' ->> 'etapa'
--         = 'auditoria-integridade etapa 4 (re-auditoria de links)';
--
--   -- deve retornar 45 no total (14 da etapa 1A + 29 da etapa 1B + 2 desta)
--   select count(*) from public.pontos_atencao
--   where dados_relacionados ? 'despublicacao_2026_07_25';
-- =====================================================================
