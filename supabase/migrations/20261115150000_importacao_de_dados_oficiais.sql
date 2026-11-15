-- =====================================================================
-- Conecta Vida: importação automática de dados oficiais.
-- Notícias do Ministério da Saúde (duas vezes por dia) e unidades de saúde
-- do CNES (uma vez por mês), pela Edge Function "importar-dados".
-- Pode ser executada mais de uma vez.
-- =====================================================================

alter table public.comunicacoes add column if not exists fonte_url text unique;
comment on column public.comunicacoes.fonte_url is 'Endereço da matéria original, quando a comunicação foi importada de uma fonte oficial.';

alter table public.instituicoes_saude add column if not exists codigo_cnes bigint unique;
comment on column public.instituicoes_saude.codigo_cnes is 'Código da unidade no CNES (Ministério da Saúde), quando importada dos dados abertos.';

create extension if not exists pg_net;

-- Segredo aleatório, guardado no cofre do banco, que identifica o agendador.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'conecta_import_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'conecta_import_secret',
                                'Segredo que o agendador usa para chamar a função importar-dados');
  end if;
end $$;

-- A Edge Function confere o segredo recebido (só a chave de serviço pode chamar).
create or replace function public.conferir_segredo_importacao(p_segredo text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets s
    where s.name = 'conecta_import_secret' and s.decrypted_secret = p_segredo
  )
$$;
revoke all on function public.conferir_segredo_importacao(text) from public, anon, authenticated;
grant execute on function public.conferir_segredo_importacao(text) to service_role;

-- Dispara a importação (troque o endereço se usar outro projeto Supabase).
create or replace function app.chamar_importacao(p_alvo text)
returns bigint language sql security definer set search_path = ''
as $$
  select net.http_post(
    url := 'https://pborxjuuexiqollesfxw.supabase.co/functions/v1/importar-dados',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-import-secret', (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'conecta_import_secret')
    ),
    body := jsonb_build_object('alvo', p_alvo),
    timeout_milliseconds := 60000
  )
$$;
revoke all on function app.chamar_importacao(text) from public;

-- Notícias: 06:10 e 18:10 (Brasília). Unidades: dia 1 de cada mês, 03:30.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'conecta-importar-noticias') then
    perform cron.unschedule('conecta-importar-noticias');
  end if;
  perform cron.schedule('conecta-importar-noticias', '10 9,21 * * *', $c$select app.chamar_importacao('noticias')$c$);

  if exists (select 1 from cron.job where jobname = 'conecta-importar-unidades') then
    perform cron.unschedule('conecta-importar-unidades');
  end if;
  perform cron.schedule('conecta-importar-unidades', '30 6 1 * *', $c$select app.chamar_importacao('unidades')$c$);
end $$;
