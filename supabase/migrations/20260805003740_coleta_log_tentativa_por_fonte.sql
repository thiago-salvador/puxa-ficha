BEGIN;

-- Registro de TENTATIVA de coleta, por candidato e por fonte.
--
-- POR QUE ESTA TABELA EXISTE
--
-- O banco guarda o que foi encontrado. Ele nunca guardou o fato de ter ido
-- procurar. Sem esse fato, "zero" é ambíguo, e a ambiguidade não é teórica:
--
--   * Sanções administrativas estão vazias em 194 de 194 fichas, incluindo
--     políticos com cinco mandatos. Não existe leitura estatística em que isso
--     seja "nada encontrado". O `ingest-transparencia-sanctions` avisa e volta
--     quando `TRANSPARENCIA_API_KEY` não está definida, e voltar sem escrever é
--     indistinguível, no banco, de ter consultado os quatro cadastros e não
--     achar nada.
--   * Processos judiciais têm registro em 9 de 194, e os 9 vieram de curadoria
--     manual. Os outros 185 nunca foram consultados por ninguém.
--
-- O relatório de cobertura já admite a limitação por escrito: o estado `zero`
-- de `scripts/audit/lib/coverage-model.ts` está documentado como "zero legítimo
-- ou não coletado; o banco não distingue os dois". São 954 células nesse estado.
-- Esta tabela é o que permite separá-las.
--
-- A exigência do projeto é que todo dado preenchível seja preenchido, e que
-- esteja tudo bem existir dado que verdadeiramente não se aplica ou que
-- verdadeiramente é zero. Cumprir isso é verificável só se a tentativa deixar
-- rastro: sem rastro, "verdadeiramente zero" é afirmação sem prova.
--
-- O QUE É UMA LINHA AQUI
--
-- Uma linha é uma tentativa: "em tal instante, fomos buscar a fonte X para o
-- alvo Y, e o desfecho foi Z". É append-only e nunca é reescrita. Não é estado
-- do dado, é histórico do esforço. Quem quer o estado atual lê a view
-- `coleta_log_ultima`.
--
-- Os desfechos, e o que separa um do outro:
--
--   encontrado       consultamos e veio dado; `volume` diz quanto foi gravado.
--   vazio_confirmado consultamos, a fonte respondeu, e a resposta foi vazia.
--                    Este é o único desfecho que autoriza dizer "é zero mesmo".
--   nao_aplicavel    a pergunta não cabe para este alvo (cota parlamentar de
--                    quem nunca teve mandato, por exemplo). Decidido por regra
--                    declarada, não por ausência de resposta.
--   erro             fomos buscar e não deu: credencial ausente, HTTP quebrado,
--                    candidato sem CPF no banco, timeout. NÃO é zero, e é
--                    justamente o caso que hoje se disfarça de zero.
--   indeterminado    a execução terminou sem escrever nada e sem saber dizer se
--                    a fonte respondeu vazio ou se a consulta falhou.
--
-- `indeterminado` existe porque o código atual tem esse buraco de verdade, e
-- inventar um veredito para ele seria repetir, em campo novo, o erro que esta
-- tabela veio corrigir. O caso concreto: `fetchSancoes` faz `catch { return [] }`,
-- então uma sanção real atrás de um HTTP 500 chega ao chamador com a mesma cara
-- de "nenhuma sanção". Enquanto um ingest não separa esses dois caminhos, o
-- honesto é dizer que não sabe. Todo `indeterminado` no relatório é dívida
-- endereçada: é um ingest que ainda precisa declarar o próprio desfecho.
--
-- A ausência de linha é o último estado, e é o mais importante deles: nunca
-- verificado. Ele não é gravado porque não existe momento em que gravá-lo; ele
-- se lê pela negativa, e é isso que a consulta abaixo faz.
--
-- Também não há linha para "pulei porque o dado já estava coberto" (o `skipped`
-- do IngestResult, usado pela Câmara em modo incremental). Pular não é tentar, e
-- gravar a pulada sobrescreveria, em `coleta_log_ultima`, a última tentativa de
-- verdade. A linha antiga continua valendo, que é o comportamento correto.
--
-- CONSULTA CANÔNICA: quais candidatos nunca foram verificados para a fonte X
--
--   select c.slug, c.nome_urna
--     from public.candidatos c
--    where not exists (
--            select 1
--              from public.coleta_log l
--             where l.escopo = 'candidato'
--               and l.alvo   = c.slug
--               and l.fonte  = 'transparencia-sanctions'
--          )
--    order by c.nome_urna;
--
-- E a variante que interessa ao relatório, separando o zero provado do zero
-- presumido, por candidato e por fonte:
--
--   select c.slug,
--          coalesce(u.resultado, 'nunca_verificado') as situacao,
--          u.executado_em,
--          u.detalhe
--     from public.candidatos c
--     left join public.coleta_log_ultima u
--       on u.escopo = 'candidato'
--      and u.alvo   = c.slug
--      and u.fonte  = 'transparencia-sanctions';
--
-- VOLUME DE LINHAS
--
-- A ingestão agendada roda semanalmente e só para `camara` e `senado`
-- (.github/workflows/ingest.yml), ou seja ~390 linhas por semana. Mesmo no pior
-- caso, com as 23 fontes rodando toda semana para os 194 candidatos, dá ~230 mil
-- linhas por ano numa tabela de colunas curtas. Não é problema no Free de
-- 500 MB, e por isso esta tabela NÃO tem expurgo automático, ao contrário de
-- `analytics_launch_events`. Se algum dia precisar, o expurgo correto apaga
-- linha superada (não é a mais recente do seu trio fonte/escopo/alvo) e mais
-- velha que a janela escolhida; apagar por data pura destruiria a resposta de
-- "nunca verificado" para quem parou de ser coletado.

