-- `cargo_canonico` deixa de carregar "Candidatura a", que é tipo_evento, não cargo.
--
-- Aplicada em 05/08/2026 depois do encerramento da sessão editorial que lia
-- `historico_politico`. O ensaio transacional e o readback remoto passaram.
--
-- ORIGEM
--
-- 185 linhas gravadas com o prefixo. `CARGOS_ELETIVOS`, em
-- `scripts/audit/lib/coverage-model.ts`, tem "Vereador" e não "Candidatura a
-- Vereador", então `declarouAoTse` dava falso e as colunas de dinheiro saíam
-- como "não se aplica" em vez de lacuna. O prefixo é redundante: a coluna
-- `tipo_evento` já diz 'candidatura'.
--
-- O defeito era ASSIMÉTRICO, que é o que o escondeu: "Candidatura a Deputado
-- Federal" já canonizava certo, porque a regra de deputado em
-- `canonicalCargo()` não é ancorada em `^`; "Candidatura a Vereador" não,
-- porque a de vereador é. Metade dos prefixos sumia sozinha.
--
-- EFEITO MEDIDO, não estimado
--
-- Régua rodada duas vezes contra o MESMO snapshot de produção de 05/08 (194
-- fichas publicáveis), com e sem normalização do prefixo:
--
--   células que mudam de estado : 2
--   fichas afetadas             : 1  (jarbas-soares)
--   financiamento : na -> missing
--   doadores      : na -> missing
--   índice da ficha: 75 -> 60
--
-- Só 1 ficha porque as outras 32 com o prefixo são salvas pelo `SQ_CANDIDATO`
-- do seed, que satisfaz `declarouAoTse` por outro caminho. A conta cresce com
-- ficha nova sem SQ, e é por isso que o conserto vale mesmo medindo 2 células:
-- o que está sendo corrigido é a regra, não as 2 células.
--
-- ⚠ ORDEM COM A 20260805132000: se a de jarbas-soares for aplicada ANTES desta,
-- as 2 células continuam mudando, porque `coverage-snapshot.sql` NÃO filtra
-- `despublicado_em` (achado registrado abaixo). Se aquele filtro for corrigido,
-- jarbas-soares passa a ter zero histórico e o efeito desta migration na régua
-- vira 0 células. Nos dois casos o conserto da regra segue valendo.
--
-- DUAS LINHAS NÃO SÃO NORMALIZADAS, E O MOTIVO IMPORTA
--
-- Existe UNIQUE (candidato_id, cargo_canonico, periodo_inicio). Normalizar
-- expõe 2 pares que são DUPLICATA REAL, criada pelo próprio prefixo: a linha
-- com prefixo escapou do índice que deveria tê-la barrado.
--
--   henrique-areas  2016  "Candidato a Prefeito"    (canônico "Prefeito")
--                         "Candidatura a Prefeito"  (canônico "Candidatura a Prefeito")
--   indira-xavier   2022  "Candidata a Governadora" (canônico "Governador")
--                         "Candidatura a Governador"(canônico "Candidatura a Governador")
--
-- Mesmo candidato, mesmo ano, mesmo partido, mesmo `tipo_evento`: é a mesma
-- candidatura gravada duas vezes, e a ficha mostra as duas hoje. As duas
-- redundantes são DESPUBLICADAS em vez de normalizadas, mantendo o
-- `cargo_canonico` com prefixo para não colidir no índice. Some duplicata
-- visível da ficha e nada é apagado.
BEGIN;

-- ---------------------------------------------------------------------------
-- Primeiro as duplicatas, senão o UPDATE de normalização quebra no índice.
--
-- @write tabela=historico_politico slug=henrique-areas campos=despublicado_em,despublicacao_motivo
-- @write tabela=historico_politico slug=indira-xavier campos=despublicado_em,despublicacao_motivo
UPDATE public.historico_politico h
SET despublicado_em = timestamptz '2026-08-05 12:00:00-03',
    despublicacao_motivo =
      'Duplicata da mesma candidatura (mesmo ano, partido e tipo_evento), que existia porque o prefixo "Candidatura a" no cargo_canonico escapava do UNIQUE (candidato_id, cargo_canonico, periodo_inicio). A linha sem prefixo continua publicada. cargo_canonico mantido com prefixo de proposito, para nao colidir no indice. Reversivel.'
FROM public.candidatos c
WHERE c.id = h.candidato_id
  AND (
    (c.slug = 'henrique-areas' AND h.periodo_inicio = 2016 AND h.partido = 'PCO')
    OR
    (c.slug = 'indira-xavier' AND h.periodo_inicio = 2022 AND h.partido = 'UP')
  )
  AND h.tipo_evento = 'candidatura'
  AND h.despublicado_em IS NULL
  AND h.cargo_canonico LIKE 'Candidatura a %'
  AND EXISTS (
    SELECT 1 FROM public.historico_politico gemea
    WHERE gemea.candidato_id = h.candidato_id
      AND gemea.periodo_inicio = h.periodo_inicio
      AND gemea.id <> h.id
      AND gemea.despublicado_em IS NULL
      AND gemea.cargo_canonico = regexp_replace(h.cargo_canonico, '^Candidatura a ', '')
      AND gemea.partido = h.partido
      AND gemea.tipo_evento = h.tipo_evento
  );

