-- Fechamento BA Governador: alinhar mudancas_partido de Jerônimo ao perfil público.
-- Remove duas transições 2022 que o runtime público descarta; preserva a linha curada 2026 que explica o partido atual.

BEGIN;

DELETE FROM public.mudancas_partido
WHERE id IN (
  '0811c939-7e11-400b-841f-397a4d82c8f9',
  '3b801f12-64c3-4d87-96e4-e153bf1735cc'
);

COMMIT;
