-- Remove os dois registros de patrimônio de jarbas-soares contaminados por
-- homônimo. O cabeçalho de scripts/backfill-cpf-tse.ts documenta o caso desde
-- 2026-08-05: a ficha é de Jarbas Soares Júnior (ex-procurador-geral de
-- justiça de MG, 36 anos de MPMG), que não pode ter sido candidato a vereador
-- em 2008 nem a vice-prefeito em 2020; as linhas correspondentes de
-- historico_politico já foram despublicadas em 05/08, mas os bens declarados
-- pelos homônimos (SQ 47351/MG-2008 e SQ 130000743230/2020) seguiam expostos.
-- Auditoria A2C da execução pf-patrimonio-20260807T170643Z confirmou a
-- disputa. A remoção é reversível pelo histórico de migrations (os valores
-- integrais ficam no arquivo 20260630094500/152000 que os criou).
BEGIN;

-- @write tabela=patrimonio slug=jarbas-soares campos=remocao_registros_homonimo
DELETE FROM public.patrimonio p
USING public.candidatos c
WHERE p.candidato_id = c.id
  AND c.slug = 'jarbas-soares'
  AND p.id IN (
    'b5b0f905-3062-47a2-bf90-54b42c6b588c',
    'af3bc5d5-65d2-4300-b20d-6050b482594b'
  );

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n
  FROM public.patrimonio p
  JOIN public.candidatos c ON c.id = p.candidato_id
  WHERE c.slug = 'jarbas-soares';

  IF n <> 0 THEN
    RAISE EXCEPTION 'patrimonio de jarbas-soares deveria ficar vazio apos remocao do homonimo; restam % linha(s)', n;
  END IF;
END $$;

COMMIT;
