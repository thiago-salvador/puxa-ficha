-- Item 7: dá a `votacoes_chave` a chave que identifica a VOTAÇÃO, não a proposição.
--
-- ## Por que a chave atual não serve
--
-- O matching de votos casava por `proposicao_id`. Uma proposição tem muitas
-- votações (33 no Teto de Gastos, 44 na Reforma da Previdência), e casar por ela
-- significa aceitar qualquer uma: destaque, requerimento de urgência, redação
-- final, votação de comissão. Medido em 10/08/2026 contra a Câmara Dados
-- Abertos, as SEIS linhas da Câmara que tinham voto estavam defeituosas, com 100
-- pares candidato-voto publicados:
--
--   - quatro casadas com votação PROCEDIMENTAL (PL das Fake News por
--     requerimento de urgência; Reforma Trabalhista, Marco Temporal e Auxílio
--     Brasil por redação final);
--   - quatro com data divergente da votação efetivamente casada.
--
-- Conferido voto a voto no caso mais claro: os 13 votos publicados como
-- "PL das Fake News, 10/04/2024" batem byte a byte com os da votação
-- `2310837-8`, de 25/04/2023, cuja descrição oficial é "Aprovado o Requerimento
-- de Urgência (Art. 154 do RICD)". Votar a favor de acelerar a tramitação não é
-- votar a favor do conteúdo, e o mérito nunca foi a Plenário.
--
-- ## O que esta migration faz
--
-- Acrescenta duas colunas e o índice único que as transforma em chave:
--
--   fonte             de onde veio a votação ('camara' | 'senado')
--   votacao_id_api    id EXATO da votação na fonte (ex.: '2310837-8')
--
-- A partir daí, `(fonte, votacao_id_api)` endereça uma votação e só uma. Some a
-- ambiguidade de qual rodada casou, some a busca por proposição e some o
-- `plenVotacoes.slice(0, 3)` de `scripts/lib/ingest-camara.ts`, que só olhava as
-- três primeiras votações de Plenário e deixava 30 fora do alcance no Teto.
--
-- ## O que esta migration NÃO faz
--
-- Não escreve linha nenhuma: é só DDL, e por isso não carrega anotação de
-- escrita. O gate detecta migration anotada por substring, então a própria
-- palavra não pode aparecer aqui nem em prosa, sob pena de este arquivo ser
-- contado como escrita declarada e cobrar recorte que ele não precisa.
-- A despublicação das linhas defeituosas está em `20260810090100` e a inclusão
-- do dataset novo em `20260810090200`.
--
-- As colunas nascem anuláveis de propósito. As 13 linhas do Senado ainda não
-- foram auditadas e continuam sem `votacao_id_api`; torná-la obrigatória agora
-- derrubaria a migration por causa delas. O ingest é que passa a exigir a chave,
-- e votação sem ela simplesmente não casa voto nenhum.

alter table public.votacoes_chave
  add column if not exists fonte text,
  add column if not exists votacao_id_api text;

comment on column public.votacoes_chave.fonte is
  'Fonte da votacao: camara (Camara Dados Abertos v2) ou senado (Senado Dados Abertos). Metade da chave composta com votacao_id_api.';

comment on column public.votacoes_chave.votacao_id_api is
  'Id EXATO da votacao na fonte, ex.: 2310837-8. Enderecar por proposicao aceita qualquer rodada (destaque, urgencia, redacao final) e foi a causa das 6 linhas defeituosas de 10/08/2026.';

alter table public.votacoes_chave
  add constraint votacoes_chave_fonte_id_consistentes_check
  check (
    (fonte is null and votacao_id_api is null)
    or (
      fonte in ('camara', 'senado')
      and votacao_id_api is not null
      and btrim(votacao_id_api) <> ''
    )
  );

-- Único e parcial: as linhas ainda não auditadas ficam com `votacao_id_api`
-- nulo, e `null` não colide com `null` no índice, então elas convivem com a
-- chave nova sem bloquear a migration.
create unique index if not exists votacoes_chave_fonte_votacao_id_api_key
  on public.votacoes_chave (fonte, votacao_id_api)
  where fonte is not null and votacao_id_api is not null;
