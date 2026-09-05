begin read only;
do $$
declare role_name text; privilege_name text;
begin
  if not coalesce((select relrowsecurity from pg_class where oid = 'public.cron_execution_receipts'::regclass), false) then
    raise exception 'cron_receipts: RLS ausente';
  end if;
  foreach role_name in array array['anon', 'authenticated'] loop
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege(role_name, 'public.cron_execution_receipts', privilege_name) then
        raise exception 'cron_receipts: grant inesperado % para %', privilege_name, role_name;
      end if;
    end loop;
  end loop;
  foreach privilege_name in array array['SELECT','INSERT','UPDATE'] loop
    if not has_table_privilege('service_role', 'public.cron_execution_receipts', privilege_name) then
      raise exception 'cron_receipts: grant service_role ausente %', privilege_name;
    end if;
  end loop;
end $$;
select name, completed_at from public.cron_execution_receipts order by name;
select relrowsecurity from pg_class where oid = 'public.cron_execution_receipts'::regclass;
select role_name, has_table_privilege(role_name, 'public.cron_execution_receipts', 'SELECT') as can_select,
  has_table_privilege(role_name, 'public.cron_execution_receipts', 'INSERT') as can_insert,
  has_table_privilege(role_name, 'public.cron_execution_receipts', 'UPDATE') as can_update
from (values ('anon'), ('authenticated'), ('service_role')) roles(role_name);
rollback;
