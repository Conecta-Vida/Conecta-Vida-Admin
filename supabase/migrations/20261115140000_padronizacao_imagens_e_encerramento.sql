-- =====================================================================
-- Conecta Vida: padronização dos dados, imagens e encerramento automático.
-- Pode ser executada mais de uma vez. Continua compatível com a API Java,
-- que compara tipo e status sem diferenciar maiúsculas.
-- =====================================================================

-- 1. Padroniza o que é gravado em comunicações ------------------------------
-- Tipo e status em maiúsculas, cidade sem espaços ou quebras de linha
-- sobrando. Vale para o painel, para a API antiga e para edições manuais.
create or replace function app.padronizar_comunicacao()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.tipo := upper(btrim(new.tipo));
  new.status := nullif(upper(btrim(coalesce(new.status, ''))), '');
  if new.status in ('ATIVO', 'ATIVA') or new.status is null then
    new.status := case when new.tipo = 'CAMPANHA' then 'ATIVA' else 'ATIVO' end;
  elsif new.status in ('CONCLUÍDA', 'CONCLUIDA', 'ENCERRADO', 'ENCERRADA') then
    new.status := case when new.tipo = 'CAMPANHA' then 'ENCERRADA' else 'ENCERRADO' end;
  end if;
  new.localizacao := nullif(btrim(regexp_replace(coalesce(new.localizacao, ''), '\s+', ' ', 'g')), '');
  new.categoria := nullif(btrim(coalesce(new.categoria, '')), '');
  return new;
end;
$$;

create or replace trigger conecta_padronizar_comunicacao
  before insert or update on public.comunicacoes
  for each row execute function app.padronizar_comunicacao();

-- 2. Imagens das comunicações no próprio Supabase ---------------------------
-- Leitura pública (as imagens aparecem no app); só administradores enviam.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comunicacoes', 'comunicacoes', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'cv_imagens_admin_insert') then
    create policy cv_imagens_admin_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'comunicacoes' and (select app.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'cv_imagens_admin_update') then
    create policy cv_imagens_admin_update on storage.objects
      for update to authenticated
      using (bucket_id = 'comunicacoes' and (select app.is_admin()))
      with check (bucket_id = 'comunicacoes' and (select app.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'cv_imagens_admin_delete') then
    create policy cv_imagens_admin_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'comunicacoes' and (select app.is_admin()));
  end if;
end $$;

-- 3. Encerramento automático de campanhas vencidas --------------------------
create or replace function app.encerrar_campanhas_vencidas()
returns integer language plpgsql security definer set search_path = ''
as $$
declare total integer;
begin
  update public.comunicacoes
     set status = 'ENCERRADA'
   where tipo = 'CAMPANHA' and status = 'ATIVA'
     and data_fim is not null and data_fim < now();
  get diagnostics total = row_count;
  return total;
end;
$$;
revoke all on function app.encerrar_campanhas_vencidas() from public;

-- Roda todo dia às 03:05 (horário de Brasília = 06:05 UTC).
create extension if not exists pg_cron;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'conecta-encerrar-campanhas') then
    perform cron.unschedule('conecta-encerrar-campanhas');
  end if;
  perform cron.schedule('conecta-encerrar-campanhas', '5 6 * * *',
                        'select app.encerrar_campanhas_vencidas()');
end $$;

-- 4. Correção única dos registros antigos (o gatilho acima padroniza o resto)
update public.comunicacoes
   set localizacao = case when lower(btrim(localizacao)) = 'braganca paulista' then 'Bragança Paulista' else localizacao end,
       categoria = case when btrim(categoria) = 'Urgencia' then 'Urgência' else categoria end
 where id is not null;
select app.encerrar_campanhas_vencidas();
