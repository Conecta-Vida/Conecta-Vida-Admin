-- =====================================================================
-- Conecta Vida: suporte a login com Microsoft (provedor "azure").
-- Na primeira entrada com Microsoft o perfil é criado com o nome da conta
-- Microsoft. Se já existir perfil com o mesmo e-mail (inclusive de
-- administrador), ele é vinculado, porque a Microsoft confirmou o e-mail.
-- Pode ser executada mais de uma vez.
-- =====================================================================
create or replace function app.sincronizar_perfil()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  provedor text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  existente public.usuarios%rowtype;
  nascimento integer;
begin
  if new.email is null or new.email_confirmed_at is null then
    return new;
  end if;
  if exists (select 1 from public.usuarios u where u.auth_id = new.id) then
    return new;
  end if;

  select * into existente from public.usuarios u where lower(u.email) = lower(new.email);

  if found then
    -- Com e-mail e senha, um perfil de administrador só é herdado se o
    -- e-mail foi confirmado por link (evita tomar a conta de outra pessoa).
    -- Com Microsoft, o próprio provedor confirmou o e-mail.
    if existente.permissao = 'Administrador'
       and provedor = 'email'
       and new.confirmation_sent_at is null then
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
    coalesce(nullif(trim(meta ->> 'nome'), ''),
             nullif(trim(meta ->> 'full_name'), ''),
             nullif(trim(meta ->> 'name'), ''),
             split_part(new.email, '@', 1)),
    lower(new.email),
    'supabase-auth',
    nullif(meta ->> 'sexo', ''),
    nullif(meta ->> 'localizacao', ''),
    nascimento,
    'Usuário Comum',
    new.id
  );
  return new;
end;
$$;
