-- =====================================================================
-- Migration de SCHEMA (as anteriores desta serie sao so de dado).
-- Proposta que sai da auditoria de integridade de 24/07/2026.
--
-- Ela existe por dois motivos declarados nas migrations de dado desta serie:
--
-- 1. NAO HA COLUNA PARA O MOTIVO DE DESPUBLICACAO.
--    As migrations 20260725120000 (etapa 1B, 29 pontos) e 20260725133000
--    (etapa 1A, 14 pontos) tiveram que gravar o motivo dentro do jsonb
--    generico dados_relacionados, na chave 'despublicacao_2026_07_25'. Isso
--    funciona, mas o motivo fica invisivel para quem le o schema, nao aparece
--    em nenhum tipo gerado, nao da para indexar sem expressao e nada impede que
--    a proxima despublicacao invente outra chave. Um ponto de atencao que sai
--    do ar sem motivo rastreavel e exatamente o tipo de silencio que produziu
--    o achado V1.
--
-- 2. NADA IMPEDE OUTRO cpf INVALIDO.
--    A migration 20260725150000 anulou cpf = '-4' em guto-silva, o unico valor
--    fora do formato entre os 125 preenchidos. Sem constraint, o proximo
--    insert repete o caso.
--
-- ESTA MIGRATION E DDL E DEVE SER REVISADA COM MAIS CUIDADO QUE AS OUTRAS.
-- Ela nao e obrigatoria para as correcoes de dado funcionarem. Se o revisor
-- preferir manter tudo em dados_relacionados, basta nao aplicar este arquivo:
-- as cinco migrations anteriores continuam corretas e completas sozinhas.
--
-- ORDEM IMPORTA: este arquivo tem timestamp posterior a TODAS as migrations de
-- dado desta serie. O backfill abaixo depende de 20260725120000 e
-- 20260725133000 ja terem rodado, e a constraint de cpf depende de
-- 20260725150000 ja ter anulado o '-4'.
--
-- IMPACTO EM SUPERFICIE PUBLICA: nenhum, verificado.
-- As quatro views que tocam candidatos ou pontos_atencao
-- (v_ficha_candidato, v_comparador, candidatos_publico e
-- candidatos_identidade_tier1_auditavel) listam colunas explicitamente e
-- nenhuma usa to_jsonb, row_to_json ou expansao de linha inteira de
-- pontos_atencao. Confirmado por consulta a information_schema.views em
-- 2026-07-25. As colunas novas NAO chegam a API publica sozinhas.
--
-- DEPOIS DE APLICAR: regerar os tipos TypeScript do Supabase, porque a forma
-- da tabela muda.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Motivo de despublicacao como coluna de primeira classe
-- ---------------------------------------------------------------------

ALTER TABLE public.pontos_atencao
  ADD COLUMN IF NOT EXISTS despublicacao_motivo text,
  ADD COLUMN IF NOT EXISTS despublicado_em timestamptz;

COMMENT ON COLUMN public.pontos_atencao.despublicacao_motivo IS
  'Por que este ponto de atencao saiu do ar. Obrigatorio na pratica sempre que visivel passa a false por falha de fonte. Preenchido pela auditoria de integridade de 2026-07-25.';

COMMENT ON COLUMN public.pontos_atencao.despublicado_em IS
  'Quando o ponto saiu do ar. NULL para pontos que nunca foram despublicados.';

-- Backfill a partir do que as migrations de dado ja gravaram no jsonb.
-- So toca linhas que tem o registro de despublicacao e ainda estao sem motivo,
-- entao e idempotente e nao inventa motivo para linha nenhuma.
UPDATE public.pontos_atencao
   SET despublicacao_motivo = dados_relacionados -> 'despublicacao_2026_07_25' ->> 'motivo',
       despublicado_em = COALESCE(despublicado_em, timestamptz '2026-07-25 00:00:00-03')
 WHERE dados_relacionados ? 'despublicacao_2026_07_25'
   AND despublicacao_motivo IS NULL;
-- Esperado apos as migrations 20260725120000 e 20260725133000:
--   29 linhas da etapa 1B + 14 linhas da etapa 1A = 43 linhas com motivo.
-- Query de conferencia:
--   select count(*) from public.pontos_atencao where despublicacao_motivo is not null;

CREATE INDEX IF NOT EXISTS idx_pontos_atencao_despublicado
  ON public.pontos_atencao (despublicado_em)
  WHERE despublicado_em IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. Formato de cpf
--
-- NOT VALID de proposito: a constraint passa a valer para todo INSERT e UPDATE
-- daqui pra frente sem varrer a tabela inteira no momento da aplicacao. O
-- censo ja mostrou que a tabela fica limpa depois de 20260725150000
-- (0 linhas fora do formato), entao o VALIDATE abaixo pode ser rodado em
-- seguida, separado, sem travar escrita.
-- ---------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'candidatos_cpf_formato_check'
      AND conrelid = 'public.candidatos'::regclass
  ) THEN
    ALTER TABLE public.candidatos
      ADD CONSTRAINT candidatos_cpf_formato_check
      CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$') NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.candidatos VALIDATE CONSTRAINT candidatos_cpf_formato_check;
-- Se este VALIDATE falhar, significa que apareceu cpf fora do formato depois
-- do censo de 2026-07-25. Nesse caso, rodar antes:
--   select id, slug from public.candidatos
--   where cpf is not null and cpf !~ '^[0-9]{11}$';
-- e tratar cada linha, em vez de afrouxar a constraint.

-- ---------------------------------------------------------------------
-- O QUE ESTA MIGRATION DE PROPOSITO NAO FAZ
--
-- Nao mexe no gate public.is_public_attention_point. O laudo (achado V2, item 2
-- do patch-list) pede que a exigencia de verificacao passe a depender da
-- GRAVIDADE da afirmacao, e nao so de gerado_por = 'ia', porque foi por essa
-- porta que uma claim critica de curadoria com fonte inexistente chegou ao ar.
-- Mudar o gate altera o que o site mostra hoje e merece PR proprio, com
-- contagem previa de quantos pontos sairiam do ar, nao uma linha no fim de uma
-- migration de auditoria.
--
-- Tambem nao adiciona CHECK de formato de URL em pontos_atencao.fontes (item 4
-- do patch-list, os 52 casos de dominio nu). Motivo: a etapa 1B mostrou que 29
-- dos 38 pontos afetados nao tinham fonte a encontrar, e a correcao durável
-- passa por remodelar as claims agregadas de "Carreira politica", nao por
-- validar string. Uma constraint aplicada antes disso so trocaria dado ruim
-- visivel por insert bloqueado em silencio.
-- ---------------------------------------------------------------------

COMMIT;