create table if not exists public.coleta_log (
  id           bigint      generated always as identity primary key,

  fonte        text        not null,
  escopo       text        not null check (escopo in ('candidato', 'territorio', 'global')),
  alvo         text        not null,
  candidato_id uuid        references public.candidatos(id) on delete set null,

  executado_em timestamptz not null default now(),
  resultado    text        not null check (resultado in ('encontrado', 'vazio_confirmado', 'nao_aplicavel', 'erro', 'indeterminado')),
  volume       integer     not null default 0 check (volume >= 0),

  detalhe      text,
  url          text,
  execucao     text,
  duracao_ms   integer     check (duracao_ms is null or duracao_ms >= 0),

  -- Desfecho e volume não podem se contradizer. `encontrado` com volume zero é
  -- na verdade vazio_confirmado mal rotulado, e `vazio_confirmado` com volume
  -- é o contrário. `erro` fica de fora: uma execução pode gravar três linhas e
  -- quebrar na quarta, e esse volume parcial é informação verdadeira.
  constraint coleta_log_volume_coerente check (
    case resultado
      when 'encontrado'       then volume > 0
      when 'vazio_confirmado' then volume = 0
      when 'nao_aplicavel'    then volume = 0
      when 'indeterminado'    then volume = 0
      else true
    end
  ),

  -- `candidato_id` só faz sentido quando o alvo é um candidato. Para fonte
  -- territorial (SICONFI, CAPAG, IBGE, IDEB, IPEA, Atlas da Violência) o alvo é
  -- UF ou agregado, e não há dono.
  constraint coleta_log_candidato_id_so_em_escopo_candidato check (
    escopo = 'candidato' or candidato_id is null
  )
);

comment on table public.coleta_log is
  'Tentativas de coleta por fonte e por alvo, append-only. Existe para separar "verificamos e não há" de "nunca fomos buscar", que o resto do banco não distingue. Estado atual em public.coleta_log_ultima. Escrito por scripts/lib/coleta-log.ts.';

comment on column public.coleta_log.fonte is
  'Identificador da fonte, igual ao campo `source` do IngestResult do ingest correspondente (ex.: camara, senado, transparencia-sanctions, tse-historico). Vocabulário conferido pelo teste tests/coleta-log.test.ts.';

