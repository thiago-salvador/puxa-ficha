-- Número exibido na urna, preservado como texto para manter zeros à esquerda.
-- O backfill do dado é separado e permanece dry-run por padrão.

BEGIN;

ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS numero_urna text;

COMMENT ON COLUMN public.candidatos.numero_urna IS
  'Número de urna oficial do TSE para a candidatura de 2026. Texto para preservar zeros à esquerda; null significa ainda não reconciliado.';

CREATE INDEX IF NOT EXISTS candidatos_numero_urna_estado_cargo_idx
  ON public.candidatos (numero_urna, estado, cargo_disputado);

GRANT SELECT (numero_urna) ON TABLE public.candidatos TO anon, authenticated;

-- Coluna nova somente no fim da view pública para preservar consumidores existentes.
CREATE OR REPLACE VIEW public.candidatos_publico
WITH (security_invoker = true) AS
 SELECT id,
    nome_completo,
    nome_urna,
    slug,
    data_nascimento,
    COALESCE(idade, EXTRACT(year FROM age(CURRENT_DATE::timestamp with time zone, data_nascimento::timestamp with time zone))::integer) AS idade,
    naturalidade,
    formacao,
    profissao_declarada,
    genero,
    estado_civil,
    cor_raca,
    partido_atual,
    partido_sigla,
    cargo_atual,
    cargo_disputado,
    estado,
    status,
    situacao_candidatura,
    biografia,
    foto_url,
    site_campanha,
    redes_sociais,
    ( SELECT array_agg(f.valor ORDER BY f.ord)
        FROM unnest(c.fonte_dados) WITH ORDINALITY AS f(valor, ord)
       WHERE f.valor NOT LIKE 'interno:%') AS fonte_dados,
    ultima_atualizacao,
    verificacao_campos,
    foto_credito,
    formacao_instituicao,
    numero_urna
   FROM public.candidatos c
  WHERE status <> 'removido'::text AND publicavel = true;

GRANT SELECT ON public.candidatos_publico TO anon, authenticated;

COMMIT;
