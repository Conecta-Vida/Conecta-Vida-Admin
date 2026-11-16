-- =====================================================================
-- Conecta Vida: calendário nacional de saúde publicado automaticamente.
-- No dia 1 de cada mês, a campanha do mês (Janeiro Branco, Outubro Rosa,
-- Novembro Azul...) entra no app como CAMPANHA, sem ninguém no painel.
-- A chave (ano-mês) impede publicar duas vezes. Pode rodar mais de uma vez.
-- =====================================================================

alter table public.comunicacoes add column if not exists chave_calendario text unique;
comment on column public.comunicacoes.chave_calendario is 'Ano-mês (ex.: 2026-11) quando a campanha veio do calendário nacional automático.';

create table if not exists public.calendario_saude (
  mes smallint primary key check (mes between 1 and 12),
  titulo text not null,
  descricao text not null,
  categoria text not null,
  publico_alvo text not null
);
alter table public.calendario_saude enable row level security;
revoke all on public.calendario_saude from anon;
grant select on public.calendario_saude to authenticated;
grant insert, update, delete on public.calendario_saude to authenticated;
drop policy if exists cv_calendario_leitura on public.calendario_saude;
create policy cv_calendario_leitura on public.calendario_saude for select to authenticated using (true);
drop policy if exists cv_calendario_admin on public.calendario_saude;
create policy cv_calendario_admin on public.calendario_saude for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

insert into public.calendario_saude (mes, titulo, descricao, categoria, publico_alvo) values
 (1, 'Janeiro Branco: cuide da sua saúde mental',
  'O Janeiro Branco convida a olhar para a saúde mental. Se você sente tristeza, ansiedade ou cansaço que não passam, procure a UBS: a equipe acolhe e, quando necessário, encaminha para o CAPS. Em momentos de crise, o CVV atende 24 horas pelo telefone 188, de graça.',
  'Saúde Mental', 'População geral'),
 (2, 'Fevereiro Roxo e Laranja: lúpus, Alzheimer e leucemia',
  'Fevereiro chama atenção para o lúpus, a doença de Alzheimer e a leucemia. Fique atento a sinais como manchas na pele, perda de memória recente e cansaço com manchas roxas sem motivo. Na dúvida, procure a UBS para avaliação. O cadastro como doador de medula óssea é feito nos hemocentros.',
  'Prevenção', 'População geral'),
 (3, 'Março Lilás: prevenção do câncer do colo do útero',
  'O exame preventivo (Papanicolau) é gratuito no SUS e ajuda a descobrir alterações antes que virem câncer. Mulheres de 25 a 64 anos devem fazer o exame periodicamente. A vacina contra o HPV também protege: está disponível nas UBS para o público indicado.',
  'Saúde da Mulher', 'Mulheres de 25 a 64 anos'),
 (4, 'Vacinação contra a gripe',
  'A campanha nacional de vacinação contra a gripe começa no outono. A vacina é gratuita para os grupos prioritários, como idosos, crianças pequenas, gestantes e pessoas com doenças crônicas. Leve um documento e a caderneta de vacinação à UBS.',
  'Vacinação', 'Grupos prioritários'),
 (5, 'Maio Amarelo: atenção pela vida no trânsito',
  'O Maio Amarelo alerta para os acidentes de trânsito, uma das principais causas de morte e de internação no país. Use cinto e cadeirinha, respeite a velocidade e não dirija depois de beber. Em caso de acidente, ligue para o SAMU no 192.',
  'Prevenção', 'População geral'),
 (6, 'Junho Vermelho: doe sangue',
  'No inverno, os estoques de sangue costumam cair. Podem doar pessoas de 16 a 69 anos, com mais de 50 kg, alimentadas e com documento oficial com foto. Uma doação pode ajudar até quatro pessoas.',
  'Doações', 'Pessoas de 16 a 69 anos'),
 (7, 'Julho Amarelo: hepatites virais',
  'As hepatites B e C podem passar anos sem sintomas. O teste rápido é gratuito no SUS e o resultado sai em poucos minutos. A vacina contra a hepatite B também é gratuita para todas as idades. Procure a UBS.',
  'Prevenção', 'População geral'),
 (8, 'Agosto Dourado: aleitamento materno',
  'O leite materno é o alimento mais completo para o bebê: recomenda-se amamentar de forma exclusiva até os 6 meses e continuar até os 2 anos ou mais. A UBS oferece apoio para gestantes e mães com dificuldade na amamentação.',
  'Saúde da Mulher', 'Gestantes e mães'),
 (9, 'Setembro Amarelo: falar é a melhor solução',
  'O Setembro Amarelo é o mês de prevenção ao suicídio. Se você ou alguém próximo está em sofrimento, converse e procure ajuda: a UBS e o CAPS acolhem, e o CVV atende 24 horas pelo telefone 188, de graça. Em emergência, ligue 192.',
  'Saúde Mental', 'População geral'),
 (10, 'Outubro Rosa: prevenção do câncer de mama',
  'O Outubro Rosa reforça a importância do diagnóstico precoce do câncer de mama. Mulheres de 50 a 69 anos devem fazer mamografia a cada dois anos, e qualquer alteração nas mamas deve ser avaliada. Procure a UBS para o pedido do exame.',
  'Saúde da Mulher', 'Mulheres, principalmente de 50 a 69 anos'),
 (11, 'Novembro Azul: cuidado integral com a saúde do homem',
  'Durante o Novembro Azul, as unidades básicas de saúde reforçam o cuidado com a saúde do homem: consultas, avaliação de pressão arterial, glicemia e orientação sobre prevenção do câncer de próstata. Procure a UBS mais próxima com documento com foto e cartão do SUS.',
  'Saúde do Homem', 'Homens adultos'),
 (12, 'Dezembro Vermelho: testagem rápida de HIV e ISTs',
  'No Dezembro Vermelho, o SUS reforça a prevenção do HIV, sífilis e hepatites virais. A testagem rápida é gratuita e o resultado sai em cerca de 30 minutos. Procure uma unidade de saúde para fazer o teste e receber orientação.',
  'Prevenção', 'População geral')
