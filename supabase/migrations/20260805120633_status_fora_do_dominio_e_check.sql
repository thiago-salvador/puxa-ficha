-- Status que mentem sobre a situação do candidato, e um CHECK para não voltar.
-- Aprovada pelo mantenedor em 05/08/2026.
--
-- ORIGEM
--
-- `src/lib/types.ts` declara o domínio de `candidatos.status`:
--
--   'pre-candidato' | 'candidato' | 'indeferido' | 'desistente' | 'removido'
--
-- O banco nunca soube disso. Distribuição encontrada em 05/08/2026:
--
--   pre-candidato  249  (194 publicáveis)
--   desistente      19
--   removido        11
--   ativo            1   <- não existe no domínio
--
-- Além do valor inválido, três fichas seguiam `pre-candidato` descrevendo
-- situação que acabou. Nenhuma das quatro é publicável, então isto não é
-- correção da superfície pública: é o banco parar de afirmar o que não é.
--
-- CONVENÇÃO EXISTENTE, lida dos dados antes de escolher os valores
--
-- As 19 linhas `desistente` têm TODAS `cargo_disputado = 'Nenhum'`: o status diz
-- que a pessoa saiu, e o cargo deixa de afirmar disputa. As 11 linhas
-- `removido` mantêm o cargo original e são registros aposentados do roster
-- (seis deles registros presidenciais de gente que segue em outra disputa, como
-- `tarcisio` e `ciro-gomes`). Esta migration segue as duas convenções.
--
-- EVIDÊNCIA, uma a uma
--
-- 1. marcio-franca: `ativo`. Valor que não existe no domínio, e o único caso.
--    Vai para `pre-candidato`, que é a MENOR afirmação possível entre os
--    valores válidos: não inventa saída nem remoção. O `cargo_disputado`
--    ('Governador'/SP) NÃO é tocado, embora esteja sob suspeita: a cobertura
--    do próprio banco (O Globo 01/06, Estadão 29/05, Valor 02/06) o coloca como
--    vice de Haddad ou candidato ao Senado, não como pré-candidato ao governo
--    de SP. Trocar o cargo é decisão editorial com fonte a confirmar, e fica
--    registrado aqui em vez de ser adivinhado.
--
-- 2. maria-da-consolacao: retirou a pré-candidatura, e o PSOL-MG reprovou
--    candidatura própria. Entrada editorial do mantenedor no pedido desta
--    sessão; NÃO há matéria no `noticias_candidato` do projeto que registre a
--    retirada, e por isso a proveniência fica declarada como curadoria, não
--    como fonte de imprensa. Vai para `desistente` + cargo 'Nenhum'.
--
-- 3. aldo-rebelo: `removido`, não `desistente`. O DC lançou Joaquim Barbosa no
--    lugar dele (G1 e CartaCapital, 17-18/05/2026) e a Justiça Eleitoral
--    oficializou a expulsão/desfiliação (G1 e CNN Brasil, 27/05/2026), mas ele
--    afirmou publicamente que a candidatura seguia de pé ("Minha candidatura
--    está mantida", CNN 18/05; CBN 23/05). Marcá-lo `desistente` afirmaria uma
--    desistência que ele nega. `removido` descreve o que de fato aconteceu: o
--    registro saiu do ar. Todas essas matérias estão em `noticias_candidato`.
--
-- 4. ratinho-junior: `desistente` + cargo 'Nenhum'. Aqui a saída é dele e é
--    explícita: "Ratinho Jr. decide concluir mandato no Paraná e sai da corrida
--    presidencial" (CNN Brasil, 23/03/2026), com CBN e Gazeta do Povo no mesmo
--    dia. A Gazeta do Povo de 01/04 fala da "saída de Tarcísio, Ratinho Jr. e
--    Eduardo Leite do páreo", e `eduardo-leite` já está no banco como
--    `desistente` com cargo 'Nenhum': mesmo fato, mesmo tratamento.
--
-- A fronteira entre `removido` e `desistente` não está escrita em lugar nenhum
-- do projeto, e os dados existentes usam as duas para saídas da corrida
-- presidencial (tarcisio `removido`, eduardo-leite `desistente`). O critério
-- aplicado aqui é: `desistente` quando a pessoa declarou a saída, `removido`
-- quando o registro foi aposentado sem declaração dela. Definir isso de vez é
-- decisão do dono do projeto, e fica anotada como pendência.
BEGIN;

-- ---------------------------------------------------------------------------
-- @write tabela=candidatos slug=marcio-franca campos=status,ultima_atualizacao
UPDATE public.candidatos
SET status = 'pre-candidato',
    ultima_atualizacao = now()
WHERE slug = 'marcio-franca' AND status = 'ativo';

-- ---------------------------------------------------------------------------
-- @write tabela=candidatos slug=maria-da-consolacao campos=status,cargo_disputado,ultima_atualizacao
UPDATE public.candidatos
SET status = 'desistente',
    cargo_disputado = 'Nenhum',
    ultima_atualizacao = now()
WHERE slug = 'maria-da-consolacao' AND status = 'pre-candidato';

-- ---------------------------------------------------------------------------
-- @write tabela=candidatos slug=aldo-rebelo campos=status,ultima_atualizacao
UPDATE public.candidatos
SET status = 'removido',
    ultima_atualizacao = now()
WHERE slug = 'aldo-rebelo' AND status = 'pre-candidato';

-- ---------------------------------------------------------------------------
-- @write tabela=candidatos slug=ratinho-junior campos=status,cargo_disputado,ultima_atualizacao
UPDATE public.candidatos
SET status = 'desistente',
    cargo_disputado = 'Nenhum',
    ultima_atualizacao = now()
WHERE slug = 'ratinho-junior' AND status = 'pre-candidato';

-- ---------------------------------------------------------------------------
-- O gate: o domínio do TypeScript passa a existir no banco.
--
-- Sem isto, a próxima escrita com um valor inventado entra igual à de hoje e só
-- aparece quando alguém for auditar. `NOT VALID` não serve aqui: a intenção é
-- justamente provar, na aplicação, que não sobrou nenhuma linha fora do
-- domínio, e o passo acima já limpou a única que havia.
ALTER TABLE public.candidatos
  ADD CONSTRAINT candidatos_status_dominio
  CHECK (status IN ('pre-candidato', 'candidato', 'indeferido', 'desistente', 'removido'));

COMMENT ON CONSTRAINT candidatos_status_dominio ON public.candidatos IS
  'Espelha o union de status em src/lib/types.ts. Mudou la, muda aqui na mesma PR.';

-- ---------------------------------------------------------------------------
-- Conferência.
DO $$
DECLARE
  fora_do_dominio integer;
  marcio text;
  maria text;
  aldo text;
  ratinho text;
  maria_cargo text;
  ratinho_cargo text;
  desistentes_sem_nenhum integer;
BEGIN
  SELECT COUNT(*) INTO fora_do_dominio FROM public.candidatos
   WHERE status NOT IN ('pre-candidato', 'candidato', 'indeferido', 'desistente', 'removido');
  IF fora_do_dominio <> 0 THEN
    RAISE EXCEPTION 'status_dominio: % linha(s) ainda fora do dominio', fora_do_dominio;
  END IF;

  SELECT status INTO marcio FROM public.candidatos WHERE slug = 'marcio-franca';
  SELECT status, cargo_disputado INTO maria, maria_cargo FROM public.candidatos WHERE slug = 'maria-da-consolacao';
  SELECT status INTO aldo FROM public.candidatos WHERE slug = 'aldo-rebelo';
  SELECT status, cargo_disputado INTO ratinho, ratinho_cargo FROM public.candidatos WHERE slug = 'ratinho-junior';

  IF marcio <> 'pre-candidato' OR maria <> 'desistente' OR aldo <> 'removido' OR ratinho <> 'desistente' THEN
    RAISE EXCEPTION 'status_dominio: esperado pre-candidato/desistente/removido/desistente, encontrado %/%/%/%',
      marcio, maria, aldo, ratinho;
  END IF;

  IF maria_cargo <> 'Nenhum' OR ratinho_cargo <> 'Nenhum' THEN
    RAISE EXCEPTION 'status_dominio: desistente tem de vir com cargo Nenhum, encontrado %/%',
      maria_cargo, ratinho_cargo;
  END IF;

  -- A convenção que os 19 desistentes já seguiam continua valendo para os 21.
  SELECT COUNT(*) INTO desistentes_sem_nenhum FROM public.candidatos
   WHERE status = 'desistente' AND cargo_disputado IS DISTINCT FROM 'Nenhum';
  IF desistentes_sem_nenhum <> 0 THEN
    RAISE EXCEPTION 'status_dominio: % desistente(s) sem cargo Nenhum', desistentes_sem_nenhum;
  END IF;
END $$;

COMMIT;

-- Verificação pós-aplicação (rodar manualmente):
--
--   select status, count(*) from candidatos group by status order by 2 desc;
--   select slug, status, cargo_disputado, publicavel from candidatos
--    where slug in ('marcio-franca','maria-da-consolacao','aldo-rebelo','ratinho-junior');
--
-- PENDENTE, fora do escopo desta migration:
--   - `marcio-franca` com `cargo_disputado = 'Governador'` (SP) enquanto a
--     cobertura do próprio banco o coloca como vice de Haddad ou Senado.
--   - escrever o critério que separa `removido` de `desistente`, hoje aplicado
--     por leitura caso a caso.
