-- Devolve o nome de urna do vice de RN ao valor da fonte oficial do TSE.
--
-- NAO aplicar em producao sem autorizacao nomeada do Thiago.
--
-- =====================================================================
-- O DEFEITO, MEDIDO
-- =====================================================================
--
-- A auditoria `data-freshness-audit.yml` reprova desde 02/09/2026 com UMA
-- divergencia, e so uma. Run 33647415283 (schedule de 02/09/2026, artefato
-- data-freshness-33647415283), `candidacies.status = review_required`, um unico
-- item em `changes`:
--
--   kind:      identity_mismatch
--   slot:      RN:VICE GOVERNADOR:200001800267
--   oficial:   sq_candidato 200002535256, MDB, VICE GOVERNADOR, RN, nome_urna "HERMANO"
--   publicado: sq_candidato 200002535256, MDB, VICE GOVERNADOR, RN, nome_urna "HERMANO MORAIS"
--
-- O comparador e `sameIdentity` em scripts/lib/data-freshness/candidaturas.ts:
-- ele casa nome de urna, sigla de partido, cargo e UF, todos normalizados sem
-- acento e em caixa alta. Dos quatro campos, tres batem. So o nome de urna
-- diverge, e a divergencia nao e de grafia nem de acento: sao dois valores
-- diferentes, "HERMANO" e "HERMANO MORAIS".
--
-- O lado oficial vem de `NM_URNA_CANDIDATO` do pacote consulta_cand_2026.zip
-- baixado pela propria auditoria (scripts/lib/data-freshness/tse-source.ts),
-- registrado em source.json daquele run:
--
--   url:     https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip
--   sha256:  875a13ecf63ef4af942d95c7e45227346da56c9d0a4963cb59bf724051532061
--   lido em: 2026-09-02T15:17:15Z
--
-- O lado publicado vem de `chapas_2026.vice_nome_urna`, que
-- scripts/audit/data-freshness-snapshot.sql le direto da tabela.
--
-- =====================================================================
-- POR QUE O BANCO TEM O VALOR ANTIGO (nao foi erro de ingestao)
-- =====================================================================
--
-- 'HERMANO MORAIS' entrou por tres snapshots sucessivos do proprio TSE, sempre
-- pela mesma coluna: 20260813040100 (pacote de 12/08), 20260816011000 (pacote
-- pos-registro de 15/08) e 20260828025037 (pacote de 27/08, SHA-256
-- eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27, que e o
-- `fonte_sha256` da linha hoje). Os tres estao congelados em data/chapas-2026-tse-*.json
-- e os tres trazem "HERMANO MORAIS".
--
-- Ou seja: o pipeline leu certo, e quem mudou foi a fonte. Entre o pacote de
-- 27/08 e o de 02/09 o TSE reescreveu o nome de urna dessa candidatura de
-- "HERMANO MORAIS" para "HERMANO". Isto e reancoragem no pacote atual, nao
-- conserto de bug de leitura, e a diferenca importa: nao ha nada a corrigir na
-- origem, e os arquivos de snapshot historico ficam como estao, porque cada um
-- e o registro fiel do pacote daquele dia e carrega o SHA-256 que o comprova.
--
-- =====================================================================
-- O QUE ESTA MIGRATION FAZ, E O QUE ELA NAO FAZ
-- =====================================================================
--
-- Faz: `vice_nome_urna` da linha `2026:RN:allyson-leandro-bezerra-silva` passa
-- de 'HERMANO MORAIS' para 'HERMANO'. Uma coluna, uma linha, das 220 da tabela.
--
-- NAO toca `vice_nome_completo`, que segue 'HERMANO DA COSTA MORAES'. O nome
-- civil nao mudou no pacote novo e nao entra no comparador de identidade; mexer
-- nele seria escrita sem defeito medido.
--
-- NAO toca `fonte_sha256` nem `snapshot_em`. Os dois descrevem QUAL pacote
-- carregou a linha inteira, e quem carrega a linha inteira e a migration de
-- snapshot, nao uma correcao pontual de campo. Reescreve-los aqui afirmaria que
-- as 28 colunas vieram do pacote de 02/09, o que seria falso para 27 delas. A
-- proveniencia desta correcao vive no recibo de coleta_log abaixo, que e o lugar
-- onde ela pode ser especifica: campo, valor anterior, valor novo, pacote.
-- (`chapas_2026` nao tem coluna de frescor tipo `ultima_atualizacao`; tem
-- `created_at`, que e da linha, e `snapshot_em`, que e do pacote. Nenhuma das
-- duas e tocada, e a pos-condicao prova isso comparando o resto da linha
-- byte a byte.)
--
-- NAO abre excecao para o proximo caso. Se o TSE reescrever outros nomes de
-- urna, o certo e um snapshot novo da tabela inteira, com pacote e SHA-256
-- proprios, e nao uma fila de correcoes de uma coluna.
BEGIN;

