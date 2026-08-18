BEGIN;

-- Estado operacional do encadeamento de noticias. `coleta_log` continua
-- append-only e registra tentativas por candidato; ele nao serve como lock.
-- A chave abaixo torna o append do cron idempotente se a invocacao morrer
-- depois da gravacao e antes de concluir o lote. Outros ingests continuam com
-- `lote_cursor` nulo e preservam integralmente o contrato append-only atual.
alter table public.coleta_log
  add column lote_cursor integer check (lote_cursor is null or lote_cursor >= 0);

comment on column public.coleta_log.lote_cursor is
  'Cursor do lote dentro de uma execucao encadeada. Nulo para ingests sem idempotencia por lote.';

alter table public.coleta_log
  add constraint coleta_log_execucao_lote_candidato_unique
  unique (fonte, execucao, lote_cursor, candidato_id);

create table public.news_refresh_lotes (
  execucao_id uuid        not null,
  cursor      integer     not null check (cursor >= 0),

  estado      text        not null check (estado in ('processing', 'retryable', 'completed')),
  owner_token uuid,
  lease_ate   timestamptz,
  tentativas  integer     not null default 1 check (tentativas > 0),
  falha_codigo text,

  batch_limit            integer not null check (batch_limit > 0),
  chain_depth            integer not null check (chain_depth >= 0),
  chain_enabled          boolean not null,
  revalidate_requested   boolean not null,
  next_cursor            integer check (next_cursor is null or next_cursor >= 0),

  continuacao_estado text not null default 'none'
    check (continuacao_estado in ('none', 'pending', 'dispatching', 'dispatched')),
  continuacao_token uuid,
  continuacao_lease_ate timestamptz,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  primary key (execucao_id, cursor),
  constraint news_refresh_lotes_owner_coerente check (
    (estado = 'processing' and owner_token is not null and lease_ate is not null)
    or (estado <> 'processing' and owner_token is null and lease_ate is null)
  ),
  constraint news_refresh_lotes_continuacao_coerente check (
    (continuacao_estado = 'dispatching'
      and continuacao_token is not null
      and continuacao_lease_ate is not null)
    or (continuacao_estado <> 'dispatching'
      and continuacao_token is null
      and continuacao_lease_ate is null)
  )
);

comment on table public.news_refresh_lotes is
  'Posse e estado idempotente do cron de noticias por (execucao_id, cursor). Interna; nao substitui o historico append-only de coleta_log.';

alter table public.news_refresh_lotes enable row level security;
revoke all on public.news_refresh_lotes from public, anon, authenticated;
grant select, insert, update on public.news_refresh_lotes to service_role;

create index news_refresh_lotes_processing_expired_idx
  on public.news_refresh_lotes (lease_ate)
  where estado = 'processing';

create index news_refresh_lotes_retryable_idx
  on public.news_refresh_lotes (atualizado_em)
  where estado = 'retryable';

create index news_refresh_lotes_continuacao_pending_idx
  on public.news_refresh_lotes (atualizado_em)
  where estado = 'completed' and continuacao_estado = 'pending';

create index news_refresh_lotes_continuacao_expired_idx
  on public.news_refresh_lotes (continuacao_lease_ate)
  where estado = 'completed' and continuacao_estado = 'dispatching';

