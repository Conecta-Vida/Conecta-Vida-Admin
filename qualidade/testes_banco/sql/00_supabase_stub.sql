-- =====================================================================
-- STUB do ambiente Supabase para rodar as migrations num PostgreSQL comum.
-- (Trabalho 2 de Qualidade de Software: este arquivo é um "stub", ou seja,
--  substitui partes do Supabase que não existem num Postgres puro.)
--
--  * roles anon / authenticated  -> mesmos nomes usados pelas políticas RLS
--  * auth.users e auth.uid()     -> auth.uid() lê o usuário "logado" da
--                                   configuração request.jwt.claim.sub,
--                                   como o PostgREST do Supabase faz
--  * storage.buckets/objects     -> só as tabelas usadas pelas migrations
--  * cron.job/schedule/unschedule-> o pg_cron não roda aqui; as funções
--                                   agendadas são chamadas direto nos testes
--  * publication supabase_realtime
-- =====================================================================

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  confirmation_sent_at timestamptz,
  raw_user_meta_data jsonb
);

create or replace function auth.uid() returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (id bigserial primary key, bucket_id text, name text);
alter table storage.objects enable row level security;

create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create or replace function cron.schedule(p_nome text, p_quando text, p_comando text) returns bigint
language sql as $$ insert into cron.job (jobname, schedule, command) values (p_nome, p_quando, p_comando) returning jobid $$;
create or replace function cron.unschedule(p_nome text) returns boolean
language sql as $$ delete from cron.job where jobname = p_nome returning true $$;

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
