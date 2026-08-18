-- jarbas-soares: sai a candidatura do homônimo, entra a data de nascimento certa.
--
-- Aplicada em 05/08/2026 depois do encerramento da sessão editorial que lia
-- `historico_politico`. Os dois blocos DO $$ e o readback remoto passaram.
--
-- ORIGEM
--
-- A ficha pública é de JARBAS SOARES JÚNIOR, ex-procurador-geral de Justiça de
-- Minas Gerais, pré-candidato do PSB ao governo de MG. As duas únicas linhas de
-- `historico_politico` dele são de um homônimo:
--
--   2008, Candidatura a Vereador,      MG, PPS, SQ 47351
--   2020, Candidatura a Vice-prefeito, MG, PTB, SQ 130000743230
--
-- COMO O ERRO ENTROU: VALIDAÇÃO CIRCULAR
--
-- O backfill de CPF de 05/08 casou nome + data de nascimento e achou um "Jarbas
-- Soares" vice-prefeito 2020/MG. A `data_nascimento` que serviu de âncora
-- (1954-03-17) tem procedência TSE e quase certamente veio do MESMO casamento
-- por nome, da era anterior à guarda de identidade. Ou seja: o CPF do homônimo
-- confirmou a data que confirmou o CPF. O CPF foi revertido para NULL na hora
-- (linhas corretivas em `coleta_log`), mas as duas linhas de histórico ficaram,
-- e são elas que estão na ficha pública agora.
--
-- A DATA CERTA, COM FONTE RASTREÁVEL
--
-- Ministério Público de Minas Gerais, galeria institucional de
-- procuradores-gerais de Justiça, ficha "JARBAS SOARES JÚNIOR,
-- PROCURADOR-GERAL DE JUSTIÇA 2004 a 2008":
--
--   https://www.mpmg.mp.br/lumis/portal/file/fileDownload.jsp?fileId=8A9480678602D08F018636EF49986C71
--
--   NASCIMENTO: Montes Claros/MG - 06/09/1964
--   FILIAÇÃO:   Sebastião Jarbas Soares, Rosalice Caetano Soares
--   CARREIRA:   Promotor 1990-2001, Procurador 2001,
--               Procurador-Geral de Justiça 2004-2008 e 2020-2022
--
-- Documento do próprio MPMG, não imprensa. Bate com a `naturalidade` que a
-- ficha já tinha ("Montes Claros (MG)"), que é confirmação independente, vinda
-- de outra coleta.
--
-- A data nova também FECHA o diagnóstico do homônimo, em vez de só substituir
-- um palpite por outro: nascido em 06/09/1964, ele tinha 43 anos em 2008 e
-- estava no meio do primeiro mandato de procurador-geral (2004-2008), cargo
-- incompatível com candidatura a vereador; e em 2020 tomou posse como
-- procurador-geral de novo, no mesmo ano da suposta candidatura a vice-prefeito.
-- Membro do Ministério Público é constitucionalmente vedado de exercer
-- atividade político-partidária (CF art. 128 §5º II "e").
--
-- POR QUE DESPUBLICAR E NÃO DELETAR: mesma razão da migration
-- 20260726160000. Apagar linha de histórico é afirmar que a candidatura não é
-- de ninguém; ela é de uma pessoa real, o homônimo. Fica no banco com o motivo.
--
-- O QUE ACONTECE COM A FICHA: ela passa a ter ZERO linha de trajetória. É o
-- resultado correto e honesto. As duas carreiras reais dele (procurador-geral
-- 2004-2008 e 2020-2022) NÃO são inseridas aqui de propósito: cargo de MP não é
-- mandato eletivo nem candidatura, entra com `tipo_evento` próprio, e criar
-- linha nova é decisão editorial separada, com o texto revisado por quem
-- publica. A fonte acima já está registrada para quem for fazer isso.
BEGIN;

-- ---------------------------------------------------------------------------
-- @write tabela=historico_politico slug=jarbas-soares campos=despublicado_em,despublicacao_motivo
UPDATE public.historico_politico h
SET despublicado_em = timestamptz '2026-08-05 12:00:00-03',
    despublicacao_motivo =
      'Candidatura de homonimo. A ficha e de Jarbas Soares Junior, ex-procurador-geral de Justica de MG (MPMG, nascimento 06/09/1964, Montes Claros). Entrou por validacao circular: o casamento por nome+nascimento usou uma data_nascimento que ela mesma tinha vindo de casamento por nome, na era anterior a guarda de identidade. Alem disso, membro do Ministerio Publico e vedado de atividade politico-partidaria (CF art. 128 par. 5 II e), e em 2008 e 2020 ele era procurador-geral de Justica. Reversivel.'