create or replace function public.acquire_news_refresh_lote(
  p_execucao_id uuid,
  p_cursor integer,
  p_limit integer,
  p_chain_depth integer,
  p_chain_enabled boolean,
  p_revalidate_requested boolean,
  p_lease_seconds integer
)
returns table (
  acquired boolean,
  state text,
  owner_token uuid,
  next_cursor integer,
  continuation_state text,
  batch_limit integer,
  chain_depth integer,
  chain_enabled boolean,
  revalidate_requested boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.news_refresh_lotes%rowtype;
  v_acquired boolean := false;
  v_lease_seconds integer := least(greatest(p_lease_seconds, 30), 900);
begin
  if p_cursor < 0 or p_limit <= 0 or p_chain_depth < 0 then
    raise exception 'invalid news refresh batch coordinates';
  end if;

  insert into public.news_refresh_lotes (
    execucao_id,
    cursor,
    estado,
    owner_token,
    lease_ate,
    batch_limit,
    chain_depth,
    chain_enabled,
    revalidate_requested
  ) values (
    p_execucao_id,
    p_cursor,
    'processing',
    gen_random_uuid(),
    now() + make_interval(secs => v_lease_seconds),
    p_limit,
    p_chain_depth,
    p_chain_enabled,
    p_revalidate_requested
  )
  on conflict (execucao_id, cursor) do update
     set estado = 'processing',
         owner_token = gen_random_uuid(),
         lease_ate = now() + make_interval(secs => v_lease_seconds),
         tentativas = public.news_refresh_lotes.tentativas + 1,
         falha_codigo = null,
         atualizado_em = now()
   where public.news_refresh_lotes.estado = 'retryable'
      or (
        public.news_refresh_lotes.estado = 'processing'
        and public.news_refresh_lotes.lease_ate <= now()
      )
  returning * into v_row;

  v_acquired := found;
  if not v_acquired then
    select *
      into strict v_row
      from public.news_refresh_lotes l
     where l.execucao_id = p_execucao_id
       and l.cursor = p_cursor;
  end if;

  return query
  select v_acquired,
         v_row.estado,
         case when v_acquired then v_row.owner_token else null end,
         v_row.next_cursor,
         v_row.continuacao_estado,
         v_row.batch_limit,
         v_row.chain_depth,
         v_row.chain_enabled,
         v_row.revalidate_requested;
end;
$$;

create or replace function public.renew_news_refresh_lote_lease(
  p_execucao_id uuid,
  p_cursor integer,
  p_owner_token uuid,
  p_lease_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.news_refresh_lotes
     set lease_ate = now() + make_interval(secs => least(greatest(p_lease_seconds, 30), 900)),
         atualizado_em = now()
   where execucao_id = p_execucao_id
     and cursor = p_cursor
     and estado = 'processing'
     and owner_token = p_owner_token;
  return found;
end;
$$;

create or replace function public.complete_news_refresh_lote(
  p_execucao_id uuid,
  p_cursor integer,
  p_owner_token uuid,
  p_next_cursor integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.news_refresh_lotes
     set estado = 'completed',
         owner_token = null,
         lease_ate = null,
         next_cursor = p_next_cursor,
         continuacao_estado = case
           when p_next_cursor is not null and chain_enabled then 'pending'
           else 'none'
         end,
         continuacao_token = null,
         continuacao_lease_ate = null,
         atualizado_em = now()
   where execucao_id = p_execucao_id
     and cursor = p_cursor
     and estado = 'processing'
     and owner_token = p_owner_token;
  return found;
end;
$$;

create or replace function public.retry_news_refresh_lote(
  p_execucao_id uuid,
  p_cursor integer,
  p_owner_token uuid,
  p_error_code text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.news_refresh_lotes
     set estado = 'retryable',
         owner_token = null,
         lease_ate = null,
         falha_codigo = left(p_error_code, 80),
         atualizado_em = now()
   where execucao_id = p_execucao_id
     and cursor = p_cursor
     and estado = 'processing'
     and owner_token = p_owner_token;
  return found;
end;
$$;

create or replace function public.claim_news_refresh_continuacao(
  p_execucao_id uuid,
  p_cursor integer,
  p_lease_seconds integer
)
returns table (
  acquired boolean,
  continuation_token uuid,
  next_cursor integer,
  batch_limit integer,
  chain_depth integer,
  revalidate_requested boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.news_refresh_lotes%rowtype;
  v_acquired boolean := false;
begin
  update public.news_refresh_lotes as l
     set continuacao_estado = 'dispatching',
         continuacao_token = gen_random_uuid(),
         continuacao_lease_ate = now() + make_interval(
           secs => least(greatest(p_lease_seconds, 30), 300)
         ),
         atualizado_em = now()
   where l.execucao_id = p_execucao_id
     and l.cursor = p_cursor
     and l.estado = 'completed'
     and l.next_cursor is not null
     and (
       l.continuacao_estado = 'pending'
       or (
         l.continuacao_estado = 'dispatching'
         and l.continuacao_lease_ate <= now()
       )
     )
  returning l.* into v_row;

  v_acquired := found;
  if not v_acquired then
    select *
      into strict v_row
      from public.news_refresh_lotes l
     where l.execucao_id = p_execucao_id
       and l.cursor = p_cursor;
  end if;

  return query
  select v_acquired,
         case when v_acquired then v_row.continuacao_token else null end,
         v_row.next_cursor,
         v_row.batch_limit,
         v_row.chain_depth,
         v_row.revalidate_requested;
end;
$$;

create or replace function public.finish_news_refresh_continuacao(
  p_execucao_id uuid,
  p_cursor integer,
  p_continuation_token uuid,
  p_accepted boolean
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.news_refresh_lotes
     set continuacao_estado = case when p_accepted then 'dispatched' else 'pending' end,
         continuacao_token = null,
         continuacao_lease_ate = null,
         atualizado_em = now()
   where execucao_id = p_execucao_id
     and cursor = p_cursor
     and continuacao_estado = 'dispatching'
     and continuacao_token = p_continuation_token;
  return found;
end;
$$;

create or replace function public.list_news_refresh_recuperaveis(
  p_limit integer default 20
)
returns table (
  execucao_id uuid,
  cursor integer,
  batch_limit integer,
  chain_depth integer,
  revalidate_requested boolean,
  recovery_kind text
)
language sql
security invoker
set search_path = ''
as $$
  select l.execucao_id,
         l.cursor,
         l.batch_limit,
         l.chain_depth,
         l.revalidate_requested,
         case
           when l.estado = 'retryable' then 'batch_retryable'
           when l.estado = 'processing' then 'batch_lease_expired'
           when l.continuacao_estado = 'pending' then 'continuation_pending'
           else 'continuation_lease_expired'
         end as recovery_kind
    from public.news_refresh_lotes as l
   where l.estado = 'retryable'
      or (l.estado = 'processing' and l.lease_ate <= now())
      or (
        l.estado = 'completed'
        and l.next_cursor is not null
        and (
          l.continuacao_estado = 'pending'
          or (
            l.continuacao_estado = 'dispatching'
            and l.continuacao_lease_ate <= now()
          )
        )
      )
   order by l.atualizado_em asc, l.execucao_id asc, l.cursor asc
   limit least(greatest(p_limit, 1), 50);
$$;

revoke all on function public.acquire_news_refresh_lote(uuid, integer, integer, integer, boolean, boolean, integer) from public, anon, authenticated;
revoke all on function public.renew_news_refresh_lote_lease(uuid, integer, uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_news_refresh_lote(uuid, integer, uuid, integer) from public, anon, authenticated;
revoke all on function public.retry_news_refresh_lote(uuid, integer, uuid, text) from public, anon, authenticated;
revoke all on function public.claim_news_refresh_continuacao(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.finish_news_refresh_continuacao(uuid, integer, uuid, boolean) from public, anon, authenticated;
revoke all on function public.list_news_refresh_recuperaveis(integer) from public, anon, authenticated;

grant execute on function public.acquire_news_refresh_lote(uuid, integer, integer, integer, boolean, boolean, integer) to service_role;
grant execute on function public.renew_news_refresh_lote_lease(uuid, integer, uuid, integer) to service_role;
grant execute on function public.complete_news_refresh_lote(uuid, integer, uuid, integer) to service_role;
grant execute on function public.retry_news_refresh_lote(uuid, integer, uuid, text) to service_role;
grant execute on function public.claim_news_refresh_continuacao(uuid, integer, integer) to service_role;
grant execute on function public.finish_news_refresh_continuacao(uuid, integer, uuid, boolean) to service_role;
grant execute on function public.list_news_refresh_recuperaveis(integer) to service_role;

COMMIT;

-- Rollback reversivel (nao executar junto com a migration):
-- drop function if exists public.list_news_refresh_recuperaveis(integer);
-- drop function if exists public.finish_news_refresh_continuacao(uuid, integer, uuid, boolean);
-- drop function if exists public.claim_news_refresh_continuacao(uuid, integer, integer);
-- drop function if exists public.retry_news_refresh_lote(uuid, integer, uuid, text);
-- drop function if exists public.complete_news_refresh_lote(uuid, integer, uuid, integer);
-- drop function if exists public.renew_news_refresh_lote_lease(uuid, integer, uuid, integer);
-- drop function if exists public.acquire_news_refresh_lote(uuid, integer, integer, integer, boolean, boolean, integer);
-- drop table if exists public.news_refresh_lotes;
-- alter table public.coleta_log drop constraint if exists coleta_log_execucao_lote_candidato_unique;
-- alter table public.coleta_log drop column if exists lote_cursor;
