BEGIN;

-- Esta migration compartilha a reversão coordenada da 20260829030000.
-- Não repetir aqui a remoção da constraint/view: isso duplicaria a escrita
-- destrutiva e deixaria o ledger sem uma transação única de rollback.
DO $$
BEGIN
  RAISE EXCEPTION
    'rollback 20260829030001 fail-closed: execute o rollback coordenado 20260829030000';
END $$;

COMMIT;
