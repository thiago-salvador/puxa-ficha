-- READBACK SOMENTE LEITURA de 20261001100000_cpf_removido_motivo_trajetoria.sql
DO $readback$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM supabase_migrations.schema_migrations WHERE version = '20261001100000';
  IF n <> 1 THEN RAISE EXCEPTION 'readback cpf-motivo: ledger=%', n; END IF;

  SELECT count(*) INTO n
  FROM (VALUES
    ('e0c26051-9de3-4135-86fb-f9ba72028a30'::uuid),
    ('4d71e1ab-10fb-4d57-8bb3-b118cdd404e7'::uuid),
    ('3df17e2a-4fb3-4701-9e74-69c8e9f8ce4c'::uuid),
    ('db46d0a9-a822-4029-9007-62b7da0155a1'::uuid),
    ('9120d6d7-5010-4709-99de-a76422250fbf'::uuid),
    ('fd2ff3cd-9323-4022-9692-138e98f7788f'::uuid),
    ('8d36bb5a-1e41-4788-b17c-cbd9dd854fa9'::uuid)
  ) AS e(id)
  JOIN public.mudancas_partido m ON m.id = e.id
  JOIN public.candidatos c ON c.id = m.candidato_id AND c.slug = 'andre-do-prado'
  WHERE m.despublicado_em = timestamptz '2026-09-18T00:00:00Z'
    AND m.despublicacao_motivo LIKE 'Trajetoria derivada de homonimo: as linhas vieram de ANDRE LUIS DO PRADO CPF [CPF removido] (PSTU, %'
    AND (SELECT count(*) FROM regexp_matches(m.despublicacao_motivo, 'CPF \[CPF removido\]', 'g')) = 2;
  IF n <> 7 THEN RAISE EXCEPTION 'readback cpf-motivo: % linhas com o texto novo (esperadas 7)', n; END IF;

  SELECT count(*) INTO n FROM public.mudancas_partido
   WHERE despublicacao_motivo ~ '(?<![0-9])[0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}(?![0-9])';
  IF n <> 0 THEN RAISE EXCEPTION 'readback cpf-motivo: % motivo(s) ainda com 11 digitos', n; END IF;

  SELECT count(*) INTO n FROM public.coleta_log
   WHERE execucao = 'migration:20261001100000' AND fonte = 'auditoria-cpf-versionado' AND natureza = 'escrita';
  IF n <> 1 THEN RAISE EXCEPTION 'readback cpf-motivo: recibo=% (esperado 1)', n; END IF;
  RAISE NOTICE 'readback cpf-motivo: 7 linhas com o marcador, zero motivo com 11 digitos, 1 recibo';
END
$readback$;
