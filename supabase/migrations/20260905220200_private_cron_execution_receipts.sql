begin;

-- Recibos operacionais não são coleta, proveniência eleitoral ou ledger.
-- Uma linha por cron limita crescimento sem apagar histórico de dados.
create table public.cron_execution_receipts (
  name text primary key check (name in ('published-consistency', 'revalidate-public-cache')),
  completed_at timestamptz not null
);
alter table public.cron_execution_receipts enable row level security;
revoke all on public.cron_execution_receipts from public, anon, authenticated;
grant select, insert, update on public.cron_execution_receipts to service_role;
comment on table public.cron_execution_receipts is
  'Última conclusão bem-sucedida de crons operacionais. Privado, service_role; não compõe proveniência pública.';

commit;
