-- Abrangência das notícias: o que era "Geral" vindo de fonte oficial passa a
-- dizer de onde vale ("Brasil"), para o filtro de cidades fazer sentido.
-- A campanha do mês do calendário de saúde também nasce como "Brasil".
-- (Aplicada no projeto Supabase em 16/11/2026; a função
-- app.publicar_campanha_do_mes foi recriada lá com 'Brasil' no lugar de 'Geral'.)
update public.comunicacoes c
   set localizacao = 'Brasil'
 where (c.localizacao is null or trim(lower(c.localizacao)) in ('geral', 'região geral', 'nacional'))
   and (c.fonte_url is not null
        or c.chave_calendario is not null
        or c.instituicao_id in (select id from public.instituicoes_saude where nome = 'Ministério da Saúde'));
