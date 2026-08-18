-- Estado entre execuções do link-check de fontes.
--
-- POR QUE ESTA TABELA EXISTE
--
-- Em 2026-08-03, o run 30837180265 do workflow `link-check-fontes` classificou
-- `revistaforum.com.br/...renan-santos...` como `morta` (HTTP 404) e
-- `agorarn.com.br/...alvaro-dias...` como `sem_substancia`. As duas URLs estavam
-- vivas: sondadas do Brasil respondiam 200 com 3980 e 4844 caracteres úteis, e
-- as duas voltaram a passar no run seguinte, 30837640630.
--
-- A investigação do mesmo dia mediu três coisas que decidem o desenho daqui:
--
--   1. O 404 falso é a PRÓPRIA página de erro do site (623 caracteres úteis,
--      `server: cloudflare`), sem nenhum marcador de WAF. É indistinguível, no
--      corpo, do 404 verdadeiro do mesmo host. Nenhuma regra que leia só a
--      resposta separa os dois casos.
--   2. O eixo não é geografia. Uma sonda de datacenter saindo do Brasil recebeu
--      o 404 no mesmo minuto em que 12 sondas seguidas de IP residencial
--      brasileiro receberam o artigo.
--   3. A falha é correlacionada por EXECUÇÃO: dois hosts independentes
--      degradaram juntos e voltaram juntos. É propriedade da posição de rede
--      daquela execução, não da URL.
--
-- Daí a regra: 404 verdadeiro é estável para sempre, bloqueio não sobrevive à
-- troca de runner. O que separa um do outro é ver o mesmo defeito em execuções
-- diferentes, e para isso o resultado de uma execução precisa sobreviver a ela.
-- É só isso que esta tabela guarda.
--
-- Só `morta` e `sem_substancia` entram aqui, que são os dois vereditos capazes
-- de derrubar o gate ou autorizar despublicação. `indisponivel` nunca entrou
-- nessa conta e continua fora. `sem_caminho` também fica fora: é defeito de
-- formato, decidido sem rede, determinístico, e não precisa de confirmação.
--
-- Esta é a ÚNICA escrita que uma execução automática do link-check faz. Ela
-- registra observação sobre URL de terceiro; nunca toca `pontos_atencao`, e
-- portanto nunca muda o que está publicado. A despublicação continua sendo
-- decisão humana, rodada à mão com `--apply`.

create table if not exists public.link_check_url_observacao (
  url               text primary key,
  veredito          text        not null check (veredito in ('morta', 'sem_substancia')),
  primeira_vez_em   timestamptz not null default now(),
  ultima_vez_em     timestamptz not null default now(),
  primeira_execucao text        not null,
  ultima_execucao   text        not null,
  execucoes         integer     not null default 1 check (execucoes >= 1),
  detalhe           text
);

comment on table public.link_check_url_observacao is
  'Defeitos de fonte observados pelo link-check, por URL, para exigir confirmação em execuções distintas antes de morta valer. Ver scripts/link-check-pontos-atencao.ts.';

comment on column public.link_check_url_observacao.execucoes is
  'Quantas execuções DISTINTAS viram este mesmo defeito. Volta a 1 quando o veredito muda; a linha é apagada quando a URL responde conteúdo de novo.';

comment on column public.link_check_url_observacao.primeira_vez_em is
  'Âncora do intervalo mínimo entre a primeira observação e a confirmação. Não é reescrita por observação repetida.';

-- Observação sobre URL de terceiro não tem por que estar em superfície pública,
-- e a service role do script ignora RLS.
alter table public.link_check_url_observacao enable row level security;
revoke all on public.link_check_url_observacao from anon, authenticated;
