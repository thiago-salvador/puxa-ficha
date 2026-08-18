-- Prevencao duravel (auditoria DB<->UI 2026-06-04): impede que uma linha
-- publicavel exista em estado-lixo. Causa-raiz do vazamento de wanderlei-barbosa
-- (cargo_disputado='Nenhum' + status='desistente' renderizando na UF/ficha):
-- candidatos_publico so filtra status<>'removido' AND publicavel=true, sem guarda
-- de integridade do que passa. Esta CHECK torna o estado impossivel no proprio
-- write: nao da pra marcar publicavel=true sem cargo de disputa real e com status
-- nao-terminal. Falha fechada na camada de dados, antes da view.
--
-- Escopo deliberado: cobre a classe que VAZA pra UI (sem cargo / status terminal).
-- Os casos de "rotulo errado mas candidato legitimo" (situacao stale tipo
-- "APTO [2022]", status divergente "ativo") ficam para o gate de deteccao
-- audit:published-consistency, porque filtra-los como linha invalida esconderia
-- candidato real. Pre-condicao: 0 violadores em prod (verificado em 2026-06-04).
BEGIN;

ALTER TABLE public.candidatos
  DROP CONSTRAINT IF EXISTS candidatos_publicavel_requires_disputa;

ALTER TABLE public.candidatos
  ADD CONSTRAINT candidatos_publicavel_requires_disputa
  CHECK (
    publicavel IS NOT TRUE
    OR (
      cargo_disputado IS NOT NULL
      AND cargo_disputado <> 'Nenhum'
      AND status NOT IN ('removido', 'desistente')
    )
  );

COMMIT;