-- ---------------------------------------------------------------------------
-- Normalização. `regexp_replace` só toca o prefixo; o resto do texto fica.
--
-- Lote endereçado pelo literal do predicado; o `ref` é rótulo de curadoria.
-- @write tabela=historico_politico chave="Candidatura a " ref=prefixo-candidatura-cargo-canonico campos=cargo_canonico
UPDATE public.historico_politico
SET cargo_canonico = regexp_replace(cargo_canonico, '^Candidatura a ', '')
WHERE cargo_canonico LIKE 'Candidatura a %'
  AND despublicado_em IS NULL;

-- ---------------------------------------------------------------------------
-- Variante de caixa que também não casa com CARGOS_ELETIVOS ("Vice-Prefeito").
-- São 3 linhas: 1 que acabou de perder o prefixo e 2 que já estavam assim.
--
-- Lote endereçado pelo literal do predicado; o `ref` é rótulo de curadoria.
-- @write tabela=historico_politico chave=Vice-prefeito ref=prefixo-candidatura-cargo-canonico campos=cargo_canonico
UPDATE public.historico_politico
SET cargo_canonico = 'Vice-Prefeito'
WHERE cargo_canonico = 'Vice-prefeito'
  AND despublicado_em IS NULL;

-- ---------------------------------------------------------------------------
-- Conferência.
DO $$
DECLARE
  com_prefixo_visivel integer;
  duplicatas_despublicadas integer;
  vice_minusculo integer;
  colisoes integer;
BEGIN
  SELECT COUNT(*) INTO com_prefixo_visivel FROM public.historico_politico
   WHERE cargo_canonico LIKE 'Candidatura a %' AND despublicado_em IS NULL;
  IF com_prefixo_visivel <> 0 THEN
    RAISE EXCEPTION 'prefixo_candidatura: % linha(s) visiveis ainda com prefixo', com_prefixo_visivel;
  END IF;

  SELECT COUNT(*) INTO duplicatas_despublicadas
  FROM public.historico_politico h
  JOIN public.candidatos c ON c.id = h.candidato_id
  WHERE (
      (c.slug = 'henrique-areas' AND h.periodo_inicio = 2016 AND h.partido = 'PCO')
      OR
      (c.slug = 'indira-xavier' AND h.periodo_inicio = 2022 AND h.partido = 'UP')
    )
    AND h.tipo_evento = 'candidatura'
    AND h.cargo_canonico LIKE 'Candidatura a %'
    AND h.despublicado_em IS NOT NULL
    AND h.despublicacao_motivo LIKE 'Duplicata da mesma candidatura%';
  IF duplicatas_despublicadas <> 2 THEN
    RAISE EXCEPTION 'prefixo_candidatura: esperado 2 duplicatas despublicadas, encontrado %',
      duplicatas_despublicadas;
  END IF;

  SELECT COUNT(*) INTO vice_minusculo FROM public.historico_politico
   WHERE cargo_canonico = 'Vice-prefeito' AND despublicado_em IS NULL;
  IF vice_minusculo <> 0 THEN
    RAISE EXCEPTION 'prefixo_candidatura: % linha(s) ainda com Vice-prefeito minusculo', vice_minusculo;
  END IF;

  -- Nenhuma normalização pode ter criado par duplicado visível.
  SELECT COUNT(*) INTO colisoes FROM (
    SELECT candidato_id, cargo_canonico, periodo_inicio
      FROM public.historico_politico
     WHERE despublicado_em IS NULL AND cargo_canonico IS NOT NULL AND periodo_inicio IS NOT NULL
     GROUP BY 1, 2, 3 HAVING COUNT(*) > 1
  ) x;
  IF colisoes <> 0 THEN
    RAISE EXCEPTION 'prefixo_candidatura: % par(es) duplicado(s) visiveis apos normalizar', colisoes;
  END IF;
END $$;

COMMIT;

-- Verificação pós-aplicação (rodar manualmente):
--
--   select cargo_canonico, count(*) from historico_politico
--    where cargo_canonico ilike 'candidat%' group by 1 order by 2 desc;
--
--   npm run audit:cobertura   -- jarbas-soares: financiamento e doadores saem
--                             -- de "não se aplica" para lacuna
--
-- ACHADO REGISTRADO, fora do escopo desta migration:
--   `scripts/audit/coverage-snapshot.sql` monta o histórico SEM filtrar
--   `despublicado_em`, enquanto `src/lib/api.ts` filtra (`.is("despublicado_em",
--   null)`). A régua está medindo cobertura sobre linhas que a ficha pública não
--   mostra, incluindo as 11 já despublicadas por homônimo em 26/07 e as 2 desta
--   migration. Corrigir muda números da régua e merece PR própria, com o antes
--   e depois medido do mesmo jeito que esta.