-- ---------------------------------------------------------------------------
-- Pre-imagem estrutural: contagem e digest de TODAS as outras linhas da tabela.
-- A pos-condicao compara os dois contra o estado final, e e assim que esta
-- migration prova que nao encostou em nenhuma das outras 219 linhas. Digest de
-- linha inteira, nao so das colunas de nome: um UPDATE largo demais por engano
-- muda qualquer coluna, e um guard que so olha o que a migration pretendia
-- mexer nao pega o engano que ela nao pretendia.
CREATE TEMP TABLE chapas_hermano_snapshot ON COMMIT DROP AS
SELECT
  (SELECT count(*)::bigint FROM public.chapas_2026 ch
    WHERE ch.chave <> '2026:RN:allyson-leandro-bezerra-silva') AS outras_count,
  (SELECT md5(coalesce(string_agg(row_to_json(ch)::text, '' ORDER BY ch.chave), ''))
     FROM public.chapas_2026 ch
    WHERE ch.chave <> '2026:RN:allyson-leandro-bezerra-silva') AS outras_digest,
  (SELECT md5(coalesce(string_agg((to_jsonb(ch) - 'vice_nome_urna')::text, ''), ''))
     FROM public.chapas_2026 ch
    WHERE ch.chave = '2026:RN:allyson-leandro-bezerra-silva') AS alvo_resto_digest;

DO $precondition$
DECLARE
  alvo_existe boolean;
  alvo_exato integer;
  recibo_forward integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.chapas_2026 WHERE chave = '2026:RN:allyson-leandro-bezerra-silva'
  ) INTO alvo_existe;

  -- Replay linear em banco vazio: a tabela existe (o schema de 20260813040000
  -- a cria) mas nenhum snapshot de chapas aplicou, entao a linha nao existe e
  -- a correcao e no-op. Fora desse caso, todo guard abaixo e obrigatorio.
  IF NOT alvo_existe THEN
    RAISE NOTICE 'chapas hermano: linha 2026:RN:allyson-leandro-bezerra-silva ausente (replay); correcao ignorada';
    RETURN;
  END IF;

  SELECT count(*) INTO alvo_exato
  FROM public.chapas_2026
  WHERE chave = '2026:RN:allyson-leandro-bezerra-silva'
    AND vice_sq_candidato = '200002535256'
    AND vice_nome_urna = 'HERMANO MORAIS'
    AND vice_nome_completo = 'HERMANO DA COSTA MORAES'
    AND vice_partido_sigla = 'MDB'
    AND uf = 'RN'
    AND cargo_titular = 'Governador';

  SELECT count(*) INTO recibo_forward
  FROM public.coleta_log WHERE execucao = 'migration:20260903130000';

  -- Exatamente uma linha, com a pre-imagem exata dos quatro campos que o
  -- comparador de identidade usa mais a ancora SQ. Zero linhas aqui significa
  -- que alguem ja aplicou ou que o dado mudou embaixo; nos dois casos o certo
  -- e abortar, nao escrever.
  IF alvo_exato <> 1 OR recibo_forward <> 0 THEN
    RAISE EXCEPTION 'chapas hermano: precondicao divergiu (alvo=%, recibo=%)', alvo_exato, recibo_forward;
  END IF;
