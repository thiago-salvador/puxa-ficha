-- A view pública do histórico verificado deixa de executar com os privilégios
-- do dono (lint 0010 security_definer_view do Supabase) e passa a rodar como
-- quem consulta: colunas liberadas por GRANT de coluna, linhas por policy.
--
-- A quarentena de patrimônio não pode ser avaliada pelo invoker. A policy
-- restritiva publicacao_sem_despublicados esconde de anon/authenticated
-- exatamente as linhas despublicadas, então um NOT EXISTS lido como anon seria
-- sempre verdadeiro e liberaria histórico de registro em quarentena. O gate de
-- publicação vira um predicado SECURITY DEFINER por id de evento: ele responde
-- só se aquele evento já é publicável e não devolve nenhum dado da base.
BEGIN;

CREATE FUNCTION public.is_public_verified_candidate_update(p_update_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.verified_candidate_updates u
    WHERE u.id = p_update_id
      AND public.is_public_candidate(u.candidate_id)
      AND (
        u.field <> 'patrimonio'
        OR (
          EXISTS (
            SELECT 1 FROM public.patrimonio p
            WHERE p.candidato_id = u.candidate_id
              AND p.ano_eleicao = u.year
              AND p.despublicado_em IS NULL
          )
          -- Uma linha visível não autoriza histórico de um registro em quarentena.
          AND NOT EXISTS (
            SELECT 1 FROM public.patrimonio p
            WHERE p.candidato_id = u.candidate_id
              AND p.ano_eleicao = u.year
              AND p.despublicado_em IS NOT NULL
          )
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.is_public_verified_candidate_update(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_public_verified_candidate_update(uuid) TO anon, authenticated, service_role;

-- Somente as colunas que a view projeta. source_identity e before_source_url
-- continuam sem privilégio público; a tabela de observações não muda.
GRANT SELECT (id, candidate_id, field, year, before_value, after_value, source_url, detected_at)
  ON public.verified_candidate_updates TO anon, authenticated;
CREATE POLICY verified_candidate_updates_public_read ON public.verified_candidate_updates
  FOR SELECT TO anon, authenticated
  USING (public.is_public_verified_candidate_update(id));

-- A projeção e a ordem das colunas são as mesmas. O filtro fica também na view
-- porque service_role tem BYPASSRLS e não deve ver eventos não publicáveis.
-- candidatos já concede id, slug e nome_urna a anon/authenticated, e a policy
-- "Leitura pública" dela filtra as mesmas candidaturas que is_public_candidate.
CREATE OR REPLACE VIEW public.verified_candidate_updates_public
WITH (security_barrier = true, security_invoker = true) AS
SELECT u.id, u.candidate_id, c.slug AS candidate_slug, c.nome_urna AS candidate_name,
  u.field, u.year, u.before_value, u.after_value, u.source_url, u.detected_at
FROM public.verified_candidate_updates u
JOIN public.candidatos c ON c.id = u.candidate_id
WHERE public.is_public_verified_candidate_update(u.id);
REVOKE ALL ON public.verified_candidate_updates_public FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.verified_candidate_updates_public TO anon, authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.verified_candidate_updates_public'::regclass
      AND reloptions @> ARRAY['security_invoker=true', 'security_barrier=true']
  ) THEN
    RAISE EXCEPTION 'verified updates invoker: view options missing';
  END IF;
  IF has_column_privilege('anon', 'public.verified_candidate_updates', 'source_identity', 'SELECT')
    OR has_column_privilege('anon', 'public.verified_candidate_updates', 'before_source_url', 'SELECT')
    OR has_table_privilege('anon', 'public.verified_candidate_observations', 'SELECT') THEN
    RAISE EXCEPTION 'verified updates invoker: private column exposed';
  END IF;
END $$;
COMMIT;
