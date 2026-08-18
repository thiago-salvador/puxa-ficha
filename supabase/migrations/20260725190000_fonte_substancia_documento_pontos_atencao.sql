-- =====================================================================
-- Etapa 5B da auditoria de integridade: "responde 200" deixa de ser prova
-- (docs/auditoria-integridade-2026-07-24.md, achados V1 e A2).
--
-- O QUE ESTA MIGRATION CORRIGE
--
-- O gate de 20260725160000 e o link-check da etapa 2B tratam HTTP 200 como
-- sinal de saude. Nao basta. Medicao com curl em 2026-07-25 (User-Agent de
-- Chrome 126 no macOS, -L --max-time 45), contando caracteres de texto depois
-- de remover script, style, comentario e tags:
--
--   https://divulgacandcontas.tse.jus.br/divulga/            200,   46 chars
--   https://www.tse.jus.br/eleicoes/estatisticas/estatisticas-eleitorais
--                                                            200,  217 chars
--                                                            (desafio anti-robo
--                                                             do F5, "Support ID")
--   https://noticias.stf.jus.br/postsnoticias/stf-recebe-denuncia-contra-sergio-moro-pelo-crime-de-calunia/
--                                                            200, 2404 chars
--
-- A primeira e a casca do SPA do TSE: responde 200, passa no regex de caminho,
-- passa no gate de gravidade e nao prova nada sobre o patrimonio de ninguem.
-- Ela sustentava sozinha uma claim de gravidade ALTA sobre pessoa nomeada.
--
-- DUAS FRENTES NESTA MIGRATION
--
--   Bloco 1 e 2: dado. As duas claims publicadas cuja unica fonte nao
--                entregava conteudo ganham fonte que entrega, com trecho
--                literal colado no comentario.
--   Bloco 3:     nota sobre a terceira claim da lista, que NAO precisa de
--                mudanca, e por que.
--   Bloco 4:     gate. "Ter caminho" deixa de ser suficiente: a URL precisa
--                apontar para um documento, e nao para a raiz de um portal.
--
-- ORDEM IMPORTA: o dado e corrigido ANTES do DDL. Se o gate endurecesse
-- primeiro, o UPDATE do bloco 1 encontraria a linha ja nao conforme.
--
-- REVERSIBILIDADE
-- Nada e apagado. As fontes antigas ficam gravadas em dados_relacionados. As
-- funcoes anteriores voltam com um CREATE OR REPLACE trocando
-- fonte_url_aponta_para_documento por fonte_url_tem_caminho.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- BLOCO 1: ronaldo-caiado, "Patrimonio triplicou entre 2018 e 2022"
--          46bf8060-8978-4509-a954-ce343d2f3d1c, gravidade alta,
--          visivel = true, verificado = true, gerado_por = 'ia'
--
-- FONTE ANTIGA
--   https://divulgacandcontas.tse.jus.br/divulga/  (raiz do SPA, 46 chars)
--
-- A AFIRMACAO E VERDADEIRA. Tres verificacoes independentes em 2026-07-25:
--
--   (a) Banco proprio (SELECT em public.patrimonio, somente leitura):
--       ano_eleicao 2018 -> valor_total 8107330.58  (45 bens)
--       ano_eleicao 2022 -> valor_total 24874436.19 (53 bens)
--       Razao 3,068. Crescimento 206,8%. "Triplicou" e "206%" conferem.
--
--   (b) Fonte primaria do TSE, consulta especifica do candidato por ano,
--       recuperada com curl (nao e a raiz do portal, e a consulta):
--         .../buscar/2018/GO/2022802018/candidato/90000613470
--           HTTP 200, JSON com "totalDeBens": 8107330.58, 45 itens em "bens"
--         .../buscar/2022/GO/2040602022/candidato/90001646326
--           HTTP 200, JSON com "totalDeBens": 24874436.19, 53 itens em "bens"
--       Trecho literal do JSON de 2022:
--         "nomeCompleto":"RONALDO RAMOS CAIADO", ... "totalDeBens":24874436.19
--       Trecho literal do JSON de 2018:
--         "nomeCompleto":"RONALDO RAMOS CAIADO", ... "totalDeBens":8107330.58
--
--   (c) Os sq_candidato vieram do proprio TSE, nao foram adivinhados:
--       consulta_cand_2022_GO.csv (pacote oficial) traz
--       SQ_CANDIDATO = 90001646326 para RONALDO RAMOS CAIADO, cargo
--       GOVERNADOR, CD_ELEICAO 546; e o campo "eleicoesAnteriores" do JSON de
--       2022 traz o id 90000613470 com idEleicao 2022802018 para 2018.
--
-- Conferi tambem que ronaldo-caiado NAO esta entre as 16 linhas de patrimonio
-- corrigidas por 20260725143000_patrimonio_bem_candidato_duplicado.sql, entao
-- os dois valores nao vem do bug do fator 2,0000.
--
-- Por que a URL e a do endpoint REST e nao o link bonito do portal: o link
-- humano (https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2022/...)
-- e rota de SPA em hash e devolve a MESMA casca de 46 caracteres. Ele nao
-- sustenta nada para quem confere, e o gate do bloco 4 o recusaria. O
-- endpoint REST e do mesmo dominio oficial, e publico, e devolve o numero.
-- ---------------------------------------------------------------------

