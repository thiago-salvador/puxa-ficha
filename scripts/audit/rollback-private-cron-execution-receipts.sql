-- Executar apenas após reverter os handlers e a sonda para a versão anterior.
-- Preserva os últimos recibos em vez de descartar registros operacionais.
begin;
alter table public.cron_execution_receipts rename to cron_execution_receipts_retired_20260905220200;
commit;
