-- =====================================================================
-- GUARD-RAILS DE FONTE EM pontos_atencao (etapa 2B da auditoria de
-- integridade de 2026-07-24, docs/auditoria-integridade-2026-07-24.md).
--
-- O QUE ESTA MIGRATION CORRIGE
--
-- O achado V1 do laudo: afirmacao grave sobre pessoa nomeada publicada
-- citando URL que nunca existiu, com verificado = true. O achado V2
-- explica por que o gate atual nao pegou: o gate criado em
-- 20260403234500_gate_unverified_ai_attention_points.sql exige verificacao
-- somente quando gerado_por = 'ia'. A claim critica sobre renan-santos veio
-- de curadoria, entao passou direto mesmo com verificado = false.
--
-- O criterio errado era a ORIGEM do texto. O criterio certo e a GRAVIDADE
-- da afirmacao. Quem escreveu nao muda o dano de acusar alguem de crime sem
-- lastro.
--
-- QUATRO GUARDS, NESTA ORDEM:
--
--   1. Gate de LEITURA por gravidade (public.is_public_attention_point/5).
--      Gravidade 'critica' ou 'alta' so aparece se verificado = true E
--      existir pelo menos uma fonte com URL de caminho nao vazio,
--      independente de gerado_por.
--   2. Validacao de FORMATO de URL (public.fonte_url_tem_caminho).
--      Dominio nu (https://g1.globo.com/) nao conta como fonte.
--   3. Gate de ESCRITA (trigger trg_pontos_atencao_exige_fonte).
--      Recusa INSERT de critica/alta sem fonte utilizavel, independente de
--      visivel, e recusa qualquer UPDATE que faca uma linha conforme virar
--      nao conforme ou que publique uma linha nao conforme.
--   4. Consistencia do alerta por email (public.log_candidate_change).
--      O digest deixa de anunciar claim que o gate de leitura esconde.
--
-- REVERSIBILIDADE
--
-- Nada de dado e apagado e nenhuma linha e alterada por esta migration.
-- O unico efeito sobre o que esta no ar vem do gate de leitura, que e
-- funcao pura: para voltar ao comportamento anterior basta recriar as duas
-- views e a policy chamando a assinatura de 3 argumentos, que continua
-- existindo e intacta.
--
-- =====================================================================
-- EVIDENCIA MEDIDA ANTES DE ESCREVER (SELECT rodado em 2026-07-25 contra o
-- projeto wskpzsobvqwhnbsdsmok, somente leitura)
--
-- (a) Impacto do gate de leitura. Quantos pontos publicos hoje sairiam do ar:
--
--   with base as (
--     select pa.id, c.slug, pa.gravidade, pa.gerado_por, pa.verificado, pa.titulo,
--       exists (
--         select 1 from jsonb_array_elements(
--           case when jsonb_typeof(pa.fontes)='array' then pa.fontes else '[]'::jsonb end) f
--         where f->>'url' ~ '^https?://[^/?#]+/[^/?#]'
--       ) as tem_url_com_caminho
--     from public.pontos_atencao pa join public.candidatos c on c.id = pa.candidato_id
--     where public.is_public_attention_point(pa.visivel, pa.gerado_por, pa.verificado)
--       and pa.gravidade in ('critica','alta')
--   )
--   select id, slug, gravidade, gerado_por, verificado, tem_url_com_caminho, titulo
--   from base where not (coalesce(verificado,false) and tem_url_com_caminho);
--
-- Resultado observado: 6 linhas, todas gerado_por = 'curadoria' (ou seja,
-- todas invisiveis para o gate antigo). 4 criticas e 2 altas:
--
--   2ca642a4-9344-4dab-a105-b5029e968aaf  flavio-bolsonaro  alta     verificado=true   "Caso das rachadinhas"
--   f0922bdd-44f8-496d-8aa5-b6c899f72f99  pablo-marcal      alta     verificado=true   "Condenacao por furto qualificado"
--   4ea818c4-865d-4503-bd53-d50ef9e704a1  jair-bolsonaro    critica  verificado=true   "Inelegivel ate 2030"
--   a1b3850e-6fb7-4652-8438-4ca7155a76da  jair-bolsonaro    critica  verificado=true   "Indiciado por tentativa de golpe"
--   6452c61b-8632-44d4-be0f-c6e66f161681  pablo-marcal      critica  verificado=true   "Laudo falso contra Boulos"
--   8b186e05-787d-4ae9-bcbb-ed92e67079f5  renan-santos      critica  verificado=false  "Investigado por organizacao criminosa (STF, inq. 4923)"
--
-- Os 5 primeiros tem exatamente 1 fonte cada, todas com dominio nu. O sexto e
-- o caso do achado V2: fonte com caminho, mas verificado = false.
--
-- ATENCAO PARA O REVISOR: estes 6 pontos SAEM DO AR quando esta migration for
-- aplicada. Sao afirmacoes plausiveis e provavelmente verdadeiras (a
-- inelegibilidade de Jair Bolsonaro, por exemplo, e fato publico), mas hoje
-- estao publicadas sem fonte que aponte para a decisao. Sair do ar ate que
-- alguem anexe a fonte primaria e o comportamento pedido pelo laudo, nao um
-- efeito colateral. Nenhuma linha e deletada: bastam anexar a fonte e voltar.
--
-- (b) Impacto do gate de escrita sobre o acervo existente:
--
--   with r as (
--     select pa.gravidade,
--       coalesce(jsonb_typeof(pa.fontes)='array' and jsonb_array_length(pa.fontes)>0, false) as tem_fonte,
--       not exists (
--         select 1 from jsonb_array_elements(
--           case when jsonb_typeof(pa.fontes)='array' then pa.fontes else '[]'::jsonb end) f
--         where btrim(coalesce(f->>'url','')) !~ '^https?://[^/?#[:space:]]+/[^/?#[:space:]]'
--       ) as todas_com_caminho,
--       coalesce(pa.visivel,false) as visivel
--     from public.pontos_atencao pa
--   )
--   select count(*) as total,
--     count(*) filter (where gravidade in ('critica','alta')) as critica_alta,
--     count(*) filter (where gravidade in ('critica','alta') and not tem_fonte) as ca_sem_fonte,
--     count(*) filter (where gravidade in ('critica','alta') and tem_fonte and not todas_com_caminho) as ca_dominio_nu,
--     count(*) filter (where gravidade in ('critica','alta') and tem_fonte and todas_com_caminho) as ca_conformes,
--     count(*) filter (where gravidade in ('critica','alta')
--       and not (tem_fonte and todas_com_caminho) and visivel) as ca_nao_conformes_visiveis
--   from r;
--
-- Resultado observado em 2026-07-25:
--   total = 238, critica_alta = 56, ca_sem_fonte = 16, ca_dominio_nu = 5,
--   ca_conformes = 35, ca_nao_conformes_visiveis = 5.
--
-- Os 16 sem fonte alguma sao o achado A3 do laudo. Por isso o guard de escrita
-- e TRIGGER e nao CHECK CONSTRAINT: um CHECK, mesmo NOT VALID, bloquearia
-- qualquer UPDATE nessas 16 linhas, inclusive o UPDATE que as despublica. O
-- trigger abaixo faz o contrario: deixa a linha legada ser corrigida ou
-- escondida, mas nunca deixa ela ser publicada nem deixa uma linha conforme
-- regredir.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Formato de URL de fonte
--
-- "Caminho nao vazio" = existe pelo menos um caractere de path depois do
-- host. https://g1.globo.com/ e https://g1.globo.com nao passam;
-- https://g1.globo.com/politica/noticia.ghtml passa.
--
-- Censo de 2026-07-25: das 303 fontes com chave url no acervo, 190 sao
-- dominio nu. E o achado A2 do laudo (52 delas em pontos publicados).
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fonte_url_tem_caminho(url text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(btrim(url) ~ '^https?://[^/?#[:space:]]+/[^/?#[:space:]]', false);
$$;

COMMENT ON FUNCTION public.fonte_url_tem_caminho(text) IS
  'True quando a URL tem host e caminho nao vazio. Dominio nu, string vazia, NULL e esquema nao-http retornam false. Etapa 2B da auditoria de 2026-07-24.';

-- Pelo menos uma fonte utilizavel. E o criterio do gate de LEITURA.
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
    WHERE public.fonte_url_tem_caminho(f ->> 'url')
  );
$$;

COMMENT ON FUNCTION public.pontos_atencao_tem_fonte_com_caminho(jsonb) IS
  'True quando o array de fontes tem PELO MENOS UMA url com caminho. Criterio do gate de leitura.';

-- Todas as fontes utilizaveis, e pelo menos uma. E o criterio do gate de
-- ESCRITA, deliberadamente mais duro que o de leitura: na hora de gravar da
-- para exigir que nenhuma fonte seja dominio nu, enquanto no gate de leitura
-- exigir isso derrubaria claim boa por causa de fonte secundaria fraca.
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
        WHERE NOT public.fonte_url_tem_caminho(f ->> 'url')
      )
    );
