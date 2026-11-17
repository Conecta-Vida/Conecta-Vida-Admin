-- Alertas automáticos e limpeza de alertas antigos.
--
-- 1. Todo dia às 07:40 (Brasília) a Edge Function importar-dados (alvo
--    "alertas") consulta o InfoDengue (Fiocruz/FGV) para as cidades dos
--    usuários: nível laranja/vermelho de dengue, chikungunya ou zika vira
--    ALERTA no app; quando o nível baixa, o alerta é arquivado.
-- 2. O arquivamento diário passa a tirar do app também alertas com mais de
--    30 dias (os automáticos e os publicados à mão que ninguém encerrou).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'conecta-alertas-infodengue') then
    perform cron.unschedule('conecta-alertas-infodengue');
  end if;
  perform cron.schedule('conecta-alertas-infodengue', '40 10 * * *', $c$select app.chamar_importacao('alertas')$c$);
end $$;

create or replace function app.arquivar_noticias_antigas()
returns integer language plpgsql security definer set search_path = ''
as $$
declare total integer; alertas integer;
begin
  update public.comunicacoes
     set status = 'ARQUIVADO'
   where tipo = 'NOTICIA' and fonte_url is not null and status = 'ATIVO'
     and data_postada < now() - interval '60 days';
  get diagnostics total = row_count;

  update public.comunicacoes
     set status = 'ARQUIVADO'
   where upper(tipo) = 'ALERTA' and status <> 'ARQUIVADO'
     and data_postada < now() - interval '30 days';
  get diagnostics alertas = row_count;

  return total + alertas;
end;
$$;
revoke all on function app.arquivar_noticias_antigas() from public;