on conflict (mes) do update
  set titulo = excluded.titulo, descricao = excluded.descricao,
      categoria = excluded.categoria, publico_alvo = excluded.publico_alvo;

-- Publica a campanha do mês informado (padrão: mês atual, horário de Brasília).
create or replace function app.publicar_campanha_do_mes(p_referencia date default (now() at time zone 'America/Sao_Paulo')::date)
returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  inicio date := date_trunc('month', p_referencia)::date;
  chave text := to_char(inicio, 'YYYY-MM');
  tema public.calendario_saude%rowtype;
  novo_id bigint;
begin
  select * into tema from public.calendario_saude where mes = extract(month from inicio);
  if not found then return null; end if;
  if exists (select 1 from public.comunicacoes where chave_calendario = chave) then return null; end if;

  insert into public.comunicacoes (tipo, titulo, descricao, categoria, localizacao, publico_alvo, status, lido,
                                   instituicao_id, data_postada, data_inicio, data_fim, chave_calendario)
  values ('CAMPANHA', tema.titulo, tema.descricao, tema.categoria, 'Geral', tema.publico_alvo, 'ATIVA', false,
          (select id from public.instituicoes_saude where nome = 'Ministério da Saúde'),
          now(), inicio + time '08:00', (inicio + interval '1 month' - interval '1 day') + time '17:00', chave)
  returning id into novo_id;
  return novo_id;
end;
$$;
revoke all on function app.publicar_campanha_do_mes(date) from public;

-- Dia 1 de cada mês, 06:15 (Brasília).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'conecta-calendario-saude') then
    perform cron.unschedule('conecta-calendario-saude');
  end if;
  perform cron.schedule('conecta-calendario-saude', '15 9 1 * *', 'select app.publicar_campanha_do_mes()');
end $$;

-- Campanhas de novembro e dezembro de 2026 criadas antes da automação.
update public.comunicacoes set chave_calendario = '2026-11'
 where titulo like 'Novembro Azul%' and tipo = 'CAMPANHA' and chave_calendario is null
   and not exists (select 1 from public.comunicacoes where chave_calendario = '2026-11');
update public.comunicacoes set chave_calendario = '2026-12'
 where titulo like 'Dezembro Vermelho%' and tipo = 'CAMPANHA' and chave_calendario is null
   and not exists (select 1 from public.comunicacoes where chave_calendario = '2026-12');
