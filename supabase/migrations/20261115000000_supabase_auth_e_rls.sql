-- =====================================================================
-- Conecta Vida: arquitetura sem API Java.
-- O aplicativo (Flutter) e o painel (React) passam a falar direto com o
-- Supabase: login pelo Supabase Auth e acesso aos dados controlado por RLS.
--
-- Migração ADITIVA: não remove nem altera tabelas/colunas existentes, então
-- a API Java antiga (que conecta como "postgres" e ignora RLS) continua
-- funcionando enquanto a troca não termina. Pode ser executada mais de uma vez.
-- =====================================================================

-- 1. Vínculo entre o perfil (public.usuarios) e a conta do Supabase Auth ----
alter table public.usuarios
  add column if not exists auth_id uuid unique references auth.users (id) on delete cascade;

comment on column public.usuarios.auth_id is
  'Conta do Supabase Auth dona deste perfil. Nulo = conta antiga (API Java) ainda não migrada.';

-- 2. Funções auxiliares (schema privado, fora da API REST) ------------------
create schema if not exists app;

create or replace function app.usuario_id()
returns bigint language sql stable security definer set search_path = ''
as $$ select u.id from public.usuarios u where u.auth_id = (select auth.uid()) $$;

create or replace function app.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.usuarios u
    where u.auth_id = (select auth.uid()) and u.permissao = 'Administrador'
  )
$$;

revoke all on function app.usuario_id(), app.is_admin() from public;
grant usage on schema app to authenticated;
grant execute on function app.usuario_id(), app.is_admin() to authenticated;

-- 3. Cria/vincula o perfil quando uma conta do Auth é confirmada ------------
create or replace function app.sincronizar_perfil()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  existente public.usuarios%rowtype;
  nascimento integer;
begin
  -- Só depois que o e-mail é confirmado (imediato se a confirmação estiver desligada).
  if new.email is null or new.email_confirmed_at is null then
    return new;
  end if;
  if exists (select 1 from public.usuarios u where u.auth_id = new.id) then
    return new;
  end if;

  select * into existente from public.usuarios u where lower(u.email) = lower(new.email);

  if found then
    -- Perfil antigo com o mesmo e-mail: herda inscrições e dependentes.
    -- Um perfil de administrador só é herdado se o e-mail foi confirmado por
    -- link de verdade; com a confirmação desligada isso seria tomar a conta.
    if existente.permissao = 'Administrador' and new.confirmation_sent_at is null then
      raise exception 'Este e-mail pertence a um administrador e precisa ser vinculado manualmente.';
    end if;
    update public.usuarios set auth_id = new.id where id = existente.id;
    return new;
  end if;

  begin
    nascimento := nullif(meta ->> 'data_nascimento', '')::integer;
  exception when others then
    nascimento := null;
  end;

  insert into public.usuarios (nome, email, senha, sexo, localizacao, data_nascimento, permissao, auth_id)
  values (
    coalesce(nullif(trim(meta ->> 'nome'), ''), split_part(new.email, '@', 1)),
    lower(new.email),
    'supabase-auth',            -- a senha real fica só no Supabase Auth
    nullif(meta ->> 'sexo', ''),
    nullif(meta ->> 'localizacao', ''),
    nascimento,
    'Usuário Comum',            -- permissão nunca vem do cliente
    new.id
  );
  return new;
end;
$$;

drop trigger if exists conecta_sincronizar_perfil on auth.users;
create trigger conecta_sincronizar_perfil
  after insert or update of email_confirmed_at on auth.users
  for each row execute function app.sincronizar_perfil();

-- 4. Privilégios: nada para visitantes; colunas sensíveis protegidas --------
revoke all on all tables in schema public from anon;

-- A coluna "senha" (hash antigo) nunca sai pela API; permissão/e-mail/vínculo
-- não podem ser alterados direto pelo cliente.
revoke all on public.usuarios from authenticated;
grant select (id, nome, email, sexo, localizacao, permissao, data_nascimento, auth_id)
  on public.usuarios to authenticated;
