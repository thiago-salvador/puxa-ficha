-- Registra na chapa de governador do MA o vice que o TSE passou a listar como
-- vigente, no lugar do que passou a constar como substituido.
--
-- NAO aplicar em producao sem autorizacao nomeada do Thiago.
--
-- =====================================================================
-- O DEFEITO, MEDIDO
-- =====================================================================
--
-- A auditoria `data-freshness-audit.yml` (run 33746777166, schedule de
-- 03/09/2026 10:55 UTC) reprova com `candidacies.status = review_required` e um
-- item de kind `replacement`:
--
--   slot:      MA:VICE GOVERNADOR:100001800701
--   oficial:   sq_candidato 100002554354, PCB, VICE GOVERNADOR, MA, "GATO FELIX"
--   publicado: sq_candidato 100002544074, PCB, VICE GOVERNADOR, MA, "BARTOLOMEU"
--   detalhe:   "BARTOLOMEU foi substituido por GATO FELIX"
--
-- O lado publicado e a linha `2026:MA:reginaldo-lima-brauno` de
-- `public.chapas_2026`, medida em producao em 03/09/2026:
--
--   vice_sq_candidato          100002544074
--   vice_nome_urna             BARTOLOMEU
--   vice_nome_completo         BARTOLOMEU MOREIRA
--   vice_partido_sigla         PCB
--   vice_candidato_id          NULL
--   tse_situacao_vice_codigo   -3
--   fonte_sha256               eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27
--   snapshot_em                2026-08-28T01:58:24.127+00
--
-- =====================================================================
-- A FONTE, E POR QUE O CSV SOZINHO NAO BASTA
-- =====================================================================
--
-- Pacote oficial consulta_cand_2026.zip, baixado da CDN do TSE em
-- 2026-09-03T11:00:01.358Z:
--
--   url:            https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip
--   Last-Modified:  Wed, 02 Sep 2026 22:34:58 GMT
--   bytes:          3153931
--   sha256:         b1b2613e246b85b7c3e002c3625232aac6abf5994a3639f1c834d6fda39b9217
--
-- Em `consulta_cand_2026_MA.csv` (latin1, separador ';', DT_GERACAO 02/09/2026
-- 19:31:21) a coligacao 100001800701 (PARTIDO ISOLADO, PCB) tem TRES linhas:
--
--   100002544073  GOVERNADOR       REGINALDO LIMA  PCB  CD_SITUACAO_CANDIDATURA -3 (#NE)
--   100002544074  VICE-GOVERNADOR  BARTOLOMEU      PCB  CD_SITUACAO_CANDIDATURA -3 (#NE)
--   100002554354  VICE-GOVERNADOR  GATO FELIX      PCB  CD_SITUACAO_CANDIDATURA -3 (#NE)
--
-- Repare no que o CSV NAO diz: as duas linhas de vice tem exatamente a mesma
-- situacao (-3 / #NE) e a mesma totalizacao (-1 / #NULO). O pacote de resultado
-- consolidado nao carrega marcador de substituicao, entao ele sozinho so prova
-- que ha DUAS vices na mesma coligacao, nunca qual delas esta valendo. Deduzir
-- "a de SQ maior e a substituta" seria ler ordem de emissao como se fosse fato
-- juridico; a propria auditoria so chega em `replacement` porque o mapa
-- `officialBySlot` de scripts/lib/data-freshness/candidaturas.ts guarda o
-- ultimo registro do slot na ordenacao, e ordem de iteracao nao e evidencia.
--
-- Quem decide isso neste repo e o DivulgaCandContas, e a regra ja esta escrita
-- em data/divulgacand-vices-20260828.json: "situacaoVice 3 e substituida;
-- exatamente uma alternativa nao 3 pode ser publicada". Consultado em
-- 03/09/2026 para o titular 100002544073 (REGINALDO LIMA, situacao "Deferido",
-- dataUltimaAtualizacao 2026-09-02 12:29):
--
--   GET https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MA/20322002026/candidato/100002544073
--
--   vices[0]: sq_CANDIDATO 100002554354, nm_URNA "GATO FELIX",  situacaoVice 1
--   vices[1]: sq_CANDIDATO 100002544074, nm_URNA "BARTOLOMEU",  situacaoVice 3
--
-- situacaoVice 3 = substituida. Exatamente uma alternativa nao 3, que e GATO
-- FELIX. E a mesma regra que resolveu os sete casos de 28/08 no arquivo de
-- resolucoes; a diferenca e que aquele arquivo esta pinado no pacote de 27/08 e
-- nao cobre o MA, porque em 27/08 a coligacao ainda tinha uma vice so.
--
-- Os valores que entram na linha vem do CSV, linha SQ_CANDIDATO 100002554354:
--
--   NM_CANDIDATO             FELIX LIMA E SILVA
--   NM_URNA_CANDIDATO        GATO FELIX
--   SG_PARTIDO               PCB
--   CD_SITUACAO_CANDIDATURA  -3   (DS_SITUACAO_CANDIDATURA #NE)
--   SQ_COLIGACAO             100001800701
--   DS_CARGO                 VICE-GOVERNADOR
--
-- =====================================================================
-- O QUE ESTA MIGRATION FAZ, E O QUE ELA NAO FAZ
-- =====================================================================
--
-- Faz: a linha `2026:MA:reginaldo-lima-brauno` passa a descrever GATO FELIX em
-- vez de BARTOLOMEU. Sete colunas de uma linha, das 220 da tabela:
-- `vice_sq_candidato`, `vice_nome_urna`, `vice_nome_completo`,
-- `vice_partido_sigla`, `tse_situacao_vice_codigo`, `fonte_sha256` e
-- `snapshot_em`. Das sete, `vice_partido_sigla` e `tse_situacao_vice_codigo`
-- recebem o mesmo texto que ja tinham ('PCB' e '-3'): elas entram no SET porque
-- passam a descrever OUTRA pessoa, e o valor lido no CSV para essa outra pessoa
-- e que coincide.
--
-- Toca `fonte_sha256` e `snapshot_em`, ao contrario da 20260903130000. Aquela
-- correcao mexeu numa coluna cosmetica e recusou carimbar a proveniencia porque
-- carimbar afirmaria que as 28 colunas vieram do pacote novo, o que seria falso
-- para 27 delas. Aqui a afirmacao e verdadeira, e a pre-condicao abaixo a prova
-- coluna por coluna: `eleicao_codigo`, `eleicao_data`, `uf`, `cargo_titular`,
-- `sq_coligacao`, `tse_situacao_codigo`, `tse_situacao_titular_codigo`,
-- `tipo_agremiacao`, `composicao`, `titular_sq_candidato`,
-- `titular_nome_completo`, `titular_nome_urna` e `titular_partido_sigla` ja
-- estao no banco exatamente com o valor do pacote de 02/09. Depois do UPDATE,
-- a linha inteira e o pacote de 02/09, e o carimbo diz a verdade. Efeito
-- colateral aceito e declarado: `chapas_2026` passa a ter dois valores
-- distintos em `fonte_sha256` (219 linhas no pacote de 27/08, uma no de 02/09).
-- Nenhum consumidor exige hash unico; src/lib/candidatura-proveniencia.ts so
-- compara `fonte_sha256` contra o pacote pos-registro de 15/08, e nenhum dos
-- dois valores e aquele.
--
-- NAO toca `vice_candidato_id`, que segue NULL. Vice de chapa estadual nao tem
-- ficha publica propria neste catalogo, e GATO FELIX nao tem perfil a vincular.
--
-- NAO toca titular, nem `alternativas_oficiais` (segue '[]'), nem nenhuma das
-- outras 219 linhas. A pos-condicao prova isso com digest de linha inteira.
--
-- NAO cria a linha `2026:MA:reginaldo-lima-brauno:vice-substituido:100002544074`
-- que scripts/gerar-chapas-2026-20260827.ts produziria para BARTOLOMEU. Criar
-- linha nova e trabalho de snapshot da tabela inteira, com pacote, SHA-256,
-- arquivo congelado em data/ e resolucao de vices propria, nao de uma correcao
-- pontual endereçada por chave.
--
-- Consequencia medida disso, e o motivo de ela estar escrita aqui em vez de
-- descoberta na proxima rodada: esta migration NAO devolve a auditoria para
-- `ok`. Rodando `compareCandidacies` do proprio repo contra os tres registros
-- oficiais do slot, com o mesmo cenario de antes e de depois:
--
--   hoje:            review_required, 1 replacement  (BARTOLOMEU publicado)
--   com esta fix:    review_required, 1 inclusion    (BARTOLOMEU oficial, nao publicado)
--   com a fix + a linha :vice-substituido: de BARTOLOMEU:  ok
--
-- Ou seja: o que esta migration conserta e o catalogo publicar como vice
-- vigente alguem que o TSE marca como substituido, que e o defeito que aparece
-- na ficha. O item residual de `inclusion` e outro trabalho, o do snapshot, e
-- ele fica honestamente aberto ate la.
BEGIN;

-- ---------------------------------------------------------------------------
-- Pre-imagem estrutural: contagem e digest de TODAS as outras linhas da tabela,
-- mais o digest da propria linha alvo sem as sete colunas que o UPDATE toca.
-- A pos-condicao compara os tres contra o estado final. Digest de linha
-- inteira, nao so das colunas de interesse: um UPDATE largo demais por engano
-- muda qualquer coluna, e um guard que so olha o que a migration pretendia
-- mexer nao pega o engano que ela nao pretendia.
CREATE TEMP TABLE chapas_ma_vice_snapshot ON COMMIT DROP AS
SELECT
  (SELECT count(*)::bigint FROM public.chapas_2026 ch
    WHERE ch.chave <> '2026:MA:reginaldo-lima-brauno') AS outras_count,
  (SELECT md5(coalesce(string_agg(row_to_json(ch)::text, '' ORDER BY ch.chave), ''))
     FROM public.chapas_2026 ch
    WHERE ch.chave <> '2026:MA:reginaldo-lima-brauno') AS outras_digest,
  (SELECT md5(coalesce(string_agg(
            (to_jsonb(ch) - ARRAY['vice_sq_candidato','vice_nome_urna','vice_nome_completo',
                                  'vice_partido_sigla','tse_situacao_vice_codigo',
                                  'fonte_sha256','snapshot_em']::text[])::text, ''), ''))
     FROM public.chapas_2026 ch
    WHERE ch.chave = '2026:MA:reginaldo-lima-brauno') AS alvo_resto_digest;

DO $precondition$
DECLARE
  alvo_existe boolean;
  alvo_exato integer;
  substituto_em_uso integer;
  recibo_forward integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.chapas_2026 WHERE chave = '2026:MA:reginaldo-lima-brauno'
  ) INTO alvo_existe;

  -- Replay linear em banco vazio: a tabela existe (o schema de 20260813040000
  -- a cria) mas nenhum snapshot de chapas aplicou, entao a linha nao existe e a
  -- correcao e no-op. Fora desse caso, todo guard abaixo e obrigatorio.
  IF NOT alvo_existe THEN
    RAISE NOTICE 'chapas ma vice: linha 2026:MA:reginaldo-lima-brauno ausente (replay); correcao ignorada';
    RETURN;
  END IF;

  -- Pre-imagem exata. As colunas de vice sao o defeito; as de titular, cargo,
  -- coligacao e situacao entram porque e delas que sai o direito de carimbar
  -- `fonte_sha256` e `snapshot_em`: se qualquer uma divergir do pacote de
  -- 02/09, o carimbo passaria a afirmar coisa que a linha nao sustenta, e o
  -- certo e abortar.
  SELECT count(*) INTO alvo_exato
  FROM public.chapas_2026
  WHERE chave = '2026:MA:reginaldo-lima-brauno'
    AND uf = 'MA'
    AND cargo_titular = 'Governador'
    AND eleicao_codigo = '6259'
    AND eleicao_data = DATE '2026-10-04'
    AND sq_coligacao = '100001800701'
    AND identidade_status = 'confirmada'
    AND tipo_agremiacao = 'PARTIDO ISOLADO'
    AND composicao = 'PCB'
    AND tse_situacao_codigo = '#NE'
    AND tse_situacao_titular_codigo = '-3'
    AND tse_situacao_vice_codigo = '-3'
    AND titular_sq_candidato = '100002544073'
    AND titular_nome_completo = 'REGINALDO LIMA BRAUNO'
    AND titular_nome_urna = 'REGINALDO LIMA'
    AND titular_partido_sigla = 'PCB'
    AND vice_sq_candidato = '100002544074'
    AND vice_nome_urna = 'BARTOLOMEU'
    AND vice_nome_completo = 'BARTOLOMEU MOREIRA'
    AND vice_partido_sigla = 'PCB'
    AND vice_candidato_id IS NULL
    AND alternativas_oficiais = '[]'::jsonb
    AND fonte_sha256 = 'eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27'
    AND snapshot_em = TIMESTAMPTZ '2026-08-28T01:58:24.127Z';

  -- O SQ do substituto nao pode ja estar publicado em lugar nenhum: se estiver,
  -- alguem ja mexeu nisso por outro caminho e escrever de novo duplicaria.
  SELECT count(*) INTO substituto_em_uso
  FROM public.chapas_2026
  WHERE vice_sq_candidato = '100002554354' OR titular_sq_candidato = '100002554354';

  SELECT count(*) INTO recibo_forward
  FROM public.coleta_log WHERE execucao = 'migration:20260903140000';

  IF alvo_exato <> 1 OR substituto_em_uso <> 0 OR recibo_forward <> 0 THEN
    RAISE EXCEPTION 'chapas ma vice: precondicao divergiu (alvo=%, substituto=%, recibo=%)',
      alvo_exato, substituto_em_uso, recibo_forward;
  END IF;
END
$precondition$;

-- ---------------------------------------------------------------------------
-- Recibo de pre-imagem, ANTES de qualquer escrita. `detalhe` guarda tres coisas
-- em JSON:
--
--   linhas         a linha alvo INTEIRA, nao so os campos trocados. E dela que
--                  o rollback tira os valores a restaurar, e e ela que preserva
--                  a trilha: depois do UPDATE, BARTOLOMEU so existe aqui.
--   outras_count   quantas outras linhas a tabela tinha, e
--   outras_digest  o hash agregado delas.
--
-- Os dois ultimos existem para o readback, que roda depois e sozinho: sem uma
-- medida do "antes" gravada no banco, um readback so consegue afirmar que a
-- linha alvo esta certa, e nao que o resto da tabela ficou intacto.
--
-- Vocabulario de coleta_log, medido em producao em 03/09/2026: escopo em
-- {candidato, territorio, global}; resultado com volume coerente ('encontrado'
-- exige > 0, 'vazio_confirmado' exige = 0); natureza em {coleta, escrita};
-- candidato_id so em escopo 'candidato', e aqui ele fica NULL de proposito,
-- porque nem o vice antigo nem o novo tem ficha vinculada
-- (vice_candidato_id IS NULL). Escopo 'territorio' com alvo em MA e a leitura
-- honesta: a troca pertence a uma chapa estadual, nao a uma ficha.
--
-- O `HAVING` faz a idempotencia: sem ele, uma segunda execucao filtraria as
-- linhas pelo NOT EXISTS e ainda assim gravaria um recibo vazio, porque
-- agregacao sem GROUP BY sempre devolve uma linha.
-- @write tabela=coleta_log ref=migration:20260903140000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
SELECT 'tse-chapas-2026', 'territorio', 'chapas_2026:MA:vice_substituicao',
       CASE WHEN count(*) > 0 THEN 'encontrado' ELSE 'vazio_confirmado' END,
       count(*)::integer,
       jsonb_build_object(
         'linhas', coalesce(jsonb_agg(to_jsonb(ch) ORDER BY ch.chave), '[]'::jsonb),
         'outras_count', (SELECT count(*) FROM public.chapas_2026 o
                           WHERE o.chave <> '2026:MA:reginaldo-lima-brauno'),
         'outras_digest', (SELECT md5(coalesce(string_agg(row_to_json(o)::text, '' ORDER BY o.chave), ''))
                             FROM public.chapas_2026 o
                            WHERE o.chave <> '2026:MA:reginaldo-lima-brauno')
       )::text,
       'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
       'migration:20260903140000',
       'escrita'
FROM public.chapas_2026 ch
WHERE ch.chave = '2026:MA:reginaldo-lima-brauno'
  AND ch.vice_sq_candidato = '100002544074'
HAVING NOT EXISTS (
  SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260903140000'
);

-- ---------------------------------------------------------------------------
-- A troca. O WHERE carrega a ancora da pre-imagem de proposito: chave, SQ do
-- vice antigo e SQ do titular. Assim o statement e auto-limitante, e nao
-- depende so do guard acima para nao alcancar linha errada.
-- @write tabela=chapas_2026 ref=chapas-ma-vice-20260903 chave="2026:MA:reginaldo-lima-brauno" campos=vice_sq_candidato,vice_nome_urna,vice_nome_completo,vice_partido_sigla,tse_situacao_vice_codigo,fonte_sha256,snapshot_em
UPDATE public.chapas_2026
SET vice_sq_candidato = '100002554354',
    vice_nome_urna = 'GATO FELIX',
    vice_nome_completo = 'FELIX LIMA E SILVA',
    vice_partido_sigla = 'PCB',
    tse_situacao_vice_codigo = '-3',
    fonte_sha256 = 'b1b2613e246b85b7c3e002c3625232aac6abf5994a3639f1c834d6fda39b9217',
    snapshot_em = TIMESTAMPTZ '2026-09-03T11:00:01.358Z'
WHERE chave = '2026:MA:reginaldo-lima-brauno'
  AND titular_sq_candidato = '100002544073'
  AND vice_sq_candidato = '100002544074';

DO $postcondition$
DECLARE
  alvo_corrigido integer;
  sobrou_antigo integer;
  recibo_forward integer;
  volume_recibo integer;
  outras_count bigint;
  outras_digest text;
  alvo_resto_digest text;
  antes_outras_count bigint;
  antes_outras_digest text;
  antes_alvo_resto_digest text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chapas_2026 WHERE chave = '2026:MA:reginaldo-lima-brauno'
  ) THEN
    RETURN;
  END IF;

  -- Exatamente uma linha ficou com o vice novo, com os sete valores do pacote
  -- de 02/09, e o vinculo de ficha continua sem existir.
  SELECT count(*) INTO alvo_corrigido
  FROM public.chapas_2026
  WHERE chave = '2026:MA:reginaldo-lima-brauno'
    AND vice_sq_candidato = '100002554354'
    AND vice_nome_urna = 'GATO FELIX'
    AND vice_nome_completo = 'FELIX LIMA E SILVA'
    AND vice_partido_sigla = 'PCB'
    AND tse_situacao_vice_codigo = '-3'
    AND vice_candidato_id IS NULL
    AND fonte_sha256 = 'b1b2613e246b85b7c3e002c3625232aac6abf5994a3639f1c834d6fda39b9217'
    AND snapshot_em = TIMESTAMPTZ '2026-09-03T11:00:01.358Z';

  -- O SQ da vice substituida nao pode sobrar em nenhuma linha da tabela.
  SELECT count(*) INTO sobrou_antigo
  FROM public.chapas_2026 WHERE vice_sq_candidato = '100002544074';

  SELECT count(*) INTO recibo_forward
  FROM public.coleta_log WHERE execucao = 'migration:20260903140000';

  SELECT volume INTO volume_recibo
  FROM public.coleta_log WHERE execucao = 'migration:20260903140000';

  SELECT count(*)::bigint,
         md5(coalesce(string_agg(row_to_json(ch)::text, '' ORDER BY ch.chave), ''))
    INTO outras_count, outras_digest
  FROM public.chapas_2026 ch
  WHERE ch.chave <> '2026:MA:reginaldo-lima-brauno';

  SELECT md5(coalesce(string_agg(
           (to_jsonb(ch) - ARRAY['vice_sq_candidato','vice_nome_urna','vice_nome_completo',
                                 'vice_partido_sigla','tse_situacao_vice_codigo',
                                 'fonte_sha256','snapshot_em']::text[])::text, ''), ''))
    INTO alvo_resto_digest
  FROM public.chapas_2026 ch
  WHERE ch.chave = '2026:MA:reginaldo-lima-brauno';

  SELECT s.outras_count, s.outras_digest, s.alvo_resto_digest
    INTO antes_outras_count, antes_outras_digest, antes_alvo_resto_digest
  FROM chapas_ma_vice_snapshot s;

  IF alvo_corrigido <> 1 OR sobrou_antigo <> 0 THEN
    RAISE EXCEPTION 'chapas ma vice: troca nao fechou (alvo=%, antigos=%)', alvo_corrigido, sobrou_antigo;
  END IF;
  IF recibo_forward <> 1 OR volume_recibo <> 1 THEN
    RAISE EXCEPTION 'chapas ma vice: recibo de pre-imagem ausente, duplicado ou com volume errado (n=%, volume=%)', recibo_forward, volume_recibo;
  END IF;
  IF outras_count <> antes_outras_count OR outras_digest IS DISTINCT FROM antes_outras_digest THEN
    RAISE EXCEPTION 'chapas ma vice: outras linhas de chapas_2026 mudaram (% -> %)', antes_outras_count, outras_count;
  END IF;
  -- `titular_*`, `alternativas_oficiais`, `composicao`, `created_at` e as
  -- outras 21 colunas da propria linha alvo entram neste digest. Se qualquer
  -- uma tivesse sido tocada, ele mudaria.
  IF alvo_resto_digest IS DISTINCT FROM antes_alvo_resto_digest THEN
    RAISE EXCEPTION 'chapas ma vice: alguma coluna fora das sete previstas foi tocada';
  END IF;
END
$postcondition$;

COMMIT;

-- Verificacao pos-aplicacao (rodar manualmente):
--
--   select chave, vice_sq_candidato, vice_nome_urna, vice_nome_completo,
--          vice_partido_sigla, tse_situacao_vice_codigo, vice_candidato_id,
--          fonte_sha256, snapshot_em
--     from chapas_2026 where chave = '2026:MA:reginaldo-lima-brauno';
--
--   select fonte, escopo, alvo, resultado, volume, execucao, natureza
--     from coleta_log where execucao = 'migration:20260903140000';
--
-- Depois disso, a proxima rodada de `data-freshness-audit.yml` deve trocar o
-- item de `replacement` por um de `inclusion` no mesmo slot, referente a
-- BARTOLOMEU, que so fecha com o snapshot novo da tabela inteira. O status
-- segue `review_required` ate la, de proposito.
