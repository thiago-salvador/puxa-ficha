-- historico_politico: cargo canônico (dedup), backfill SQL, remoção de duplicatas, índice único.
-- Convenção alinhada ao TSE: periodo_inicio = ano de eleição quando a linha vem do TSE.

ALTER TABLE historico_politico ADD COLUMN IF NOT EXISTS cargo_canonico text;

COMMENT ON COLUMN historico_politico.cargo_canonico IS 'Chave dedup; espelha scripts/lib/cargo-utils.ts canonicalCargo()';

-- Remover candidaturas TSE sem pleito válido (decisão editorial; ingest futuro também omite)
DELETE FROM historico_politico
WHERE COALESCE(observacoes, '') ILIKE 'CANDIDATURA:%'
  AND (
    COALESCE(observacoes, '') ILIKE '%#NULO#%'
    OR COALESCE(observacoes, '') ILIKE '%INDEFERIDO%'
    OR COALESCE(observacoes, '') ILIKE '%RENUNCIA%'
    OR COALESCE(observacoes, '') ILIKE '%RENÚNCIA%'
    OR COALESCE(observacoes, '') ILIKE '%CASSADO%'
    OR COALESCE(observacoes, '') ILIKE '%FALECIDO%'
  );

UPDATE historico_politico SET cargo_canonico = 'Presidente'
WHERE cargo_canonico IS NULL AND (
  lower(trim(cargo)) = 'presidente'
  OR lower(trim(cargo)) LIKE 'presidente da rep%'
  OR lower(trim(cargo)) LIKE 'presidente do brasil%'
);

UPDATE historico_politico SET cargo_canonico = 'Vice-Presidente'
WHERE cargo_canonico IS NULL AND (
  lower(trim(cargo)) LIKE 'vice-presidente%'
  OR lower(trim(cargo)) LIKE 'vice presidente%'
);

UPDATE historico_politico SET cargo_canonico = 'Governador'
WHERE cargo_canonico IS NULL AND lower(trim(cargo)) LIKE 'governador%';

UPDATE historico_politico SET cargo_canonico = 'Vice-Governador'
WHERE cargo_canonico IS NULL AND (
  lower(trim(cargo)) LIKE 'vice-governador%'
  OR lower(trim(cargo)) LIKE 'vice governador%'
);

UPDATE historico_politico SET cargo_canonico = 'Prefeito'
WHERE cargo_canonico IS NULL AND lower(trim(cargo)) LIKE 'prefeito%';

UPDATE historico_politico SET cargo_canonico = 'Vice-Prefeito'
WHERE cargo_canonico IS NULL AND (
  lower(trim(cargo)) LIKE 'vice-prefeito%'
  OR lower(trim(cargo)) LIKE 'vice prefeito%'
);

UPDATE historico_politico SET cargo_canonico = 'Deputado Federal'
WHERE cargo_canonico IS NULL AND lower(cargo) LIKE '%deputado federal%';

UPDATE historico_politico SET cargo_canonico = 'Deputado Estadual'
WHERE cargo_canonico IS NULL AND lower(cargo) LIKE '%deputado estadual%';

UPDATE historico_politico SET cargo_canonico = 'Deputado Distrital'
WHERE cargo_canonico IS NULL AND lower(cargo) LIKE '%deputado distrital%';

UPDATE historico_politico SET cargo_canonico = 'Senador'
WHERE cargo_canonico IS NULL AND lower(trim(cargo)) LIKE 'senador%';

UPDATE historico_politico SET cargo_canonico = 'Vereador'
WHERE cargo_canonico IS NULL AND lower(trim(cargo)) LIKE 'vereador%';

UPDATE historico_politico SET cargo_canonico = trim(cargo)
WHERE cargo_canonico IS NULL;

DELETE FROM historico_politico hp
USING (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY candidato_id, cargo_canonico, periodo_inicio
        ORDER BY
          CASE
            WHEN COALESCE(observacoes, '') ILIKE '%TSE%' THEN 0
            WHEN COALESCE(observacoes, '') ILIKE '%WIKIDATA%'
              OR COALESCE(observacoes, '') ILIKE '%IMPORTADO AUTOMATICAMENTE%' THEN 2
            ELSE 1
          END,
          LENGTH(COALESCE(cargo, '')) DESC,
          id::text
      ) AS rn
    FROM historico_politico
    WHERE periodo_inicio IS NOT NULL
      AND cargo_canonico IS NOT NULL
  ) sub
  WHERE rn > 1
) del
WHERE hp.id = del.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_historico_politico_candidato_cargo_canon_inicio
ON historico_politico (candidato_id, cargo_canonico, periodo_inicio)
WHERE periodo_inicio IS NOT NULL AND cargo_canonico IS NOT NULL;