grant update (nome, sexo, localizacao, data_nascimento)
  on public.usuarios to authenticated;

do $$
begin
  if to_regclass('public.flyway_schema_history') is not null then
    revoke all on public.flyway_schema_history from authenticated;
  end if;
end $$;
grant usage, select on sequence public.usuarios_campanhas_id_seq to authenticated;

-- 5. Tokens de push (antes ficavam só na memória da API Java) ---------------
create table if not exists public.dispositivos_push (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references public.usuarios (id) on delete cascade,
  token text not null unique,
  plataforma text,
  atualizado_em timestamp without time zone not null default now()
);
alter table public.dispositivos_push enable row level security;
revoke all on public.dispositivos_push from anon;
grant select, insert, update, delete on public.dispositivos_push to authenticated;

-- 6. Regras de acesso (RLS) -------------------------------------------------
-- Recria as políticas desta migração para poder rodar de novo sem erro.
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public' and policyname like 'cv_%' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- Comunicações e instituições: todos os logados leem; só administradores gravam.
create policy cv_comunicacoes_leitura on public.comunicacoes
  for select to authenticated using (true);
create policy cv_comunicacoes_admin_insert on public.comunicacoes
  for insert to authenticated with check ((select app.is_admin()));
create policy cv_comunicacoes_admin_update on public.comunicacoes
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy cv_comunicacoes_admin_delete on public.comunicacoes
  for delete to authenticated using ((select app.is_admin()));

create policy cv_instituicoes_leitura on public.instituicoes_saude
  for select to authenticated using (true);
create policy cv_instituicoes_admin_insert on public.instituicoes_saude
  for insert to authenticated with check ((select app.is_admin()));
create policy cv_instituicoes_admin_update on public.instituicoes_saude
  for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy cv_instituicoes_admin_delete on public.instituicoes_saude
  for delete to authenticated using ((select app.is_admin()));

-- Usuários: cada um vê e edita o próprio perfil; administradores veem e editam todos.
create policy cv_usuarios_leitura on public.usuarios
  for select to authenticated
  using (auth_id = (select auth.uid()) or (select app.is_admin()));
create policy cv_usuarios_update on public.usuarios
  for update to authenticated
  using (auth_id = (select auth.uid()) or (select app.is_admin()))
  with check (auth_id = (select auth.uid()) or (select app.is_admin()));

-- Dependentes: só o titular; administradores apenas leem.
create policy cv_dependentes_leitura on public.dependentes
  for select to authenticated
  using (usuario_titular_id = (select app.usuario_id()) or (select app.is_admin()));
create policy cv_dependentes_insert on public.dependentes
  for insert to authenticated with check (usuario_titular_id = (select app.usuario_id()));
create policy cv_dependentes_update on public.dependentes
  for update to authenticated
  using (usuario_titular_id = (select app.usuario_id()))
  with check (usuario_titular_id = (select app.usuario_id()));

-- Inscrições em campanhas: só as da própria conta, para si ou para um
-- dependente ativo seu, e apenas em comunicações do tipo campanha.
create policy cv_inscricoes_leitura on public.usuarios_campanhas
  for select to authenticated
  using (usuario_id = (select app.usuario_id()) or (select app.is_admin()));
create policy cv_inscricoes_insert on public.usuarios_campanhas
  for insert to authenticated
  with check (
    usuario_id = (select app.usuario_id())
    and exists (select 1 from public.comunicacoes c
                where c.id = comunicacao_id and upper(c.tipo) = 'CAMPANHA')
    and (dependente_id is null or exists (
          select 1 from public.dependentes d
          where d.id = dependente_id and d.ativo
            and d.usuario_titular_id = (select app.usuario_id())))
  );
create policy cv_inscricoes_delete on public.usuarios_campanhas
  for delete to authenticated using (usuario_id = (select app.usuario_id()));