FROM public.candidatos c
WHERE c.id = h.candidato_id
  AND c.slug = 'jarbas-soares'
  AND h.despublicado_em IS NULL
  AND h.proveniencia = 'tse'
  AND h.periodo_inicio IN (2008, 2020);

-- ---------------------------------------------------------------------------
-- A data suspeita sai. Não vira NULL: há fonte oficial rastreável para a certa.
--
-- Se a apuração da fonte tivesse falhado, o certo seria NULL, porque manter
-- 1954-03-17 é publicar a data de outra pessoa. Não foi o caso.
--
-- @write tabela=candidatos slug=jarbas-soares campos=data_nascimento,fonte_dados,ultima_atualizacao
UPDATE public.candidatos
SET data_nascimento = date '1964-09-06',
    fonte_dados = (
      SELECT ARRAY(SELECT DISTINCT unnest(coalesce(fonte_dados, ARRAY[]::text[]) || ARRAY['mpmg']))
    ),
    ultima_atualizacao = now()
WHERE slug = 'jarbas-soares'
  AND data_nascimento IS DISTINCT FROM date '1964-09-06';

-- ---------------------------------------------------------------------------
-- Rastro da decisão, na mesma tabela que registra tentativa de coleta.
-- `coleta_log` é append-only: correção é linha nova, nunca UPDATE.
--
-- Endereçada pelo slug do candidato no `alvo`/`WHERE`; o `ref` abaixo é o
-- rótulo da fila de curadoria e não aparece no SQL.
-- @write tabela=coleta_log chave=jarbas-soares ref=jarbas-soares-identidade campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao
INSERT INTO public.coleta_log (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao)
SELECT 'mpmg', 'candidato', 'jarbas-soares', c.id, 'encontrado', 1,
       'data_nascimento reapurada em fonte oficial: MPMG, galeria de procuradores-gerais, ficha Jarbas Soares Junior, NASCIMENTO Montes Claros/MG 06/09/1964. Substitui 1954-03-17, que tinha procedencia TSE por casamento de nome com homonimo.',
       'https://www.mpmg.mp.br/lumis/portal/file/fileDownload.jsp?fileId=8A9480678602D08F018636EF49986C71',
       'manual:jarbas-homonimo-20260805'
FROM public.candidatos c WHERE c.slug = 'jarbas-soares';

-- ---------------------------------------------------------------------------
-- Conferência.
DO $$
DECLARE
  visiveis integer;
  despublicadas integer;
  nascimento date;
BEGIN
  SELECT COUNT(*) INTO visiveis
    FROM public.historico_politico h JOIN public.candidatos c ON c.id = h.candidato_id
   WHERE c.slug = 'jarbas-soares' AND h.despublicado_em IS NULL;
  IF visiveis <> 0 THEN
    RAISE EXCEPTION 'jarbas_homonimo: esperado 0 linha visivel, encontrado %', visiveis;
  END IF;

  SELECT COUNT(*) INTO despublicadas
    FROM public.historico_politico h JOIN public.candidatos c ON c.id = h.candidato_id
   WHERE c.slug = 'jarbas-soares' AND h.despublicado_em IS NOT NULL;
  IF despublicadas <> 2 THEN
    RAISE EXCEPTION 'jarbas_homonimo: esperado 2 linhas despublicadas, encontrado %', despublicadas;
  END IF;

  SELECT data_nascimento INTO nascimento FROM public.candidatos WHERE slug = 'jarbas-soares';
  IF nascimento <> date '1964-09-06' THEN
    RAISE EXCEPTION 'jarbas_homonimo: data_nascimento esperada 1964-09-06, encontrada %', nascimento;
  END IF;
END $$;

COMMIT;

-- Reversão (se a apuração mostrar que as candidaturas são mesmo dele):
--
--   update historico_politico set despublicado_em = null, despublicacao_motivo = null
--    where candidato_id = (select id from candidatos where slug = 'jarbas-soares');
--
-- PENDENTE, fora do escopo desta migration:
--   - inserir a trajetória real (procurador-geral de Justiça de MG, 2004-2008 e
--     2020-2022), com `tipo_evento` de cargo não eletivo e texto editorial.
--   - `nome_completo` está "Jarbas Soares", e o nome civil é "Jarbas Soares
--     Júnior". Mexer nisso altera o guard de relevância de notícias, então vai
--     em PR própria, com a medição do efeito.
