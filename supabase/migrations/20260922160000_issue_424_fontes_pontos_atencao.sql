-- Issue #424: gate semanal `link-check-fontes` (run 35619106186, 2026-09-21)
-- falhou em "3 claim(s) visivel(is) com fonte morta em ficha publica" e "9
-- claim(s) publicada(s) sem nenhuma fonte utilizavel em ficha publica".
--
-- Reproduzido localmente em 22/09/2026 com
-- `npm run data:link-check-fontes:gate`: os mesmos dois contadores (3 e 9,
-- com 2 claims em comum) continuam falhando, hoje contra 10 claims unicas em
-- ficha publica. A coorte publica mudou levemente entre 21 e 22/09 (fichas
-- entram e saem de `candidatos_publico`), mas o defeito real de fonte e o
-- mesmo em cada claim abaixo, confirmado por curl e, quando aplicavel, pela
-- API do Wayback Machine (`archive.org/wayback/available`).
--
-- Duas categorias, mesmo padrao da issue #96 (20260825123000):
--
--   1. Fonte generica ou morta com REPOSICAO real encontrada: a URL troca
--      para uma pagina oficial especifica (biografia na Camara, perfil na
--      Assembleia ou no Senado, materia de jornal sobre a eleicao), nunca uma
--      URL inventada. Sete das dez claims sao "Carreira politica: N
--      mandato(s) registrado(s))" citando apenas `https://www.camara.leg.br`
--      e `https://www.senado.leg.br` sem caminho algum (`sem_caminho` no
--      link-check) — mesmo defeito ja corrigido para Soldado Sampaio na
--      issue #96. Uma delas (Lula, Mapa da Fome) tem uma fonte morta
--      (fao.org, 404 confirmado) e outra viva (Radio Senado); a correcao
--      apenas remove a morta e mantem a viva, que ja sustentava a claim
--      sozinha.
--   2. Nenhuma fonte utilizavel encontrada: despublicacao. As duas claims de
--      Michelle Bolsonaro citam uma unica fonte cada (Folha, BBC), ambas 404
--      confirmado em 22/09/2026, sem snapshot no Wayback
--      (`archived_snapshots: {}` para as duas URLs) e sem a mesma materia
--      republicada sob outra URL localizada em busca. A claim de Joao Roma
--      (Ministro) tem fontes `sem_caminho` como as outras seis, mas a
--      descricao publicada nomeia "Joao Carlos Bacelar Batista", que NAO e o
--      titular desta ficha (Joao Inacio Ribeiro Roma Neto, nome de urna Joao
--      Roma, confirmado em `candidatos_publico`) — trocar so a URL deixaria
--      no ar uma claim sobre a pessoa errada, entao ela sai do ar junto com
--      as duas sem fonte nenhuma. A divergencia de identidade fica registrada
--      aqui para investigacao separada; esta migration nao tenta corrigi-la.
--
-- Esta migration e fail-closed: aceita somente a preimagem medida em 22/09/2026
-- ou o estado final exato, quando executada novamente.

BEGIN;