-- Registro de atividades: administradores leem; cada um grava em seu nome.
create policy cv_logs_leitura on public.logs_atividade
  for select to authenticated using ((select app.is_admin()));
create policy cv_logs_insert on public.logs_atividade
  for insert to authenticated with check (usuario_id = (select app.usuario_id()));

create policy cv_push_dono on public.dispositivos_push
  for all to authenticated
  using (usuario_id = (select app.usuario_id()))
  with check (usuario_id = (select app.usuario_id()));

-- 7. Ações que exigem mais privilégio que o do cliente (RPC) ----------------
-- Apaga a própria conta: perfil, dependentes, inscrições e o login.
create or replace function public.excluir_minha_conta()
returns void language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Não autenticado.'; end if;
  delete from public.usuarios where auth_id = uid;
  delete from auth.users where id = uid;
end;
$$;

-- Painel: define a permissão de um usuário (Administrador / Usuário Comum).
create or replace function public.admin_definir_permissao(p_usuario_id bigint, p_permissao text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not app.is_admin() then raise exception 'Acesso negado.'; end if;
  if p_permissao not in ('Administrador', 'Usuário Comum') then
    raise exception 'Permissão inválida.';
  end if;
  if p_usuario_id = app.usuario_id() and p_permissao <> 'Administrador' then
    raise exception 'Você não pode remover a sua própria permissão de administrador.';
  end if;
  update public.usuarios set permissao = p_permissao where id = p_usuario_id;
end;
$$;

-- Painel: remove um usuário (perfil e, se existir, o login).
create or replace function public.admin_excluir_usuario(p_usuario_id bigint)
returns void language plpgsql security definer set search_path = ''
as $$
declare alvo uuid;
begin
  if not app.is_admin() then raise exception 'Acesso negado.'; end if;
  if p_usuario_id = app.usuario_id() then
    raise exception 'Use "excluir minha conta" para remover o próprio usuário.';
  end if;
  select auth_id into alvo from public.usuarios where id = p_usuario_id;
  delete from public.usuarios where id = p_usuario_id;
  if alvo is not null then delete from auth.users where id = alvo; end if;
end;
$$;

revoke all on function public.excluir_minha_conta(),
  public.admin_definir_permissao(bigint, text),
  public.admin_excluir_usuario(bigint) from public, anon;
grant execute on function public.excluir_minha_conta(),
  public.admin_definir_permissao(bigint, text),
  public.admin_excluir_usuario(bigint) to authenticated;

-- 8. Registro automático das ações do painel --------------------------------
-- Só registra quando a alteração vem de um usuário logado pela API do
-- Supabase; alterações feitas pela API Java antiga não passam por aqui.
create or replace function app.registrar_atividade()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  autor bigint := app.usuario_id();
  verbo text := case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'atualizou' else 'removeu' end;
  alvo text;
begin
  if autor is not null then
    if tg_table_name = 'comunicacoes' then
      alvo := lower(coalesce(case when tg_op = 'DELETE' then old.tipo else new.tipo end, 'comunicação'))
              || ' "' || case when tg_op = 'DELETE' then old.titulo else new.titulo end || '"';
    else
      alvo := 'instituição "' || case when tg_op = 'DELETE' then old.nome else new.nome end || '"';
    end if;
    insert into public.logs_atividade (usuario_id, acao) values (autor, left(initcap(verbo) || ' ' || alvo, 255));
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists conecta_log_comunicacoes on public.comunicacoes;
create trigger conecta_log_comunicacoes
  after insert or update or delete on public.comunicacoes
  for each row execute function app.registrar_atividade();

drop trigger if exists conecta_log_instituicoes on public.instituicoes_saude;
create trigger conecta_log_instituicoes
  after insert or update or delete on public.instituicoes_saude
  for each row execute function app.registrar_atividade();

-- 9. Tempo real: o app recebe alertas e campanhas novas na hora -------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comunicacoes') then
    alter publication supabase_realtime add table public.comunicacoes;
  end if;
end $$;
