BEGIN READ ONLY;
DO $readback$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260924003000')
     OR EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot
        WHERE migration_version = '20260924003000')
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao = 'rollback:20260924003000') <> 10
     OR EXISTS (SELECT 1 FROM public.historico_politico WHERE id IN (
          '2b6b20ad-1061-4d07-888f-1dfd22b2e79e','568f79ec-11ea-41db-b467-407c4a40e4fe',
          '7b9e9ecc-0267-44a2-bfb6-6077d313f710','09c10035-fa5a-4924-a1c5-9bd19f02265c',
          'aad8d422-814a-4fa4-b702-5a0f3771942f','b8cb5725-8edc-4ddf-8ba3-b9b02c74f395',
          'edd4abf4-a997-43be-a1c3-e162ae057e4e','10ad39ff-e133-4eee-8a50-9687e5fc4443',
          'eee1bd01-830f-4c79-a7a1-8cc62e7d1074','28320249-4c63-4906-9984-7ea3f0537db3'))
     OR (SELECT count(*) FROM public.historico_politico WHERE id IN (
          'e0f072e8-2c69-40d3-8754-7c1c97092b91','a9fed6c6-7402-42fd-81b8-44b1b62ff246',
          '59c27149-9d84-491a-a810-4d03ac9f0418','14dc2eaa-b08b-4a02-9ae3-c30ffaf8a9db',
          '145d429b-6a6f-487b-b92a-ba6062381ee4','55f20f2b-284e-443c-932f-05a1e3f5c954',
          '68e8b267-4d07-4a36-9003-fccffc588b8e','1a58e138-d673-443f-bdab-c950508b65c9',
          'bac83c09-ff82-4485-9a01-7c8b1937751d','a3a26ee1-0795-4a29-8dfe-6b136ab24bb2')
          AND proveniencia = 'senado') <> 10 THEN
    RAISE EXCEPTION 'senado exercicio reaberto rollback readback: estado anterior nao restaurado';
  END IF;
END
$readback$;
SELECT 'senado exercicio reaberto rollback readback ok' AS status;
COMMIT;