UPDATE public.pontos_atencao
SET fontes = '[{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2018/GO/2022802018/candidato/90000613470","data":"2018-08-15","titulo":"TSE DivulgaCandContas: declaração de bens de Ronaldo Caiado na eleição de 2018 (total R$ 8.107.330,58)"},{"url":"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2022/GO/2040602022/candidato/90001646326","data":"2022-08-15","titulo":"TSE DivulgaCandContas: declaração de bens de Ronaldo Caiado na eleição de 2022 (total R$ 24.874.436,19)"}]'::jsonb,
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'troca_fonte_2026_07_25_etapa5b', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 5B (qualidade de fonte)',
        'motivo', 'a fonte anterior respondia HTTP 200 com 46 caracteres: era a raiz do SPA do DivulgaCandContas, nao a consulta do candidato',
        'fonte_antiga', 'https://divulgacandcontas.tse.jus.br/divulga/',
        'fonte_antiga_http', '200',
        'fonte_antiga_caracteres_de_texto', 46,
        'valores_conferidos', jsonb_build_object(
          'patrimonio_2018', '8107330.58',
          'patrimonio_2022', '24874436.19',
          'crescimento_percentual', '206.8'
        ),
        'data_verificacao', '2026-07-25'
      )
    )
WHERE id = '46bf8060-8978-4509-a954-ce343d2f3d1c'
  AND fontes::text LIKE '%divulgacandcontas.tse.jus.br/divulga/"%';