END
$precondition$;

-- ---------------------------------------------------------------------------
-- Recibo de pre-imagem, ANTES de qualquer escrita. `detalhe` guarda tres coisas
-- em JSON:
--
--   linhas         a linha alvo INTEIRA, nao so o campo. E dela que o rollback
--                  tira o valor a restaurar, e e ela que documenta o que mais
--                  existia na linha na hora.
--   outras_count   quantas outras linhas a tabela tinha, e
--   outras_digest  o hash agregado delas.
--
-- Os dois ultimos existem para o readback, que roda depois e sozinho: sem uma
-- medida do "antes" gravada no banco, um readback so consegue afirmar que a
-- linha alvo esta certa, e nao que o resto da tabela ficou intacto. Com eles,
-- ele recomputa e compara.
--
-- Vocabulario de coleta_log, medido em producao em 03/09/2026: escopo em
-- {candidato, territorio, global}; resultado com volume coerente ('encontrado'
-- exige > 0, 'vazio_confirmado' exige = 0); natureza em {coleta, escrita};
-- candidato_id so em escopo 'candidato', e aqui ele fica NULL de proposito,
-- porque a chapa de RN ainda nao tem ficha de vice vinculada
-- (vice_candidato_id IS NULL). Escopo 'territorio' com alvo em RN e a leitura
-- honesta: a correcao pertence a uma chapa estadual, nao a uma ficha.
--
-- O `HAVING` faz a idempotencia: sem ele, uma segunda execucao filtraria as
-- linhas pelo NOT EXISTS e ainda assim gravaria um recibo vazio, porque
-- agregacao sem GROUP BY sempre devolve uma linha.
-- @write tabela=coleta_log ref=migration:20260903130000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
SELECT 'tse-chapas-2026', 'territorio', 'chapas_2026:RN:vice_nome_urna',
       CASE WHEN count(*) > 0 THEN 'encontrado' ELSE 'vazio_confirmado' END,
       count(*)::integer,
       jsonb_build_object(
         'linhas', coalesce(jsonb_agg(to_jsonb(ch) ORDER BY ch.chave), '[]'::jsonb),
         'outras_count', (SELECT count(*) FROM public.chapas_2026 o
                           WHERE o.chave <> '2026:RN:allyson-leandro-bezerra-silva'),
         'outras_digest', (SELECT md5(coalesce(string_agg(row_to_json(o)::text, '' ORDER BY o.chave), ''))
                             FROM public.chapas_2026 o
                            WHERE o.chave <> '2026:RN:allyson-leandro-bezerra-silva')
       )::text,
       'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
       'migration:20260903130000',
       'escrita'
FROM public.chapas_2026 ch
WHERE ch.chave = '2026:RN:allyson-leandro-bezerra-silva'
  AND ch.vice_nome_urna = 'HERMANO MORAIS'
HAVING NOT EXISTS (
  SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260903130000'
);

-- ---------------------------------------------------------------------------
-- A correcao. O WHERE carrega a pre-imagem inteira de proposito: chave, ancora
-- SQ e valor antigo. Assim o statement e auto-limitante, e nao depende so do
-- guard acima para nao alcancar linha errada.
-- @write tabela=chapas_2026 ref=chapas-hermano-20260903 chave="2026:RN:allyson-leandro-bezerra-silva" campos=vice_nome_urna
UPDATE public.chapas_2026
SET vice_nome_urna = 'HERMANO'
WHERE chave = '2026:RN:allyson-leandro-bezerra-silva'
  AND vice_sq_candidato = '200002535256'
  AND vice_nome_urna = 'HERMANO MORAIS';