CREATE TEMP TABLE _pf_issue_424_updates (
  id uuid PRIMARY KEY,
  titulo_antes text NOT NULL,
  descricao_antes text NOT NULL,
  fontes_antes jsonb NOT NULL,
  titulo_depois text NOT NULL,
  descricao_depois text NOT NULL,
  fontes_depois jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO _pf_issue_424_updates (
  id, titulo_antes, descricao_antes, fontes_antes,
  titulo_depois, descricao_depois, fontes_depois
) VALUES
(
  '5405e80e-e8dc-4567-a5c3-bc2c166626b4',
  'Brasil saiu do Mapa da Fome da ONU em 2014',
  'Políticas de segurança alimentar (Fome Zero, Bolsa Família, PRONAF) levaram o Brasil a sair do Mapa da Fome da FAO pela primeira vez na história, em 2014. O mesmo relatório aponta queda de 75% na extrema pobreza entre 2001 e 2012 e redução de 82% no número de brasileiros subalimentados entre 2002 e 2013, com investimento de cerca de R$ 35 bilhões no combate à fome. O período medido atravessa os governos Lula e Dilma.',
  $j$[{"url":"https://www.fao.org/brasil/noticias/detail-events/en/c/253729/","data":"2014-09-16","titulo":"FAO: Brasil sai do Mapa da Fome"},{"url":"https://www12.senado.leg.br/radio/1/noticia/2014/09/16/brasil-saiu-do-mapa-da-fome-produzido-pela-onu","data":"2014-09-16","titulo":"Rádio Senado: Brasil saiu do Mapa da Fome produzido pela ONU"}]$j$::jsonb,
  'Brasil saiu do Mapa da Fome da ONU em 2014',
  'Políticas de segurança alimentar (Fome Zero, Bolsa Família, PRONAF) levaram o Brasil a sair do Mapa da Fome da FAO pela primeira vez na história, em 2014. O mesmo relatório aponta queda de 75% na extrema pobreza entre 2001 e 2012 e redução de 82% no número de brasileiros subalimentados entre 2002 e 2013, com investimento de cerca de R$ 35 bilhões no combate à fome. O período medido atravessa os governos Lula e Dilma.',
  $j$[{"url":"https://www12.senado.leg.br/radio/1/noticia/2014/09/16/brasil-saiu-do-mapa-da-fome-produzido-pela-onu","data":"2014-09-16","titulo":"Rádio Senado: Brasil saiu do Mapa da Fome produzido pela ONU"}]$j$::jsonb
),
(
  '1f4f9c74-e631-4624-94b5-98e32c9222b0',
  'Carreira política: 2 mandato(s) registrado(s)',
  'Alexandre Curi (PSD) possui 2 mandato(s) registrado(s): Vereador (Curitiba), Deputado Estadual (PR).',
  $j$[{"url":"https://www.camara.leg.br","titulo":"Camara dos Deputados"},{"url":"https://www.senado.leg.br","titulo":"Senado Federal"}]$j$::jsonb,
  'Carreira política: 2 mandato(s) registrado(s)',
  'Alexandre Curi (PSD) possui 2 mandato(s) registrado(s): Vereador (Curitiba), Deputado Estadual (PR).',
  $j$[{"url":"https://www.assembleia.pr.leg.br/deputados/perfil/alexandre-curi","data":"2026-09-22","titulo":"Assembleia Legislativa do Paraná, perfil de Alexandre Curi"}]$j$::jsonb
),
(
  '3dcf38a7-96c0-4a1d-a43f-c841a662eb21',
  'Carreira política: 3 mandato(s) registrado(s)',
  'Decio Nery de Lima (PDT) possui 3 mandato(s) registrado(s): Deputado Federal (SC), Prefeito (Blumenau), Vereador (Blumenau).',
  $j$[{"url":"https://www.camara.leg.br","titulo":"Camara dos Deputados"},{"url":"https://www.senado.leg.br","titulo":"Senado Federal"}]$j$::jsonb,
  'Carreira política: 3 mandato(s) registrado(s)',
  'Decio Nery de Lima (PDT) possui 3 mandato(s) registrado(s): Deputado Federal (SC), Prefeito (Blumenau), Vereador (Blumenau).',
  $j$[{"url":"https://www.camara.leg.br/deputados/141413/biografia","data":"2026-09-22","titulo":"Câmara dos Deputados, biografia de Décio Lima"}]$j$::jsonb
),
(
  '3f0ed7d5-6677-4b33-af71-8228d6abef1f',
  'Carreira política: 7 mandato(s) registrado(s)',
  'Andre Luis do Prado (PL) possui 7 mandato(s) registrado(s): Presidente da Alesp (SP) desde 2023, Deputado Estadual de SP (SP) desde 2011, Prefeito de Guararema (SP) 2005-2008, Deputado Estadual (SP), Vice-Prefeito (estado de São Paulo).',
  $j$[{"url":"https://www.camara.leg.br","titulo":"Camara dos Deputados"},{"url":"https://www.senado.leg.br","titulo":"Senado Federal"}]$j$::jsonb,
  'Carreira política: 7 mandato(s) registrado(s)',
  'Andre Luis do Prado (PL) possui 7 mandato(s) registrado(s): Presidente da Alesp (SP) desde 2023, Deputado Estadual de SP (SP) desde 2011, Prefeito de Guararema (SP) 2005-2008, Deputado Estadual (SP), Vice-Prefeito (estado de São Paulo).',
  $j$[{"url":"https://www.al.sp.gov.br/deputado/?matricula=300497","data":"2026-09-22","titulo":"Assembleia Legislativa de São Paulo, perfil de André do Prado"}]$j$::jsonb
),
(
  '4e3563d8-f29f-4324-adc4-c4f3d9eace9b',
  'Carreira política: 1 mandato(s) registrado(s)',
  'Lahesio Rodrigues Bonfim (NOVO) possui 1 mandato(s) registrado(s): Prefeito (municípios do Maranhão).',
  $j$[{"url":"https://www.camara.leg.br","titulo":"Camara dos Deputados"},{"url":"https://www.senado.leg.br","titulo":"Senado Federal"}]$j$::jsonb,
  'Carreira política: 1 mandato(s) registrado(s)',
  'Lahesio Rodrigues Bonfim (NOVO) possui 1 mandato(s) registrado(s): Prefeito (municípios do Maranhão).',
  $j$[{"url":"https://www.em.com.br/app/noticia/politica/eleicoes/2020/2020/11/15/interna_politica,1213622/eleicoes-2020-dr-lahesio-bonfim-vence-eleicao-em-sao-pedro-dos-crente.shtml","data":"2020-11-15","titulo":"Estado de Minas, Lahesio Bonfim vence eleição em São Pedro dos Crentes (MA)"}]$j$::jsonb
),
(
  '6a14a5bd-17c9-49d2-a17d-af6f87ba1c76',
  'Carreira política: 2 mandato(s) registrado(s)',
  'Wagner Sousa Gomes (UNIAO) possui 2 mandato(s) registrado(s): Vereador (Fortaleza), Deputado Estadual (CE).',
  $j$[{"url":"https://www.camara.leg.br","titulo":"Camara dos Deputados"},{"url":"https://www.senado.leg.br","titulo":"Senado Federal"}]$j$::jsonb,
  'Carreira política: 2 mandato(s) registrado(s)',
  'Wagner Sousa Gomes (UNIAO) possui 2 mandato(s) registrado(s): Vereador (Fortaleza), Deputado Estadual (CE).',
  $j$[{"url":"https://www.camara.leg.br/deputados/204487/biografia","data":"2026-09-22","titulo":"Câmara dos Deputados, biografia de Capitão Wagner"}]$j$::jsonb
),
(
  '7dee9d0a-c248-412f-b276-686ca4410747',
  'Carreira política: 2 mandato(s) registrado(s)',
  'João Alberto Rodrigues Capiberibe (PSB) possui 2 mandato(s) registrado(s): Governador (AP), Prefeito (Macapá).',
  $j$[{"url":"https://www.camara.leg.br","titulo":"Camara dos Deputados"},{"url":"https://www.senado.leg.br","titulo":"Senado Federal"}]$j$::jsonb,
  'Carreira política: 2 mandato(s) registrado(s)',
  'João Alberto Rodrigues Capiberibe (PSB) possui 2 mandato(s) registrado(s): Governador (AP), Prefeito (Macapá).',
  $j$[{"url":"https://www25.senado.leg.br/web/senadores/senador/-/perfil/3394","data":"2026-09-22","titulo":"Senado Federal, perfil de João Capiberibe"}]$j$::jsonb
);

DO $guard$
DECLARE
  existing_count integer;
  matched integer;
BEGIN
  SELECT count(*) INTO existing_count
  FROM _pf_issue_424_updates u
  JOIN public.pontos_atencao p ON p.id = u.id;

  SELECT count(*) INTO matched
  FROM _pf_issue_424_updates u
  JOIN public.pontos_atencao p ON p.id = u.id
  WHERE (
      p.visivel = true
      AND p.titulo = u.titulo_antes
      AND p.descricao = u.descricao_antes
      AND p.fontes = u.fontes_antes
    ) OR (
      p.visivel = true
      AND p.titulo = u.titulo_depois
      AND p.descricao = u.descricao_depois
      AND p.fontes = u.fontes_depois
      AND coalesce(p.dados_relacionados, '{}'::jsonb) ? 'issue_424_link_check_2026_09_22'
    );

  IF existing_count <> 0 AND (existing_count <> 7 OR matched <> 7) THEN
    RAISE EXCEPTION 'issue #424: estado parcial ou divergente nas correcoes (existentes=%, correspondentes=%)', existing_count, matched;
  END IF;
END
$guard$;

-- @write tabela=pontos_atencao ref=issue_424 campos=titulo,descricao,fontes,dados_relacionados
UPDATE public.pontos_atencao p
SET titulo = u.titulo_depois,
    descricao = u.descricao_depois,
    fontes = u.fontes_depois,
    dados_relacionados = coalesce(p.dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'issue_424_link_check_2026_09_22',
      jsonb_build_object(
        'acao', 'fonte corrigida',
        'issue', 424,
        'ref', 'issue_424',
        'reversivel', true,
        'titulo_anterior', p.titulo,
        'descricao_anterior', p.descricao,
        'fontes_anteriores', p.fontes
      )
    )
FROM _pf_issue_424_updates u
WHERE p.id = u.id
  AND p.visivel = true
  AND p.titulo = u.titulo_antes
  AND p.descricao = u.descricao_antes
  AND p.fontes = u.fontes_antes;

CREATE TEMP TABLE _pf_issue_424_hide (
  id uuid PRIMARY KEY,
  titulo_antes text NOT NULL,
  descricao_antes text NOT NULL,
  fontes_antes jsonb NOT NULL,
  motivo text NOT NULL
) ON COMMIT DROP;

INSERT INTO _pf_issue_424_hide (id, titulo_antes, descricao_antes, fontes_antes, motivo) VALUES
(
  '72d7742f-0281-4f98-aee1-f8bae33f5fca',
  'Joias sauditas e Pix de Queiroz',
  'Nome ligado ao caso das joias sauditas (recebeu presentes oficiais em nome próprio). Também recebeu depósitos via Pix de Fabricio Queiroz (R$ 89 mil entre 2011 e 2018), envolvido no caso das rachadinhas.',
  $j$[{"url":"https://www1.folha.uol.com.br/poder/2020/08/michelle-bolsonaro-recebeu-r-89-mil-de-queiroz-e-mulher.shtml","data":"2020-08-20","titulo":"Michelle e os depositos de Queiroz"}]$j$::jsonb,
  'A única fonte (Folha de S.Paulo) responde 404 desde ao menos 21/09/2026 (link-check CI run 35619106186) e seguia 404 em 22/09/2026 (curl direto e nova execução do link-check). Sem captura no Wayback Machine (archive.org/wayback/available devolve archived_snapshots vazio) e sem a mesma matéria republicada sob outra URL localizada em busca. Sem fonte verificável, a claim não pode permanecer publicada.'
),
(
  '7430457c-3193-4fd8-8bbf-c8d054d1b1ff',
  'Sem experiência política ou cargo público previo',
  'Nunca ocupou cargo público, nunca disputou eleição e não possui experiência em gestão pública. Candidatura baseada inteiramente no capital político do marido Jair Bolsonaro.',
  $j$[{"url":"https://www.bbc.com/portuguese/articles/cnk4n8e4n4eo","data":"2024-10-01","titulo":"Michelle Bolsonaro como candidata"}]$j$::jsonb,
  'A única fonte (BBC Brasil) responde 404 desde ao menos 21/09/2026 (link-check CI run 35619106186) e seguia 404 em 22/09/2026 (curl direto e nova execução do link-check). Sem captura no Wayback Machine (archive.org/wayback/available devolve archived_snapshots vazio) e sem a mesma matéria republicada sob outra URL localizada em busca. Sem fonte verificável, a claim não pode permanecer publicada.'
),
(
  'd472211d-710d-4807-9c0f-772b0f15e7a2',
  'Carreira política: 1 mandato(s) registrado(s)',
  'João Carlos Bacelar Batista (PL) possui 1 mandato(s) registrado(s): Ministro.',
  $j$[{"url":"https://www.camara.leg.br","titulo":"Camara dos Deputados"},{"url":"https://www.senado.leg.br","titulo":"Senado Federal"}]$j$::jsonb,
  'As duas fontes citadas (camara.leg.br e senado.leg.br) são a raiz do domínio, sem caminho específico, e não sustentam a afirmação (defeito sem_caminho do link-check). Além disso, a descrição publicada identifica o titular como "João Carlos Bacelar Batista", nome que diverge do candidato desta ficha em candidatos_publico (João Inácio Ribeiro Roma Neto, nome de urna João Roma) — divergência de identidade que nenhuma fonte nova resolveria; trocar só a URL deixaria no ar uma claim sobre a pessoa errada. Fica registrada aqui para investigação editorial separada, fora do escopo desta correção de fontes.'
);

DO $guard$
DECLARE
  existing_count integer;
  matched integer;
BEGIN
  SELECT count(*) INTO existing_count
  FROM _pf_issue_424_hide h
  JOIN public.pontos_atencao p ON p.id = h.id;

  SELECT count(*) INTO matched
  FROM _pf_issue_424_hide h
  JOIN public.pontos_atencao p ON p.id = h.id
  WHERE (
      p.visivel = true
      AND p.titulo = h.titulo_antes
      AND p.descricao = h.descricao_antes
      AND p.fontes = h.fontes_antes
    ) OR (
      p.visivel = false
      AND p.titulo = h.titulo_antes
      AND p.descricao = h.descricao_antes
      AND p.fontes = h.fontes_antes
      AND coalesce(p.dados_relacionados, '{}'::jsonb) ? 'issue_424_link_check_2026_09_22'
    );

  IF existing_count <> 0 AND (existing_count <> 3 OR matched <> 3) THEN
    RAISE EXCEPTION 'issue #424: estado parcial ou divergente nas despublicacoes (existentes=%, correspondentes=%)', existing_count, matched;
  END IF;
END
$guard$;

-- @write tabela=pontos_atencao ref=issue_424 campos=visivel,despublicacao_motivo,despublicado_em,dados_relacionados
UPDATE public.pontos_atencao p
SET visivel = false,
    despublicacao_motivo = h.motivo,
    despublicado_em = coalesce(p.despublicado_em, now()),
    dados_relacionados = coalesce(p.dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'issue_424_link_check_2026_09_22',
      jsonb_build_object(
        'acao', 'despublicado',
        'issue', 424,
        'ref', 'issue_424',
        'reversivel', true,
        'titulo_anterior', p.titulo,
        'descricao_anterior', p.descricao,
        'fontes_anteriores', p.fontes,
        'visivel_anterior', p.visivel
      )
    )
FROM _pf_issue_424_hide h
WHERE p.id = h.id
  AND p.visivel = true
  AND p.titulo = h.titulo_antes
  AND p.descricao = h.descricao_antes
  AND p.fontes = h.fontes_antes;

DO $postcondition$
DECLARE
  updated_count integer;
  hidden_count integer;
BEGIN
  SELECT count(*) INTO updated_count
  FROM _pf_issue_424_updates u
  JOIN public.pontos_atencao p ON p.id = u.id
  WHERE p.visivel = true
    AND p.titulo = u.titulo_depois
    AND p.descricao = u.descricao_depois
    AND p.fontes = u.fontes_depois
    AND coalesce(p.dados_relacionados, '{}'::jsonb) ? 'issue_424_link_check_2026_09_22';

  SELECT count(*) INTO hidden_count
  FROM _pf_issue_424_hide h
  JOIN public.pontos_atencao p ON p.id = h.id
  WHERE p.visivel = false
    AND p.titulo = h.titulo_antes
    AND p.descricao = h.descricao_antes
    AND p.fontes = h.fontes_antes
    AND coalesce(p.dados_relacionados, '{}'::jsonb) ? 'issue_424_link_check_2026_09_22';

  IF NOT (
    (updated_count = 0 AND hidden_count = 0)
    OR (updated_count = 7 AND hidden_count = 3)
  ) THEN
    RAISE EXCEPTION 'issue #424: pos-condicao falhou (corrigidas=%, despublicadas=%)', updated_count, hidden_count;
  END IF;
END
$postcondition$;

COMMIT;
