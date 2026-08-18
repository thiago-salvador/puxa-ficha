-- Despublicacao de linhas de historico politico atribuidas por homonimo.
-- Aprovada pelo mantenedor em 26/07/2026.
--
-- ORIGEM
--
-- Apurando a pendencia 1 do fechamento da auditoria de integridade ("CPF
-- divergente de jeronimo"), que estava registrada sem o efeito descrito,
-- apareceu o efeito: a ficha exibe candidaturas de outra pessoa.
--
-- O mecanismo esta em scripts/lib/tse-resolver.ts, que casa cada linha do TSE
-- em tres degraus: SQ_CANDIDATO, depois CPF, depois NOME. Quando o CPF no
-- banco diverge do oficial, o segundo degrau falha e a linha cai no casamento
-- por nome, que junta homonimos. O CPF errado nao e campo cosmetico: ele
-- desliga a ancora que separa pessoas de mesmo nome.
--
-- ESCOPO: SO O QUE TEM COLISAO LOGICA
--
-- A consulta que procura "candidatura a Vereador em sigla diferente da atual"
-- devolve 8 fichas publicadas, mas troca de partido real produz exatamente a
-- mesma assinatura. Olhando trajetoria a trajetoria, 5 das 8 sao progressoes
-- coerentes e ficam INTOCADAS: clecio-luis, dr-daniel, adailton-furia,
-- cleitinho e marcos-rogerio.
--
-- Esta migration mexe apenas onde ha colisao logica, ou seja, onde a mesma
-- pessoa apareceria disputando dois cargos incompativeis na mesma eleicao.
-- professora-dorinha fica de fora por enquanto: e suspeita (duas candidaturas
-- a vereadora suplente, em 2000 e 2016, sendo que em 2016 ela era deputada
-- federal), mas nao ha colisao que feche o diagnostico sem consulta ao TSE.
--
-- POR QUE DESPUBLICAR E NAO DELETAR
--
-- Apagar linha de historico e afirmar que uma candidatura nao e daquela
-- pessoa. Errar nessa direcao tambem erra sobre pessoa real, escondendo
-- mandato ou candidatura verdadeira. As linhas ficam no banco com o motivo
-- gravado, e voltam com um UPDATE.
--
-- O par de colunas espelha o que a migration 20260725153000 fez em
-- pontos_atencao, para o mecanismo de despublicacao ser o mesmo nas duas
-- tabelas.
BEGIN;

ALTER TABLE public.historico_politico
  ADD COLUMN IF NOT EXISTS despublicacao_motivo text,
  ADD COLUMN IF NOT EXISTS despublicado_em timestamptz;

COMMENT ON COLUMN public.historico_politico.despublicado_em IS
  'Quando preenchido, a linha nao aparece na ficha publica. Usado para candidatura atribuida por homonimo, sem deletar o dado.';

CREATE INDEX IF NOT EXISTS idx_historico_politico_despublicado
  ON public.historico_politico (despublicado_em)
  WHERE despublicado_em IS NOT NULL;

-- ---------------------------------------------------------------------------
-- CASO 1: jeronimo (PT/BA), 6 candidaturas a Vereador.
--
-- Tres sinais somados, nao apenas o partido:
--
--   (a) Colisao logica em 2012: a mesma pessoa aparece como candidata a
--       Vice-Prefeito pelo PT e a Vereador pelo PTN na mesma eleicao.
--   (b) Seis siglas em vinte anos (PHS, PSDB, DEM, PTN, PMN, MDB), todas fora
--       do campo do PT, para um quadro que foi Secretario de Desenvolvimento
--       Rural (2015-2018) e Secretario de Educacao (2019-2022) em governos do
--       PT na Bahia, e se elegeu governador pelo partido.
--   (c) Nenhuma das seis foi eleita: todas suplente ou nao eleito, assinatura
--       tipica de homonimo generico.
--
-- Ficam publicadas: Vice-Prefeito 2012 (PT), as duas secretarias e o mandato
-- de governador desde 2023.
UPDATE public.historico_politico
SET despublicado_em = timestamptz '2026-07-26 12:00:00-03',
    despublicacao_motivo = 'Candidatura atribuida por homonimo: o CPF divergente no cadastro desligou o casamento por CPF no tse-resolver e a linha veio do casamento por nome. Colisao logica em 2012 (Vice-Prefeito pelo PT e Vereador pelo PTN na mesma eleicao), seis siglas fora do campo do PT em vinte anos e nenhuma eleicao vencida. Reversivel.'
WHERE id IN (
  '6d4f5c3c-cac9-4a79-8d87-6b7c0f3c357c', -- 2000, Vereador, PHS, suplente
  '109ad758-396c-4a60-ba77-559820b1a377', -- 2004, Vereador, PSDB, suplente
  'c50f793b-14bc-45df-843d-bffd53cc608a', -- 2008, Vereador, DEM, suplente
  '66900d79-edfc-489d-bc43-946a65bf3811', -- 2012, Vereador, PTN, suplente (colide com Vice-Prefeito PT)
  '48f294ed-1900-44b4-a84f-1eb25023f6f8', -- 2016, Vereador, PMN
  'cc494419-d7df-459a-b2c0-c71245d7571e'  -- 2020, Vereador, MDB, nao eleito
) AND despublicado_em IS NULL;

-- ---------------------------------------------------------------------------
-- CASO 2: maria-da-consolacao (PSOL/MG), 2 linhas com colisao.
--
-- Duas colisoes independentes:
--   2012: Prefeito pelo PSOL E Vice-Prefeito pelo PSC na mesma eleicao.
--   2016: Prefeito pelo PSOL E Vereador pelo PT do B na mesma eleicao.
--
-- As linhas em PSOL sao coerentes com a trajetoria dela e ficam publicadas.
-- Saem apenas as duas que colidem.
UPDATE public.historico_politico
SET despublicado_em = timestamptz '2026-07-26 12:00:00-03',
    despublicacao_motivo = 'Candidatura atribuida por homonimo: colide com outra candidatura da mesma pessoa na mesma eleicao (2012, Prefeito pelo PSOL; 2016, Prefeito pelo PSOL). Ninguem disputa Prefeito e Vice-Prefeito, nem Prefeito e Vereador, no mesmo pleito. Reversivel.'
WHERE id IN (
  'cebc2ce5-80d4-4ea7-aae9-47ffc44f1263', -- 2012, Vice-Prefeito, PSC
  '88b8237f-6989-48b3-a0fb-41542ace8e8e'  -- 2016, Vereador, PT DO B
) AND despublicado_em IS NULL;

-- ---------------------------------------------------------------------------
-- Conferencia.
DO $$
DECLARE
  despublicadas integer;
  jeronimo_restantes integer;
  intocados integer;
BEGIN
  SELECT COUNT(*) INTO despublicadas
  FROM public.historico_politico WHERE despublicado_em IS NOT NULL;

  IF despublicadas <> 8 THEN
    RAISE EXCEPTION 'despublicar_historico_homonimo: esperado 8 linhas despublicadas, encontrado %', despublicadas;
  END IF;

  -- O que sobra na ficha do jeronimo tem de ser a trajetoria coerente:
  -- Vice-Prefeito 2012, duas secretarias e o mandato de governador.
  SELECT COUNT(*) INTO jeronimo_restantes
  FROM public.historico_politico h
  JOIN public.candidatos c ON c.id = h.candidato_id
  WHERE c.slug = 'jeronimo' AND h.despublicado_em IS NULL;

  IF jeronimo_restantes <> 4 THEN
    RAISE EXCEPTION 'despublicar_historico_homonimo: esperado 4 linhas visiveis em jeronimo, encontrado %', jeronimo_restantes;
  END IF;

  -- Os cinco casos de troca de partido legitima nao podem ter sido tocados.
  SELECT COUNT(*) INTO intocados
  FROM public.historico_politico h
  JOIN public.candidatos c ON c.id = h.candidato_id
  WHERE c.slug IN ('clecio-luis', 'dr-daniel', 'adailton-furia', 'cleitinho', 'marcos-rogerio')
    AND h.despublicado_em IS NOT NULL;

  IF intocados <> 0 THEN
    RAISE EXCEPTION 'despublicar_historico_homonimo: % linha(s) de troca de partido legitima foram despublicadas por engano', intocados;
  END IF;
END $$;

COMMIT;

-- Verificacao pos-aplicacao (rodar manualmente):
--
--   select c.slug, h.periodo_inicio, h.cargo, h.partido, h.despublicado_em
--     from public.historico_politico h
--     join public.candidatos c on c.id = h.candidato_id
--    where c.slug in ('jeronimo', 'maria-da-consolacao')
--    order by c.slug, h.periodo_inicio;
--
-- Reversao (se a apuracao mostrar que a candidatura e mesmo da pessoa):
--
--   update public.historico_politico
--      set despublicado_em = null, despublicacao_motivo = null
--    where id = '<uuid>';
--
-- PENDENTE, fora do escopo desta migration:
--   - CPF oficial do jeronimo no TSE, para reancorar a ficha e reprocessar.
--   - professora-dorinha: duas candidaturas a vereadora suplente (2000 PPB,
--     2016 PMDB), sendo que em 2016 ela era deputada federal. Suspeito, sem
--     colisao que feche o diagnostico. Precisa de consulta ao TSE.
