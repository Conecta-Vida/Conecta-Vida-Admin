-- =====================================================================
-- Massa de dados para os TESTES DE SISTEMA do caso de uso
-- "Inscrever-se em campanha" (Trabalho 2 de Qualidade de Software).
--
-- Rodar no SQL Editor do Supabase (como administrador) no dia da gravação.
-- As datas são relativas ao momento da execução. Todas as comunicações
-- criadas começam com "[TESTE QSW]" para serem apagadas no final (bloco 3).
--
-- Contas e dependentes são criados pelo próprio app (cadastro, Ajustes >
-- Dependentes), porque o cadastro passa pelas regras do Supabase Auth:
--   * titular1  — conta principal dos testes (maior de 18 anos)
--   * titular2  — conta com 9 dependentes para o valor limite da RN06
--   * dependentes do titular1: "Filho QSW" (menor, declaração do responsável),
--     "Mãe QSW" (adulta, e-mail de uma terceira conta -> fica PENDENTE),
--     "Sobrinho QSW" (menor; será revogado no CT #14)
-- =====================================================================

-- 1. Instituição usada nas campanhas de teste --------------------------------
insert into public.instituicoes_saude (tipo_instituicao, nome, telefone, endereco)
select 'Secretaria', '[TESTE QSW] Secretaria de Saúde', '(11) 4034-0000', 'Bragança Paulista'
where not exists (select 1 from public.instituicoes_saude where nome = '[TESTE QSW] Secretaria de Saúde');

-- 2. Campanhas e comunicações (uma por condição de entrada) -----------------
with inst as (select id from public.instituicoes_saude where nome = '[TESTE QSW] Secretaria de Saúde')
-- publico_alvo preenchido porque o painel exige o campo para salvar a edição da campanha (CTs #22 a #25).
insert into public.comunicacoes (tipo, instituicao_id, titulo, descricao, categoria, localizacao, publico_alvo, status, data_inicio, data_fim)
select v.tipo, inst.id, v.titulo, v.descricao, v.categoria, 'Bragança Paulista', 'Geral', v.status, now() - interval '5 days', v.fim
from inst, (values
  -- CT #01, #02, #06–#09, #12, #13, #18, #19: campanha aberta, termina amanhã
  ('CAMPANHA', '[TESTE QSW] Vacinação — termina amanhã', 'Campanha aberta (classe válida V2).', 'Vacinação', 'ATIVA', now() + interval '1 day'),
  -- CT #03: valor limite — termina HOJE (23h59)
  ('CAMPANHA', '[TESTE QSW] Doação de sangue — termina hoje', 'Valor limite da data de término.', 'Doação', 'ATIVA', date_trunc('day', now()) + interval '23 hours 59 minutes'),
  -- CT #04: valor limite — terminou ONTEM (rodar antes do pg_cron das 03h05, ou deixar o pg_cron encerrar)
  ('CAMPANHA', '[TESTE QSW] Mutirão — terminou ontem', 'Valor limite inválido (I4).', 'Mutirão', 'ATIVA', now() - interval '1 day'),
  -- CT #05: encerrada pelo gestor, término no futuro
  ('CAMPANHA', '[TESTE QSW] Novembro Azul — encerrada pelo painel', 'Classe inválida I3.', 'Saúde do homem', 'ENCERRADA', now() + interval '10 days'),
  -- CT #10, #11: inscrever o titular ANTES de encerrar (ver bloco 2b)
  ('CAMPANHA', '[TESTE QSW] Outubro Rosa — encerrar após inscrição', 'Usada em A4 e RN02.', 'Saúde da mulher', 'ATIVA', now() + interval '10 days'),
  -- CT #22 a #25: reabrir e excluir pelo painel
  ('CAMPANHA', '[TESTE QSW] Campanha para reabrir', 'Usada nas transições t10/t11.', 'Vacinação', 'ENCERRADA', now() + interval '10 days'),
  -- CT #17: comunicações que NÃO são campanha (RN01)
  ('NOTICIA',  '[TESTE QSW] Notícia comum', 'Classe inválida I1.', 'Notícia', 'ATIVO', null),
  ('ALERTA',   '[TESTE QSW] Alerta de dengue', 'Classe inválida I2.', 'Urgência', 'ATIVO', null)
) as v(tipo, titulo, descricao, categoria, status, fim);

-- 2b. Depois de inscrever o titular1 em "Outubro Rosa" pelo app, encerrar:
-- update public.comunicacoes set status = 'ENCERRADA'
--  where titulo = '[TESTE QSW] Outubro Rosa — encerrar após inscrição';

-- Conferência rápida
select id, tipo, status, titulo, data_fim from public.comunicacoes
 where titulo like '[TESTE QSW]%' order by id;

-- 3. Limpeza depois das gravações (descomente para executar) ----------------
-- delete from public.comunicacoes where titulo like '[TESTE QSW]%';
-- delete from public.instituicoes_saude where nome = '[TESTE QSW] Secretaria de Saúde';
