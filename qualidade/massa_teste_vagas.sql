-- =====================================================================
-- Massa de dados para os TESTES DE SISTEMA das vagas por campanha (RN07)
-- do caso de uso "Inscrever-se em campanha" (CTs #26 a #32 da planilha).
--
-- Pré-requisito: a migration 20261121120000_vagas_por_campanha.sql já aplicada
-- (colunas vagas e inscritos em public.comunicacoes).
-- Rodar no SQL Editor do Supabase (como administrador) no dia da gravação,
-- depois do massa_teste_sistema.sql (que cria a instituição de teste).
-- Contas e dependentes são os mesmos do massa_teste_sistema.sql (titular1,
-- titular2, "Filho QSW" e a conta da "Mãe QSW"). A campanha criada aqui começa
-- com "[TESTE QSW]" para ser apagada no final (bloco 3).
-- =====================================================================

-- 1. Instituição usada na campanha de teste (idêntica à do outro script) ----
insert into public.instituicoes_saude (tipo_instituicao, nome, telefone, endereco)
select 'Secretaria', '[TESTE QSW] Secretaria de Saúde', '(11) 4034-0000', 'Bragança Paulista'
where not exists (select 1 from public.instituicoes_saude where nome = '[TESTE QSW] Secretaria de Saúde');

-- 2. Campanha com 2 vagas (CT #26 a #32) ------------------------------------
with inst as (select id from public.instituicoes_saude where nome = '[TESTE QSW] Secretaria de Saúde')
insert into public.comunicacoes (tipo, instituicao_id, titulo, descricao, categoria, localizacao, status, data_inicio, data_fim, vagas)
select 'CAMPANHA', inst.id, '[TESTE QSW] Vagas', 'Campanha aberta com 2 vagas (RN07).', 'Vacinação',
       'Bragança Paulista', 'ATIVA', now() - interval '5 days', now() + interval '1 day', 2
from inst
where not exists (select 1 from public.comunicacoes where titulo = '[TESTE QSW] Vagas');

-- Conferência rápida (esperado: vagas = 2, inscritos = 0)
select id, status, titulo, vagas, inscritos, data_fim from public.comunicacoes
 where titulo = '[TESTE QSW] Vagas';

-- 2b. Reiniciar a campanha antes de cada CT (volta a 2 vagas e nenhuma inscrição) ----
-- (descomente para executar; o contador "inscritos" acompanha pelos gatilhos)
-- delete from public.usuarios_campanhas
--  where comunicacao_id in (select id from public.comunicacoes where titulo = '[TESTE QSW] Vagas');
-- update public.comunicacoes set vagas = 2, status = 'ATIVA', data_fim = now() + interval '1 day'
--  where titulo = '[TESTE QSW] Vagas';

-- 2c. Passos do gestor que também podem ser feitos pelo painel ---------------
-- CT #30 (gestor aumenta as vagas):
-- update public.comunicacoes set vagas = 3 where titulo = '[TESTE QSW] Vagas';
-- CT #31, preparação das partes 1 e 2 (vagas livres para o titular1 inscrever só o titular, na
-- parte 1 (S18), ou o titular e o Filho QSW, na parte 2 (S21); refazer os blocos 2 e 2b entre as partes):
-- update public.comunicacoes set vagas = 3 where titulo = '[TESTE QSW] Vagas';
-- CT #31, partes 1 e 2 (depois, o gestor reduz as vagas para 1, até ou abaixo dos inscritos; ninguém é removido):
-- update public.comunicacoes set vagas = 1 where titulo = '[TESTE QSW] Vagas';
-- CT #26 a #32 (gestor exclui a campanha no fim; as inscrições somem junto):
-- delete from public.comunicacoes where titulo = '[TESTE QSW] Vagas';
-- (se excluir, rodar o bloco 2 de novo para recriar a campanha antes do próximo CT)

-- 3. Limpeza depois das gravações (descomente para executar) ----------------
-- delete from public.comunicacoes where titulo = '[TESTE QSW] Vagas';
-- Só apague a instituição se o massa_teste_sistema.sql também já foi limpo:
-- delete from public.instituicoes_saude where nome = '[TESTE QSW] Secretaria de Saúde';