$$;

COMMENT ON FUNCTION public.ponto_atencao_fonte_conforme(text, jsonb) IS
  'Criterio de escrita: gravidade critica/alta exige >= 1 fonte e nenhuma fonte com URL sem caminho. Gravidades menores sempre conformes.';

-- ---------------------------------------------------------------------
-- 2. Gate de leitura por GRAVIDADE, nao por origem
--
-- Assinatura nova de 5 argumentos. A de 3 argumentos continua existindo e
-- com o corpo intacto, porque scripts/audit/*.sql e o trigger de alertas a
-- referenciam e porque ela e o fallback de rollback.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_public_attention_point(
  is_visible boolean,
  generated_by text,
  is_verified boolean,
  severity text,
  sources jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    -- Comportamento antigo preservado na integra para gravidade media/baixa.
    public.is_public_attention_point(is_visible, generated_by, is_verified)
    AND (
      COALESCE(severity, 'media') NOT IN ('critica', 'alta')
      OR (
        COALESCE(is_verified, false)
        AND public.pontos_atencao_tem_fonte_com_caminho(sources)
      )
    );
$$;

COMMENT ON FUNCTION public.is_public_attention_point(boolean, text, boolean, text, jsonb) IS
  'Gate de publicacao canonico. Alem da regra antiga (IA exige verificacao), gravidade critica/alta exige verificado = true E pelo menos uma fonte com URL de caminho nao vazio, independente de gerado_por. Achados V1 e V2 da auditoria de 2026-07-24.';

COMMENT ON FUNCTION public.is_public_attention_point(boolean, text, boolean) IS
  'DEPRECADA para superficie publica. Nao conhece gravidade nem fontes, entao deixa passar claim critica sem fonte (achado V2 da auditoria de 2026-07-24). Mantida so para compatibilidade de scripts de auditoria e como rollback. Use a assinatura de 5 argumentos.';

REVOKE ALL ON FUNCTION public.fonte_url_tem_caminho(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pontos_atencao_tem_fonte_com_caminho(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ponto_atencao_fonte_conforme(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_public_attention_point(boolean, text, boolean, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fonte_url_tem_caminho(text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pontos_atencao_tem_fonte_com_caminho(jsonb)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ponto_atencao_fonte_conforme(text, jsonb)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_public_attention_point(boolean, text, boolean, text, jsonb)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Superficies que consomem o gate
--
-- As duas views sao recriadas identicas ao que hoje esta em pg_views (lidas
-- do banco em 2026-07-25), trocando SOMENTE a chamada de 3 para 5 argumentos
-- e mantendo security_invoker = true, que veio de
-- 20260712003000_public_security_invoker_compatibility.sql.
-- ---------------------------------------------------------------------

DROP VIEW IF EXISTS public.v_ficha_candidato;
CREATE VIEW public.v_ficha_candidato
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.nome_completo,
  c.nome_urna,
  c.slug,
  c.data_nascimento,
  c.idade,
  c.naturalidade,
  c.formacao,
  c.profissao_declarada,
  c.genero,
  c.estado_civil,
  c.cor_raca,
  c.partido_atual,
  c.partido_sigla,
  c.cargo_atual,
  c.cargo_disputado,
  c.estado,
  c.status,
  c.situacao_candidatura,
  c.biografia,
  c.foto_url,
  c.site_campanha,
  c.redes_sociais,
  c.fonte_dados,
  c.ultima_atualizacao,
  (SELECT COUNT(*) FROM public.processos p WHERE p.candidato_id = c.id) AS total_processos,
  (SELECT COUNT(*) FROM public.processos p WHERE p.candidato_id = c.id AND p.tipo = 'criminal') AS processos_criminais,
  (SELECT COUNT(*) FROM public.mudancas_partido mp WHERE mp.candidato_id = c.id) AS total_mudancas_partido,
  (
    SELECT COUNT(*)
    FROM public.pontos_atencao pa
    WHERE pa.candidato_id = c.id
      AND public.is_public_attention_point(pa.visivel, pa.gerado_por, pa.verificado, pa.gravidade, pa.fontes)
  ) AS total_pontos_atencao,
  (
    SELECT COUNT(*)
    FROM public.pontos_atencao pa
    WHERE pa.candidato_id = c.id
      AND public.is_public_attention_point(pa.visivel, pa.gerado_por, pa.verificado, pa.gravidade, pa.fontes)
      AND pa.categoria <> 'feito_positivo'
      AND pa.gravidade = 'critica'
  ) AS pontos_criticos,
  (SELECT pat.valor_total FROM public.patrimonio pat WHERE pat.candidato_id = c.id ORDER BY pat.ano_eleicao DESC LIMIT 1) AS ultimo_patrimonio,
  (SELECT pat.ano_eleicao FROM public.patrimonio pat WHERE pat.candidato_id = c.id ORDER BY pat.ano_eleicao DESC LIMIT 1) AS ano_ultimo_patrimonio
FROM public.candidatos_publico c;

DROP VIEW IF EXISTS public.v_comparador;
CREATE VIEW public.v_comparador
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.nome_urna,
  c.slug,
  c.partido_sigla,
  c.cargo_disputado,
  c.estado,
  c.foto_url,
  COALESCE(c.idade, EXTRACT(YEAR FROM age(CURRENT_DATE, c.data_nascimento))::INTEGER) AS idade,
  c.formacao,
  (SELECT COUNT(*) FROM public.processos p WHERE p.candidato_id = c.id) AS total_processos,
  (SELECT COUNT(*) FROM public.mudancas_partido mp WHERE mp.candidato_id = c.id) AS mudancas_partido,
  (
    SELECT COUNT(*)
    FROM public.pontos_atencao pa
    WHERE pa.candidato_id = c.id
      AND public.is_public_attention_point(pa.visivel, pa.gerado_por, pa.verificado, pa.gravidade, pa.fontes)
      AND pa.categoria <> 'feito_positivo'
      AND pa.gravidade IN ('critica', 'alta')
  ) AS alertas_graves,
  (SELECT pat.valor_total FROM public.patrimonio pat WHERE pat.candidato_id = c.id ORDER BY pat.ano_eleicao DESC LIMIT 1) AS patrimonio_declarado,
  (
    SELECT json_agg(json_build_object('titulo', pa.titulo, 'categoria', pa.categoria, 'gravidade', pa.gravidade))
    FROM public.pontos_atencao pa
    WHERE pa.candidato_id = c.id
      AND public.is_public_attention_point(pa.visivel, pa.gerado_por, pa.verificado, pa.gravidade, pa.fontes)
  ) AS pontos_atencao
FROM public.candidatos_publico c;

GRANT SELECT ON public.v_ficha_candidato TO anon, authenticated;
GRANT SELECT ON public.v_comparador TO anon, authenticated;

-- RLS de leitura direta na tabela. E o caminho que src/lib/api.ts usa
-- (select("*") em pontos_atencao com o papel anon), entao sem esta troca o
-- gate novo valeria so para os agregados das views.
DROP POLICY IF EXISTS "Leitura pública" ON public.pontos_atencao;
CREATE POLICY "Leitura pública" ON public.pontos_atencao
  FOR SELECT USING (
    public.is_public_attention_point(visivel, gerado_por, verificado, gravidade, fontes)
    AND public.is_public_candidate(candidato_id)
  );

-- ---------------------------------------------------------------------
-- 4. Gate de escrita
--
-- Regras:
--   INSERT  -> recusa qualquer critica/alta nao conforme, independente de
--              visivel. E o item 3 do pedido da etapa 2B e fecha o achado A3.
--   UPDATE  -> recusa quando a linha era conforme e deixaria de ser
--              (proibicao de regressao), e recusa quando uma linha nao
--              conforme esta sendo publicada (visivel false -> true).
--              Linha legada nao conforme continua editavel e despublicavel,
--              senao o proprio conserto ficaria bloqueado.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pontos_atencao_exige_fonte()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  motivo text;
  urls_ruins text;
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
      INTO urls_ruins
      FROM jsonb_array_elements(NEW.fontes) AS f
     WHERE NOT public.fonte_url_tem_caminho(f ->> 'url');
    motivo := 'fonte com URL sem caminho (dominio nu): ' || COALESCE(urls_ruins, '(desconhecida)');
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION
      'ponto de atencao de gravidade % recusado: %', NEW.gravidade, motivo
      USING ERRCODE = 'check_violation',
            HINT = 'Gravidade critica ou alta exige pelo menos uma fonte e nenhuma URL de dominio nu. Anexe a fonte primaria (decisao, acordao, diario oficial) ou grave a claim com gravidade menor. Ver supabase/migrations/20260725160000_gate_gravidade_fonte_pontos_atencao.sql.';
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
  'Gate de escrita de fonte em pontos_atencao. Bloqueia INSERT de critica/alta sem fonte utilizavel, regressao de linha conforme e publicacao de linha nao conforme. Etapa 2B da auditoria de 2026-07-24.';

DROP TRIGGER IF EXISTS trg_pontos_atencao_exige_fonte ON public.pontos_atencao;
CREATE TRIGGER trg_pontos_atencao_exige_fonte
  BEFORE INSERT OR UPDATE ON public.pontos_atencao
  FOR EACH ROW
  EXECUTE FUNCTION public.pontos_atencao_exige_fonte();

-- ---------------------------------------------------------------------
-- 5. Alerta por email deixa de anunciar o que o site esconde
--
-- Corpo copiado na integra de pg_get_functiondef(log_candidate_change) lido
-- em 2026-07-25. Unica alteracao: as duas chamadas de
-- is_public_attention_point no ramo de pontos_atencao passam a receber
-- gravidade e fontes. Sem isso, o digest de
-- src/app/api/alerts/send-digest/route.ts continuaria emailando claim
-- critica sem fonte que a ficha nao mostra mais.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_candidate_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  candidate_id UUID;
  change_tipo TEXT;
  change_operacao TEXT;
  change_titulo TEXT;
  change_descricao TEXT;
  change_metadata JSONB;
  should_log BOOLEAN := FALSE;
  new_public_attention_point BOOLEAN := FALSE;
  old_public_attention_point BOOLEAN := FALSE;
BEGIN
  IF TG_TABLE_NAME = 'processos' THEN
    candidate_id := NEW.candidato_id;
    change_tipo := 'processo';
    change_titulo := COALESCE(NULLIF(NEW.descricao, ''), 'Processo atualizado');
    change_descricao := CONCAT_WS(' · ', NEW.tribunal, NEW.status);
    change_metadata := jsonb_strip_nulls(
      jsonb_build_object(
        'tribunal', NEW.tribunal,
        'status', NEW.status,
        'gravidade', NEW.gravidade,
        'data_inicio', NEW.data_inicio,
        'data_decisao', NEW.data_decisao,
        'numero_processo', NEW.numero_processo
      )
    );

    IF TG_OP = 'INSERT' THEN
      should_log := TRUE;
      change_operacao := 'insert';
    ELSIF NEW.status IS DISTINCT FROM OLD.status
      OR NEW.data_decisao IS DISTINCT FROM OLD.data_decisao
      OR NEW.gravidade IS DISTINCT FROM OLD.gravidade
      OR NEW.descricao IS DISTINCT FROM OLD.descricao THEN
      should_log := TRUE;
      change_operacao := 'update';
    END IF;
  ELSIF TG_TABLE_NAME = 'mudancas_partido' THEN
    candidate_id := NEW.candidato_id;
    change_tipo := 'mudanca_partido';
    change_operacao := 'insert';
    change_titulo := CONCAT('Mudança de partido: ', COALESCE(NEW.partido_novo, 'partido não informado'));
    change_descricao := CONCAT_WS(' · ', NEW.partido_anterior, NEW.contexto);
    change_metadata := jsonb_strip_nulls(
      jsonb_build_object(
        'partido_anterior', NEW.partido_anterior,
        'partido_novo', NEW.partido_novo,
        'ano', NEW.ano,
        'data_mudanca', NEW.data_mudanca,
        'contexto', NEW.contexto
      )
    );
    should_log := TG_OP = 'INSERT';
  ELSIF TG_TABLE_NAME = 'patrimonio' THEN
    candidate_id := NEW.candidato_id;
    change_tipo := 'patrimonio';
    change_titulo := CONCAT('Patrimônio declarado ', NEW.ano_eleicao);
    change_descricao := 'Declaração patrimonial atualizada.';
    change_metadata := jsonb_strip_nulls(
      jsonb_build_object(
        'ano_eleicao', NEW.ano_eleicao,
        'valor_total', NEW.valor_total,
        'quantidade_bens', jsonb_array_length(COALESCE(NEW.bens, '[]'::jsonb))
      )
    );

    IF TG_OP = 'INSERT' THEN
      should_log := TRUE;
      change_operacao := 'insert';
    ELSIF NEW.valor_total IS DISTINCT FROM OLD.valor_total
      OR NEW.bens IS DISTINCT FROM OLD.bens THEN
      should_log := TRUE;
      change_operacao := 'update';
    END IF;
  ELSIF TG_TABLE_NAME = 'noticias_candidato' THEN
    candidate_id := NEW.candidato_id;
    change_tipo := 'noticia';
    change_operacao := 'insert';
    change_titulo := NEW.titulo;
    change_descricao := COALESCE(NEW.snippet, NEW.fonte, 'Nova notícia publicada.');
    change_metadata := jsonb_strip_nulls(
      jsonb_build_object(
        'fonte', NEW.fonte,
        'url', NEW.url,
        'data_publicacao', NEW.data_publicacao
      )
    );
    should_log := TG_OP = 'INSERT';
  ELSIF TG_TABLE_NAME = 'pontos_atencao' THEN
    candidate_id := NEW.candidato_id;
    change_tipo := 'ponto_atencao';
    new_public_attention_point := public.is_public_attention_point(NEW.visivel, NEW.gerado_por, NEW.verificado, NEW.gravidade, NEW.fontes);
    old_public_attention_point := CASE
      WHEN TG_OP = 'UPDATE' THEN public.is_public_attention_point(OLD.visivel, OLD.gerado_por, OLD.verificado, OLD.gravidade, OLD.fontes)
      ELSE FALSE
    END;
    change_titulo := NEW.titulo;
    change_descricao := NEW.descricao;
    change_metadata := jsonb_strip_nulls(
      jsonb_build_object(
        'categoria', NEW.categoria,
        'gravidade', NEW.gravidade,
        'gerado_por', NEW.gerado_por,
        'verificado', NEW.verificado,
        'data_referencia', NEW.data_referencia,
        'fontes_count', jsonb_array_length(COALESCE(NEW.fontes, '[]'::jsonb))
      )
    );

    IF new_public_attention_point THEN
      IF TG_OP = 'INSERT' THEN
        should_log := TRUE;
        change_operacao := 'insert';
      ELSIF NOT old_public_attention_point THEN
        should_log := TRUE;
        change_operacao := 'publicado';
      END IF;
    END IF;
  END IF;

  IF NOT should_log OR candidate_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.candidate_changes (
    candidato_id,
    tipo,
    operacao,
    tabela_origem,
    registro_id,
    titulo,
    descricao,
    metadata
  )
  VALUES (
    candidate_id,
    change_tipo,
    change_operacao,
    TG_TABLE_NAME,
    NEW.id,
    change_titulo,
    change_descricao,
    change_metadata
  );

  RETURN NEW;
END;
$function$;

COMMIT;

-- =====================================================================
-- COMO CONFERIR DEPOIS DE APLICAR
--
-- 1. Formato de URL:
--    select public.fonte_url_tem_caminho('https://g1.globo.com/')            -- f
--         , public.fonte_url_tem_caminho('https://g1.globo.com')             -- f
--         , public.fonte_url_tem_caminho('https://g1.globo.com/pol/n.ghtml') -- t
--         , public.fonte_url_tem_caminho(null)                               -- f
--         , public.fonte_url_tem_caminho('  ')                               -- f
--         , public.fonte_url_tem_caminho('ftp://x.com/a');                   -- f
--
-- 2. Gate de leitura (esperado: 6 a menos em critica/alta):
--    select count(*) filter (where public.is_public_attention_point(visivel, gerado_por, verificado)) as antes,
--           count(*) filter (where public.is_public_attention_point(visivel, gerado_por, verificado, gravidade, fontes)) as depois
--    from public.pontos_atencao;
--
-- 3. Gate de escrita, INSERT (esperado: erro 23514):
--    begin;
--      insert into public.pontos_atencao (candidato_id, categoria, titulo, descricao, gravidade, visivel)
--      select id, 'teste', 'teste gate', 'teste gate', 'critica', false
--      from public.candidatos limit 1;
--    rollback;
--
-- 4. Gate de escrita, dominio nu (esperado: erro 23514):
--    begin;
--      insert into public.pontos_atencao (candidato_id, categoria, titulo, descricao, gravidade, fontes, visivel)
--      select id, 'teste', 'teste gate', 'teste gate', 'alta',
--             '[{"titulo":"g1","url":"https://g1.globo.com/"}]'::jsonb, false
--      from public.candidatos limit 1;
--    rollback;
--
-- 5. Gate de escrita, caso legitimo (esperado: sucesso):
--    begin;
--      insert into public.pontos_atencao (candidato_id, categoria, titulo, descricao, gravidade, fontes, visivel)
--      select id, 'teste', 'teste gate', 'teste gate', 'alta',
--             '[{"titulo":"STF","url":"https://portal.stf.jus.br/processos/detalhe.asp?incidente=1"}]'::jsonb, false
--      from public.candidatos limit 1;
--    rollback;
--
-- 6. Linha legada continua despublicavel (esperado: sucesso):
--    begin;
--      update public.pontos_atencao set visivel = false
--       where gravidade in ('critica','alta')
--         and coalesce(jsonb_typeof(fontes)='array' and jsonb_array_length(fontes)>0, false) = false;
--    rollback;
--
-- 7. Publicar linha legada continua proibido (esperado: erro 23514):
--    begin;
--      update public.pontos_atencao set visivel = true
--       where gravidade in ('critica','alta')
--         and coalesce(visivel,false) = false
--         and coalesce(jsonb_typeof(fontes)='array' and jsonb_array_length(fontes)>0, false) = false;
--    rollback;
-- =====================================================================
