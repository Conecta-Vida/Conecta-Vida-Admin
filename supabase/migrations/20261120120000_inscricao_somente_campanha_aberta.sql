-- =====================================================================
-- Conecta Vida: correção do defeito D01 (Trabalho 2 de Qualidade).
--
-- A política de inscrição conferia só se a comunicação era uma CAMPANHA.
-- Faltava a regra RN02: inscrição nova só em campanha ABERTA (status ATIVA
-- e data de término não ultrapassada). Cancelar continua permitido em
-- campanha encerrada (política cv_inscricoes_delete não muda).
-- Pode ser executada mais de uma vez.
-- =====================================================================
alter policy cv_inscricoes_insert on public.usuarios_campanhas
  with check (
    usuario_id = (select app.usuario_id())
    and exists (select 1 from public.comunicacoes c
                where c.id = comunicacao_id
                  and upper(c.tipo) = 'CAMPANHA'
                  and c.status = 'ATIVA'
                  and (c.data_fim is null or c.data_fim >= now()))
    and (dependente_id is null or exists (
          select 1 from public.dependentes d
          where d.id = dependente_id and d.ativo and d.status = 'ativo'
            and d.usuario_titular_id = (select app.usuario_id())))
  );