-- ---------------------------------------------------------------------
-- BLOCO 2: flavio-bolsonaro, "Senador mais votado do Rio de Janeiro em 2018"
--          1a27db63-832b-456d-87cf-5e6b1095a0b2, gravidade baixa,
--          visivel = true, verificado = true, gerado_por = 'ia'
--
-- FONTE ANTIGA
--   https://www.tse.jus.br/eleicoes/estatisticas/estatisticas-eleitorais
--   Pagina de indice de estatisticas, sem resultado de eleicao nenhuma. Em
--   2026-07-25 respondeu HTTP 200 com 217 caracteres, e o que veio foi o
--   desafio anti-robo do F5 ("Esta pergunta e para testar se voce e um
--   visitante humano ... Seu Support ID: 13552133409858234177").
--
-- FONTE NOVA (Senado Federal, agencia oficial, HTTP 200 com 4651 caracteres
-- de texto em 2026-07-25). Trecho literal extraido do HTML nesta sessao:
--   "Da Redacao | 07/10/2018, 22h35 Com mais de 4 milhoes de votos, Flavio
--    Bolsonaro (PSL) foi o mais votado na disputa por uma vaga ao Senado pelo
--    Rio de Janeiro. O filho de Jair Bolsonaro (candidato que vai disputar o
--    segundo turno para a Presidencia da Republica) obteve 31,3% dos votos
--    validos (4,37 milhoes)."
--
-- TEXTO DA CLAIM TAMBEM MUDA, E ESTE E O PONTO DELICADO
--
-- A descricao publicada dizia: "Eleito senador pelo RJ em 2018 com 4,3 milhoes
-- de votos, a maior votacao para Senado na historia do estado."
--
-- A primeira metade e sustentada pela fonte. A segunda NAO. Procurei fonte
-- para o superlativo historico e nao achei nenhuma: nem a materia do Senado,
-- nem a da Agencia Brasil sobre a mesma eleicao
-- (https://agenciabrasil.ebc.com.br/politica/noticia/2018-10/flavio-bolsonaro-e-arolde-de-oliveira-sao-eleitos-para-senado-pelo-rj,
-- HTTP 200, 3599 caracteres) afirmam recorde estadual. Provar ou refutar o
-- superlativo exigiria agregar a votacao nominal de todas as eleicoes para o
-- Senado no RJ (os pacotes votacao_candidato_munzona do TSE somam 132 MB em
-- 2010 e 395 MB em 2018, e ainda assim nao cobririam "a historia do estado").
--
-- Entao a frase nao fica no ar. Ela e substituida pelo que a fonte sustenta,
-- em vez de a claim inteira ser despublicada: o fato central (mais votado do
-- RJ em 2018) e verdadeiro e verificavel. O texto removido fica gravado em
-- dados_relacionados para auditoria.
-- ---------------------------------------------------------------------

UPDATE public.pontos_atencao
SET fontes = '[{"url":"https://www12.senado.leg.br/noticias/materias/2018/10/07/flavio-bolsonaro-e-arolde-de-oliveira-sao-eleitos-pelo-rio-de-janeiro","data":"2018-10-07","titulo":"Senado Notícias: Flávio Bolsonaro e Arolde de Oliveira são eleitos pelo Rio de Janeiro"}]'::jsonb,
    descricao = 'Eleito senador pelo RJ em 2018 como o mais votado na disputa por uma vaga ao Senado no estado, com 31,3% dos votos válidos (4,37 milhões).',
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'correcao_2026_07_25_etapa5b', jsonb_build_object(
        'etapa', 'auditoria-integridade etapa 5B (qualidade de fonte)',
        'motivo_fonte', 'a fonte anterior era pagina de indice do TSE e respondeu 200 com 217 caracteres de desafio anti-robo, sem resultado de eleicao nenhuma',
        'fonte_antiga', 'https://www.tse.jus.br/eleicoes/estatisticas/estatisticas-eleitorais',
        'motivo_texto', 'a descricao afirmava "a maior votacao para Senado na historia do estado"; nenhuma fonte acessivel sustenta esse superlativo, entao ele saiu e ficou so o que a fonte prova',
        'descricao_anterior', 'Eleito senador pelo RJ em 2018 com 4,3 milhões de votos, a maior votação para Senado na história do estado.',
        'data_verificacao', '2026-07-25'
      )
    )
WHERE id = '1a27db63-832b-456d-87cf-5e6b1095a0b2'
  AND fontes::text LIKE '%tse.jus.br/eleicoes/estatisticas/estatisticas-eleitorais%';

