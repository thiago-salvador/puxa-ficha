begin;

alter table public.cron_execution_receipts
  drop constraint if exists cron_execution_receipts_name_check;

alter table public.cron_execution_receipts
  add constraint cron_execution_receipts_name_check
  check (name in ('news-refresh-recover', 'published-consistency', 'revalidate-public-cache'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cron_execution_receipts'::regclass
      and conname = 'cron_execution_receipts_name_check'
  ) then
    raise exception 'cron_receipts: constraint de nomes ausente';
  end if;
end $$;

commit;
