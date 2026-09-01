-- Issue #202: reancorar as duas claims de contas irregulares do TCU que o
-- reingest de 28/08/2026 recriou apontando para o Conecta.
--
-- O que aconteceu: a migration 20260825123000 (issue #96) reancorou as claims
-- 98d9c7c6 (Cicero Lucena) e a6efc579 (Elizeu Aguiar) nos acordaos duraveis de
-- pesquisa.apps.tcu.gov.br E RENOMEOU o titulo das duas. Como
-- scripts/lib/ingest-tcu.ts procura a linha existente por (candidato_id,
-- titulo), o reingest de 28/08 nao achou as linhas renomeadas e INSERIU duas
-- claims novas, 2fefa3f5 e c50ca7d6, com o titulo antigo e com o TVP do
-- Conecta, que e casca de SPA. Resultado: cada um dos dois candidatos ficou com
-- a mesma acusacao publicada DUAS vezes, e o link-check reprovou em 31/08 pela
-- copia sem fonte utilizavel.
--
-- Esta migration faz duas coisas nas duas linhas automaticas, e so nelas:
--   1. troca a fonte pelo mesmo acordao duravel que a issue #96 curou, para que
--      a linha nunca volte ao ar com fonte podre;
--   2. despublica a linha, porque ela e copia integral de uma claim curada que
--      ja esta no ar (98d9c7c6 e a6efc579), que segue intocada.
--
-- E fail-closed: aceita somente a preimagem medida em producao em 01/09/2026 ou
-- o estado final exato, quando executada de novo. NAO aplicar em producao sem
-- autorizacao nomeada do Thiago.

BEGIN;

CREATE TEMP TABLE _pf_issue_202_updates (
  id uuid PRIMARY KEY,
  candidato_id uuid NOT NULL,
  curada_id uuid NOT NULL,
  titulo_antes text NOT NULL,
  descricao_antes text NOT NULL,
  fontes_antes jsonb NOT NULL,
  fontes_depois jsonb NOT NULL,
  motivo text NOT NULL
) ON COMMIT DROP;

INSERT INTO _pf_issue_202_updates (
  id, candidato_id, curada_id, titulo_antes, descricao_antes,
  fontes_antes, fontes_depois, motivo
) VALUES
(
  '2fefa3f5-3b42-4a5a-a72b-2b28d09df018',
  '76a6620b-1fd4-46df-806f-5101bd660f7f',
  '98d9c7c6-263f-45dd-9442-e568106bae7c',
  'Contas irregulares no TCU',
  'Acórdão: 3121/2015-1C | Processo: 015.688/2007-6 | Trânsito em julgado: 25/05/2018',
  $j$[{"url":"https://conecta-tcu.apps.tcu.gov.br/tvp/42733993","data":"2026-08-28","titulo":"TCU — processo com contas julgadas irregulares"}]$j$::jsonb,
  $j$[{"url":"https://pesquisa.apps.tcu.gov.br/rest/publico/base/acordao-completo/documento?termo=*&filtro=NUMACORDAO%3A3121%20ANOACORDAO%3A2015%20COLEGIADO%3A%22Primeira%20C%C3%A2mara%22&ordenacao=DTRELEVANCIA%20desc%2C%20NUMACORDAOINT%20desc&quantidade=1&inicio=0","data":"2026-08-25","titulo":"TCU, Acórdão 3121/2015 da Primeira Câmara"}]$j$::jsonb,
  'Cópia automática de uma claim curada que já está publicada (98d9c7c6-263f-45dd-9442-e568106bae7c, "TCU julgou irregulares contas no Acórdão 3121/2015"). A fonte foi reancorada no acórdão durável antes da despublicação, e a claim curada segue no ar.'
),
(
  'c50ca7d6-e0e8-4ccb-9c88-3358ebe40dae',
  '914d9904-1c6a-47f9-a25f-017138dc1cef',
  'a6efc579-1e51-4b2a-9f3e-38eb897183a8',
  'Contas irregulares no TCU',
  'Acórdão: 1488/2025-1C | Processo: 006.099/2022-0 | Trânsito em julgado: 21/03/2026',
  $j$[{"url":"https://conecta-tcu.apps.tcu.gov.br/tvp/70662366","data":"2026-08-28","titulo":"TCU — processo com contas julgadas irregulares"}]$j$::jsonb,
  $j$[{"url":"https://pesquisa.apps.tcu.gov.br/rest/publico/base/acordao-completo/documento?termo=*&filtro=NUMACORDAO%3A1488%20ANOACORDAO%3A2025%20COLEGIADO%3A%22Primeira%20C%C3%A2mara%22&ordenacao=DTRELEVANCIA%20desc%2C%20NUMACORDAOINT%20desc&quantidade=1&inicio=0","data":"2026-08-25","titulo":"TCU, Acórdão 1488/2025 da Primeira Câmara"}]$j$::jsonb,
  'Cópia automática de uma claim curada que já está publicada (a6efc579-1e51-4b2a-9f3e-38eb897183a8, "TCU julgou irregulares contas no Acórdão 1488/2025"). A fonte foi reancorada no acórdão durável antes da despublicação, e a claim curada segue no ar.'
);

DO $precondition$
DECLARE
  alvos integer;
  correspondentes integer;
  curadas integer;
BEGIN
  SELECT count(*) INTO alvos
  FROM _pf_issue_202_updates u
  JOIN public.pontos_atencao p ON p.id = u.id;

  -- Replay linear em banco vazio nao carrega ficha nenhuma: nesse caso a
  -- curadoria e no-op. Com as linhas presentes, todo guard exato abaixo vale.
  IF alvos = 0 THEN
    RETURN;
  END IF;

  SELECT count(*) INTO correspondentes
  FROM _pf_issue_202_updates u
  JOIN public.pontos_atencao p ON p.id = u.id
  WHERE (
      p.candidato_id = u.candidato_id
      AND p.visivel = true
      AND p.titulo = u.titulo_antes
      AND p.descricao = u.descricao_antes
      AND p.fontes = u.fontes_antes
      AND p.gerado_por = 'automatico'
      AND p.verificado = false
    ) OR (
      p.candidato_id = u.candidato_id
      AND p.visivel = false
      AND p.titulo = u.titulo_antes
      AND p.descricao = u.descricao_antes
      AND p.fontes = u.fontes_depois
      AND coalesce(p.dados_relacionados, '{}'::jsonb) ? 'issue_202_tcu_fontes_2026_09_01'
    );

  -- A despublicacao so e legitima porque a claim curada continua publicada.
  -- Se ela sumiu, o candidato ficaria sem a informacao e a migration para.
  SELECT count(*) INTO curadas
  FROM _pf_issue_202_updates u
  JOIN public.pontos_atencao c ON c.id = u.curada_id
  WHERE c.candidato_id = u.candidato_id
    AND c.visivel = true
    AND c.gerado_por = 'curadoria'
    AND c.verificado = true
    AND c.fontes = u.fontes_depois;

  IF alvos <> 2 OR correspondentes <> 2 OR curadas <> 2 THEN
    RAISE EXCEPTION
      'issue #202: estado parcial ou divergente (alvos=%, correspondentes=%, curadas=%)',
      alvos, correspondentes, curadas;
  END IF;
END
$precondition$;

-- @write tabela=pontos_atencao ref=issue_202 campos=fontes,visivel,despublicacao_motivo,despublicado_em,dados_relacionados
UPDATE public.pontos_atencao p
SET fontes = u.fontes_depois,
    visivel = false,
    despublicacao_motivo = u.motivo,
    despublicado_em = coalesce(p.despublicado_em, now()),
    dados_relacionados = coalesce(p.dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'issue_202_tcu_fontes_2026_09_01',
      jsonb_build_object(
        'acao', 'fonte reancorada e claim duplicada despublicada',
        'issue', 202,
        'ref', 'issue_202',
        'reversivel', true,
        'claim_curada_id', u.curada_id,
        'fontes_anteriores', p.fontes,
        'visivel_anterior', p.visivel
      )
    )
FROM _pf_issue_202_updates u
WHERE p.id = u.id
  AND p.candidato_id = u.candidato_id
  AND p.visivel = true
  AND p.titulo = u.titulo_antes
  AND p.descricao = u.descricao_antes
  AND p.fontes = u.fontes_antes;

DO $postcondition$
DECLARE
  alvos integer;
  corrigidas integer;
  curadas integer;
BEGIN
  SELECT count(*) INTO alvos
  FROM _pf_issue_202_updates u
  JOIN public.pontos_atencao p ON p.id = u.id;

  IF alvos = 0 THEN
    RETURN;
  END IF;

  SELECT count(*) INTO corrigidas
  FROM _pf_issue_202_updates u
  JOIN public.pontos_atencao p ON p.id = u.id
  WHERE p.visivel = false
    AND p.fontes = u.fontes_depois
    AND p.despublicacao_motivo IS NOT NULL
    AND p.despublicado_em IS NOT NULL
    AND p.dados_relacionados -> 'issue_202_tcu_fontes_2026_09_01' ->> 'acao'
        = 'fonte reancorada e claim duplicada despublicada';

  SELECT count(*) INTO curadas
  FROM _pf_issue_202_updates u
  JOIN public.pontos_atencao c ON c.id = u.curada_id
  WHERE c.visivel = true
    AND c.fontes = u.fontes_depois;

  IF corrigidas <> 2 OR curadas <> 2 THEN
    RAISE EXCEPTION
      'issue #202: pos-condicao falhou (corrigidas=%, curadas=%)', corrigidas, curadas;
  END IF;
END
$postcondition$;

COMMIT;