comment on column public.coleta_log.escopo is
  'candidato: alvo é slug de candidato. territorio: alvo é UF ou código de agregado (SICONFI, IBGE, IDEB, IPEA, CAPAG, Atlas). global: coleta sem alvo por linha, alvo fica com o nome da fonte.';

comment on column public.coleta_log.alvo is
  'Chave declarada pelo ingest (campo `candidato` do IngestResult). É slug quando escopo = candidato, e é UF ou agregado_NNNN quando escopo = territorio. Sempre preenchido, inclusive quando candidato_id não pôde ser resolvido.';

comment on column public.coleta_log.candidato_id is
  'Resolvido quando o candidato existe em public.candidatos. Fica nulo quando o ingest parou antes de resolver (ex.: slug ausente no banco), e vira nulo se o candidato sair da coorte: ON DELETE SET NULL, e não CASCADE, porque apagar a evidência de que houve tentativa é exatamente o que esta tabela existe para impedir.';

comment on column public.coleta_log.resultado is
  'encontrado | vazio_confirmado | nao_aplicavel | erro | indeterminado. Só vazio_confirmado autoriza afirmar que o dado é zero de verdade. erro cobre credencial ausente, HTTP quebrado e pré-requisito faltando, e nunca deve ser lido como zero. indeterminado é o ingest que escreveu zero linhas sem conseguir dizer se a fonte veio vazia ou se a consulta falhou. Ausência de linha significa nunca verificado.';

comment on column public.coleta_log.volume is
  'Quantas linhas a tentativa gravou ou confirmou. Zero é obrigatório em vazio_confirmado, nao_aplicavel e indeterminado (ver constraint coleta_log_volume_coerente).';

comment on column public.coleta_log.detalhe is
  'Texto curto legível por humano explicando o desfecho, sobretudo em erro e nao_aplicavel (ex.: "TRANSPARENCIA_API_KEY ausente", "candidato sem CPF no banco").';

comment on column public.coleta_log.url is
  'Endpoint ou página consultada, quando existe uma só que represente a tentativa. Fica nulo quando a tentativa varre vários endpoints (o caso dos quatro cadastros de sanções).';

comment on column public.coleta_log.execucao is
  'Identificador da execução que produziu a linha: GITHUB_RUN_ID no CI, ou local:<pid> fora dele. Permite agrupar tudo que uma rodada tentou, e separar falha correlacionada por execução de falha real da fonte.';

-- Serve às duas leituras quentes: a última tentativa de um trio
-- (fonte, escopo, alvo), que é o DISTINCT ON da view, e o NOT EXISTS da
-- consulta de "nunca verificado", que casa pelo prefixo das mesmas colunas.
create index if not exists idx_coleta_log_fonte_alvo
  on public.coleta_log (fonte, escopo, alvo, executado_em desc);

create index if not exists idx_coleta_log_executado
  on public.coleta_log (executado_em desc);

create index if not exists idx_coleta_log_candidato
  on public.coleta_log (candidato_id)
  where candidato_id is not null;

-- Estado atual: a tentativa mais recente de cada trio. É o que o relatório de
-- cobertura lê; a tabela crua fica para quem quiser a série histórica.
create or replace view public.coleta_log_ultima
with (security_invoker = true) as
select distinct on (fonte, escopo, alvo)
       fonte,
       escopo,
       alvo,
       candidato_id,
       executado_em,
       resultado,
       volume,
       detalhe,
       url,
       execucao,
       duracao_ms
  from public.coleta_log
 order by fonte, escopo, alvo, executado_em desc, id desc;

comment on view public.coleta_log_ultima is
  'Última tentativa de coleta por (fonte, escopo, alvo). security_invoker garante que a view não vire caminho paralelo em volta da RLS da tabela base.';

-- Telemetria de pipeline não tem por que estar em superfície pública, e o
-- script escreve com a service role, que ignora RLS.
alter table public.coleta_log enable row level security;
revoke all on public.coleta_log from anon, authenticated;
revoke all on public.coleta_log_ultima from anon, authenticated;

COMMIT;
