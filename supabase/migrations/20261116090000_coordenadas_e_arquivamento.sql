-- =====================================================================
-- Conecta Vida: coordenadas das unidades (para "unidades perto de você")
-- e arquivamento automático das notícias importadas com mais de 60 dias.
-- Pode ser executada mais de uma vez.
-- =====================================================================

alter table public.instituicoes_saude
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

-- Notícias importadas com mais de 60 dias saem do feed (ficam guardadas).
create or replace function app.arquivar_noticias_antigas()
returns integer language plpgsql security definer set search_path = ''
as $$
declare total integer;
begin
  update public.comunicacoes
     set status = 'ARQUIVADO'
   where tipo = 'NOTICIA' and fonte_url is not null and status = 'ATIVO'
     and data_postada < now() - interval '60 days';
  get diagnostics total = row_count;
  return total;
end;
$$;
revoke all on function app.arquivar_noticias_antigas() from public;

-- Todo dia às 03:20 (Brasília).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'conecta-arquivar-noticias') then
    perform cron.unschedule('conecta-arquivar-noticias');
  end if;
  perform cron.schedule('conecta-arquivar-noticias', '20 6 * * *', 'select app.arquivar_noticias_antigas()');
end $$;