-- ---------------------------------------------------------------------
-- BLOCO 3: sergio-moro-gov-pr, "Reu no STF por suposta calunia contra Gilmar
--          Mendes" (08e60ce4-5d4b-444c-9a28-fdcc1444c29e).
--
-- NENHUM UPDATE. A conclusao anterior de que esta claim estava sem fonte
-- recuperavel ("0 caracteres, pagina renderizada por JS") estava ERRADA, e o
-- erro era do robo, nao da fonte.
--
-- Medicao em 2026-07-25:
--   1a requisicao ao dominio depois de um intervalo de folga:
--     HTTP 200, 2404 caracteres de texto, materia inteira.
--   requisicoes seguintes na mesma janela, inclusive espacadas em 20s:
--     HTTP 202 com corpo VAZIO (0 bytes), seis URLs em seis.
--
-- Ou seja, noticias.stf.jus.br tem limitador de taxa que responde 202 com
-- corpo vazio. Nao e renderizacao por JavaScript: o HTML servido ja contem o
-- texto. Trecho literal, extraido do HTML nesta sessao, que sustenta a claim
-- palavra por palavra:
--
--   "STF recebe denuncia contra Sergio Moro pelo crime de calunia ...
--    04/06/2024 17:24 ... A Primeira Turma do Supremo Tribunal Federal (STF)
--    recebeu, nesta terca-feira (4), denuncia contra o senador Sergio Moro
--    (UB/PR) pelo crime de calunia contra o ministro Gilmar Mendes. Para o
--    colegiado, a denuncia do Ministerio Publico Federal (MPF) tem elementos
--    suficientes para a abertura de acao penal."
--
-- A claim publicada diz exatamente isso, inclusive a ressalva de que
-- recebimento de denuncia nao equivale a condenacao. Fonte correta, data
-- correta, texto correto. Nada a fazer no dado.
--
-- O QUE FOI FEITO NO CODIGO, JA QUE O DEFEITO ERA DO VERIFICADOR:
--   1. scripts/link-check-pontos-atencao.ts passa a espacar requisicoes por
--      host e a repetir uma vez quando o corpo vem vazio;
--   2. corpo vazio com 2xx passa a ser classificado "indisponivel", nunca
--      "morta" nem "viva";
--   3. noticias.stf.jus.br entra em DOMINIOS_VERIFICACAO_MANUAL
--      (src/lib/fonte-substancia.ts): claim com fonte nesse dominio nunca e
--      despublicada por decisao automatica, so por revisao humana.
--
-- As outras 5 URLs de noticias.stf.jus.br no acervo estao na mesma situacao e
-- ficam cobertas pela mesma regra:
--   .../1a-turma-extingue-punibilidade-de-cabo-daciolo-por-participacao-em-greve-de-policiais-na-bahia/
--   .../primeira-turma-do-stf-arquiva-habeas-corpus-em-favor-de-tony-garcia/
--   .../decisao-do-ministro-barroso-mantem-inelegibilidade-de-pre-candidato-ao-governo-de-sergipe/
--   .../deputado-eder-mauro-psd-pa-e-condenado-por-difamacao-contra-ex-deputado-jean-wyllys/
--   .../stf-suspende-inquerito-contra-ex-governador-marconi-perillo/
--
-- Rota alternativa testada e NAO adotada: o portal antigo
-- (portal.stf.jus.br/noticias/verNoticiaDetalhe.asp?idConteudo=N) responde
-- 200 e serve parte do acervo (idConteudo=375717 devolveu 8175 caracteres),
-- mas idConteudo=506596, que a propria materia do Moro linka, devolveu 1376
-- caracteres so de navegacao, sem corpo. Cobertura parcial nao substitui a
-- fonte canonica, entao o portal antigo fica registrado como recurso de
-- conferencia manual e nao como fonte publicada.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- BLOCO 4: gate. Ter caminho deixa de bastar.
--
-- Regra nova, de FORMA e sem rede: um caminho de um unico segmento, so
-- letras, de 2 a 20 caracteres, com ou sem barra final, e raiz de portal e
-- nao documento. Fragmento e query sao descartados antes de avaliar, porque
-- rota de SPA em hash (/divulga/#/candidato/2022/...) e servida pela mesma
-- casca vazia da raiz.
--
-- CENSO RODADO CONTRA PRODUCAO ANTES DE ESCREVER (somente leitura, 2026-07-25)
--
--   Todas as URLs de pontos_atencao.fontes que casam com a regra nova: 3.
--     46bf8060  ronaldo-caiado    alta     publicavel=true   https://divulgacandcontas.tse.jus.br/divulga/
--     df1ea0bc  orleans-brandao   baixa    publicavel=true   https://app.stc.ma.gov.br/legisla/
--     67f26e0e  pablo-marcal      critica  publicavel=false  https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2022/...
--   Nenhuma materia de jornal e atingida: slug de materia e longo e tem
--   hifen, entao nao casa. Foram testados explicitamente os dois casos de
--   materia hospedada na raiz do dominio que existem no acervo
--   (mpce.mp.br/denuncia-do-mp-contra-ciro-gomes.../ e
--    riosdenoticias.com.br/urgente-genro-de-david-almeida.../): os dois
--   continuam validos.
--
--   Efeito no gate de LEITURA (critica/alta que perderiam a ultima fonte
--   utilizavel): 2 linhas.
--     46bf8060  ronaldo-caiado   -> corrigida no bloco 1 acima, continua no ar
--     67f26e0e  pablo-marcal     -> candidato com publicavel = false, ja fora
--                                   do ar por outro caminho. Nao foi corrigida
--                                   aqui de proposito: o endpoint REST do TSE
--                                   para esse candidato devolveu corpo vazio
--                                   na tentativa desta sessao, entao nao ha
--                                   trecho literal para colar. Fica para
--                                   revisao editorial com fonte em maos.
--
--   df1ea0bc (gravidade baixa) nao e afetada pelo gate de leitura, que so
--   olha critica e alta, e ja sai do ar pela migration 20260725180000.
--
-- Efeito no gate de ESCRITA: linha legada nao conforme continua editavel e
-- despublicavel, e so nao pode ser publicada nem regredir. Isso ja era o
-- comportamento do trigger de 20260725160000 e nao muda aqui.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fonte_url_e_raiz_de_aplicacao(url text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    regexp_replace(
      split_part(split_part(btrim(url), '#', 1), '?', 1),
      '^https?://[^/]+',
      ''
    ) ~ '^/[A-Za-z]{2,20}/?$',
    false
  );
$$;

COMMENT ON FUNCTION public.fonte_url_e_raiz_de_aplicacao(text) IS
  'True quando a URL aponta para a raiz de um portal ou SPA (um unico segmento curto e alfabetico), e nao para um documento. https://divulgacandcontas.tse.jus.br/divulga/ responde 200 com 46 caracteres e nao sustenta afirmacao nenhuma. Etapa 5B da auditoria de 2026-07-24.';

CREATE OR REPLACE FUNCTION public.fonte_url_aponta_para_documento(url text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.fonte_url_tem_caminho(url) AND NOT public.fonte_url_e_raiz_de_aplicacao(url);
$$;

COMMENT ON FUNCTION public.fonte_url_aponta_para_documento(text) IS
  'Criterio unico de URL utilizavel a partir da etapa 5B: tem caminho E nao e raiz de portal. Espelhado em src/lib/public-attention-point.ts.';

-- Gate de LEITURA: basta uma fonte que aponte para documento.
CREATE OR REPLACE FUNCTION public.pontos_atencao_tem_fonte_com_caminho(sources jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(sources) = 'array' THEN sources ELSE '[]'::jsonb END
    ) AS f
    WHERE public.fonte_url_aponta_para_documento(f ->> 'url')
  );
$$;

COMMENT ON FUNCTION public.pontos_atencao_tem_fonte_com_caminho(jsonb) IS
  'True quando o array de fontes tem PELO MENOS UMA url que aponta para documento (tem caminho e nao e raiz de portal). Criterio do gate de leitura. Nome mantido por compatibilidade com 20260725160000.';

-- Gate de ESCRITA: nenhuma fonte pode ser dominio nu nem raiz de portal.
CREATE OR REPLACE FUNCTION public.ponto_atencao_fonte_conforme(severity text, sources jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(severity, 'media') NOT IN ('critica', 'alta')
    OR (
      jsonb_typeof(sources) = 'array'
      AND jsonb_array_length(sources) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(sources) AS f
        WHERE NOT public.fonte_url_aponta_para_documento(f ->> 'url')
      )
    );
$$;

COMMENT ON FUNCTION public.ponto_atencao_fonte_conforme(text, jsonb) IS
  'Criterio de escrita: gravidade critica/alta exige >= 1 fonte e nenhuma fonte com URL sem caminho ou apontando para raiz de portal. Gravidades menores sempre conformes.';

-- Mensagem do trigger passa a distinguir os dois defeitos, para quem for
-- bloqueado saber o que consertar. Corpo identico ao de 20260725160000, com
-- o calculo de `motivo` reescrito.
CREATE OR REPLACE FUNCTION public.pontos_atencao_exige_fonte()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  motivo text;
  urls_sem_caminho text;
  urls_raiz text;
  antigo_conforme boolean;
  publicando boolean;
BEGIN
  IF public.ponto_atencao_fonte_conforme(NEW.gravidade, NEW.fontes) THEN
    RETURN NEW;
  END IF;

  IF NOT COALESCE(jsonb_typeof(NEW.fontes) = 'array' AND jsonb_array_length(NEW.fontes) > 0, false) THEN
    motivo := 'nenhuma fonte preenchida';
  ELSE
    SELECT string_agg(COALESCE(NULLIF(btrim(f ->> 'url'), ''), '(sem url)'), ', ')
      INTO urls_sem_caminho
      FROM jsonb_array_elements(NEW.fontes) AS f
     WHERE NOT public.fonte_url_tem_caminho(f ->> 'url');

    SELECT string_agg(btrim(f ->> 'url'), ', ')
      INTO urls_raiz
      FROM jsonb_array_elements(NEW.fontes) AS f
     WHERE public.fonte_url_tem_caminho(f ->> 'url')
       AND public.fonte_url_e_raiz_de_aplicacao(f ->> 'url');

    motivo := concat_ws(
      '; ',
      CASE WHEN urls_sem_caminho IS NOT NULL THEN 'fonte com URL sem caminho (dominio nu): ' || urls_sem_caminho END,
      CASE WHEN urls_raiz IS NOT NULL THEN 'fonte que aponta para a raiz de um portal, nao para um documento: ' || urls_raiz END
    );
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION
      'ponto de atencao de gravidade % recusado: %', NEW.gravidade, motivo
      USING ERRCODE = 'check_violation',
            HINT = 'Gravidade critica ou alta exige pelo menos uma fonte, nenhuma URL de dominio nu e nenhuma URL apontando para a raiz de um portal. Anexe a fonte primaria (decisao, acordao, diario oficial, consulta especifica) ou grave a claim com gravidade menor. Ver supabase/migrations/20260725190000_fonte_substancia_documento_pontos_atencao.sql.';
  END IF;

  antigo_conforme := public.ponto_atencao_fonte_conforme(OLD.gravidade, OLD.fontes);
  publicando := COALESCE(NEW.visivel, false) AND NOT COALESCE(OLD.visivel, false);

  IF antigo_conforme THEN
    RAISE EXCEPTION
      'ponto de atencao % nao pode regredir para gravidade % sem fonte: %', NEW.id, NEW.gravidade, motivo
      USING ERRCODE = 'check_violation',
            HINT = 'A linha estava conforme antes deste UPDATE. Mantenha a fonte ou reduza a gravidade.';
  END IF;

  IF publicando THEN
    RAISE EXCEPTION
      'ponto de atencao % de gravidade % nao pode ser publicado: %', NEW.id, NEW.gravidade, motivo
      USING ERRCODE = 'check_violation',
            HINT = 'Linha legada sem fonte pode ser corrigida ou escondida, nunca publicada. Anexe a fonte no mesmo UPDATE que liga visivel.';
  END IF;

  -- Linha legada nao conforme continuando nao conforme e nao sendo publicada:
  -- passa de proposito, para nao travar a propria correcao.
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.pontos_atencao_exige_fonte() IS
  'Gate de escrita de fonte em pontos_atencao. Bloqueia INSERT de critica/alta sem fonte que aponte para documento, regressao de linha conforme e publicacao de linha nao conforme. Etapas 2B e 5B da auditoria de 2026-07-24.';

REVOKE ALL ON FUNCTION public.fonte_url_e_raiz_de_aplicacao(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fonte_url_aponta_para_documento(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fonte_url_e_raiz_de_aplicacao(text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fonte_url_aponta_para_documento(text)
  TO anon, authenticated, service_role;

COMMIT;

-- =====================================================================
-- VERIFICACAO DEPOIS DE APLICAR
--
-- 1. Formato:
--    select public.fonte_url_aponta_para_documento('https://divulgacandcontas.tse.jus.br/divulga/')  -- f
--         , public.fonte_url_aponta_para_documento('https://divulgacandcontas.tse.jus.br/divulga/#/candidato/2022/x') -- f
--         , public.fonte_url_aponta_para_documento('https://app.stc.ma.gov.br/legisla/')             -- f
--         , public.fonte_url_aponta_para_documento('https://mpce.mp.br/denuncia-do-mp-contra-ciro-gomes-por-crime-de-violencia-politica-de-genero-e-aceita-pela-justica-eleitoral/') -- t
--         , public.fonte_url_aponta_para_documento('https://g1.globo.com/')                          -- f
--         , public.fonte_url_aponta_para_documento(null);                                            -- f
--
-- 2. As duas claims corrigidas (esperado: 1 linha cada, com a fonte nova):
--    select id, titulo, fontes from public.pontos_atencao
--    where id in ('46bf8060-8978-4509-a954-ce343d2f3d1c',
--                 '1a27db63-832b-456d-87cf-5e6b1095a0b2');
--
-- 3. Nenhuma critica/alta publicada de candidato publicavel sem fonte
--    utilizavel (esperado: 0 linhas):
--    select pa.id, c.slug, pa.gravidade, pa.titulo
--    from public.pontos_atencao pa join public.candidatos c on c.id = pa.candidato_id
--    where c.publicavel and pa.visivel and pa.gravidade in ('critica','alta')
--      and not public.pontos_atencao_tem_fonte_com_caminho(pa.fontes);
--
-- 4. Link-check com a checagem de substancia ligada (nao escreve nada):
--    npm run data:link-check-fontes:gate
-- =====================================================================