DO $postcondition$
DECLARE
  alvo_corrigido integer;
  recibo_forward integer;
  volume_recibo integer;
  outras_count bigint;
  outras_digest text;
  alvo_resto_digest text;
  antes_outras_count bigint;
  antes_outras_digest text;
  antes_alvo_resto_digest text;
  sobrou_antigo integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chapas_2026 WHERE chave = '2026:RN:allyson-leandro-bezerra-silva'
  ) THEN
    RETURN;
  END IF;

  -- Exatamente uma linha ficou com o valor oficial, e o nome civil continua
  -- intacto. As duas asseveracoes juntas sao a prova de "afetou 1 linha, e so
  -- a coluna que devia".
  SELECT count(*) INTO alvo_corrigido
  FROM public.chapas_2026
  WHERE chave = '2026:RN:allyson-leandro-bezerra-silva'
    AND vice_sq_candidato = '200002535256'
    AND vice_nome_urna = 'HERMANO'
    AND vice_nome_completo = 'HERMANO DA COSTA MORAES';

  SELECT count(*) INTO sobrou_antigo
  FROM public.chapas_2026 WHERE vice_nome_urna = 'HERMANO MORAIS';

  SELECT count(*) INTO recibo_forward
  FROM public.coleta_log WHERE execucao = 'migration:20260903130000';

  SELECT volume INTO volume_recibo
  FROM public.coleta_log WHERE execucao = 'migration:20260903130000';

  SELECT count(*)::bigint,
         md5(coalesce(string_agg(row_to_json(ch)::text, '' ORDER BY ch.chave), ''))
    INTO outras_count, outras_digest
  FROM public.chapas_2026 ch
  WHERE ch.chave <> '2026:RN:allyson-leandro-bezerra-silva';

  SELECT md5(coalesce(string_agg((to_jsonb(ch) - 'vice_nome_urna')::text, ''), ''))
    INTO alvo_resto_digest
  FROM public.chapas_2026 ch
  WHERE ch.chave = '2026:RN:allyson-leandro-bezerra-silva';

  SELECT s.outras_count, s.outras_digest, s.alvo_resto_digest
    INTO antes_outras_count, antes_outras_digest, antes_alvo_resto_digest
  FROM chapas_hermano_snapshot s;

  IF alvo_corrigido <> 1 OR sobrou_antigo <> 0 THEN
    RAISE EXCEPTION 'chapas hermano: correcao nao fechou (alvo=%, antigos=%)', alvo_corrigido, sobrou_antigo;
  END IF;
  IF recibo_forward <> 1 OR volume_recibo <> 1 THEN
    RAISE EXCEPTION 'chapas hermano: recibo de pre-imagem ausente, duplicado ou com volume errado (n=%, volume=%)', recibo_forward, volume_recibo;
  END IF;
  IF outras_count <> antes_outras_count OR outras_digest IS DISTINCT FROM antes_outras_digest THEN
    RAISE EXCEPTION 'chapas hermano: outras linhas de chapas_2026 mudaram (% -> %)', antes_outras_count, outras_count;
  END IF;
  -- `snapshot_em`, `fonte_sha256`, `created_at` e as outras 24 colunas da
  -- propria linha alvo entram neste digest. Se qualquer uma tivesse sido
  -- carimbada, ele mudaria.
  IF alvo_resto_digest IS DISTINCT FROM antes_alvo_resto_digest THEN
    RAISE EXCEPTION 'chapas hermano: alguma outra coluna da linha alvo foi tocada';
  END IF;
END
$postcondition$;

COMMIT;

-- Verificacao pos-aplicacao (rodar manualmente):
--
--   select chave, vice_sq_candidato, vice_nome_urna, vice_nome_completo,
--          vice_partido_sigla, fonte_sha256, snapshot_em
--     from chapas_2026 where chave = '2026:RN:allyson-leandro-bezerra-silva';
--
--   select fonte, escopo, alvo, resultado, volume, execucao, natureza
--     from coleta_log where execucao = 'migration:20260903130000';
--
-- Depois disso, a proxima rodada de `data-freshness-audit.yml` deve voltar a
-- `candidacies.status = ok`, com zero itens em `changes`.
