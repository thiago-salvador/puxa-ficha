-- Separacao aditiva de schema e curadoria, issue #136.
--
-- As cinco migrations de origem ja foram aplicadas e permanecem imutaveis no
-- historico. Este arquivo reproduz somente a DDL persistente que estava
-- acoplada a dados de ficha. Todos os statements sao idempotentes para que a
-- migration seja um no-op estrutural no banco atual e reconstrua o schema num
-- Postgres vazio. O manifesto mecanico e os hashes das origens vivem em
-- scripts/audit/schema-replay-substituicoes.json.

-- Origem: 20260710222500_sc_state_completion.sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_patrimonio_candidato_ano_eleicao
  ON public.patrimonio (candidato_id, ano_eleicao);

CREATE UNIQUE INDEX IF NOT EXISTS uq_financiamento_candidato_ano_eleicao
  ON public.financiamento (candidato_id, ano_eleicao);

-- Origem: 20260726160000_despublicar_historico_por_homonimo.sql
ALTER TABLE public.historico_politico
  ADD COLUMN IF NOT EXISTS despublicacao_motivo text,
  ADD COLUMN IF NOT EXISTS despublicado_em timestamptz;

COMMENT ON COLUMN public.historico_politico.despublicado_em IS
  'Quando preenchido, a linha nao aparece na ficha publica. Usado para candidatura atribuida por homonimo, sem deletar o dado.';

CREATE INDEX IF NOT EXISTS idx_historico_politico_despublicado
  ON public.historico_politico (despublicado_em)
  WHERE despublicado_em IS NOT NULL;

-- Origem: 20260726180000_identidade_jeronimo_e_homonimo_dorinha.sql
COMMENT ON COLUMN public.candidatos.naturalidade IS
  'Local de nascimento. O pacote consulta_cand do TSE traz apenas a UF (SG_UF_NASCIMENTO), nao o municipio, entao linhas corrigidas por essa fonte podem ter so a sigla.';

-- Origem: 20260805123929_aplicar_decisoes_editoriais_20260805.sql
CREATE OR REPLACE FUNCTION public.bloquear_contagem_ia_cargos_como_mandatos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.gerado_por = 'ia'
     AND NEW.titulo ~* '^Carreira política:[[:space:]]*[0-9]+[[:space:]]+mandato' THEN
    RAISE EXCEPTION 'ponto de carreira de IA recusado: o título conta cargos distintos como mandatos'
      USING ERRCODE = 'check_violation',
            HINT = 'Descreva os cargos exercidos e conte mandatos eletivos individualmente, com fonte primária.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_contagem_ia_cargos_como_mandatos
ON public.pontos_atencao;

CREATE TRIGGER trg_bloquear_contagem_ia_cargos_como_mandatos
BEFORE INSERT OR UPDATE OF titulo, gerado_por ON public.pontos_atencao
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_contagem_ia_cargos_como_mandatos();

-- Origem: 20260807181000_patrimonio_ausencia_oficial.sql
CREATE TABLE IF NOT EXISTS public.patrimonio_ausencia_oficial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
  ano_eleicao INTEGER NOT NULL,
  sq_candidato TEXT NOT NULL,
  fonte_url TEXT,
  verificado_em TIMESTAMPTZ,
  detalhe TEXT,
  execucao TEXT NOT NULL DEFAULT 'A2B-ausencias-oficiais-20260807',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (candidato_id, ano_eleicao)
);
