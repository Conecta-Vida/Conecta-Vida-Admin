-- =====================================================================
-- Conecta Vida: regras de vínculo entre titular e dependente.
--
--  * Só maiores de 18 anos cadastram dependentes (até 10 por conta).
--  * Menor de idade ou tutelado: o titular declara a responsabilidade legal
--    e o vínculo fica ATIVO na hora.
--  * Dependente adulto: o vínculo nasce PENDENTE e só passa a ATIVO quando o
--    próprio dependente autoriza, logado com o e-mail informado.
--  * Titular ou dependente podem REVOGAR; as inscrições desse dependente em
--    campanhas ainda abertas são canceladas.
--
-- Aditiva e compatível com a API Java (que continua usando a coluna "ativo").
-- Pode ser executada mais de uma vez.
-- =====================================================================

alter table public.dependentes
  add column if not exists status text not null default 'ativo',
  add column if not exists autorizado_em timestamp without time zone,
  add column if not exists autorizacao_origem text,
  add column if not exists email_dependente text,
  add column if not exists declarou_responsabilidade boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dependentes_status_valido') then
    alter table public.dependentes
      add constraint dependentes_status_valido check (status in ('pendente', 'ativo', 'revogado'));
  end if;
end $$;

comment on column public.dependentes.status is 'pendente (aguarda o aceite do dependente adulto), ativo ou revogado.';
comment on column public.dependentes.autorizacao_origem is 'declaracao_do_responsavel (menor/tutelado) ou aceite_do_dependente (adulto).';

-- Registros anteriores a estas regras: o vínculo vale pela declaração do titular.
update public.dependentes
   set status = case when ativo then 'ativo' else 'revogado' end,
       autorizado_em = coalesce(autorizado_em, criado_em),
       autorizacao_origem = coalesce(autorizacao_origem, 'declaracao_do_responsavel')
 where autorizacao_origem is null;

create index if not exists idx_dependentes_email_dependente
  on public.dependentes (lower(email_dependente)) where email_dependente is not null;

-- Aplica as regras a cada gravação -------------------------------------------
create or replace function app.aplicar_regras_dependente()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  eu bigint := app.usuario_id();
  titular record;
  idade integer;
begin
  -- Resposta do próprio dependente (função responder_convite_dependente).
  if current_setting('app.resposta_convite', true) = '1' then
    new.ativo := new.status <> 'revogado';
    return new;
  end if;

  -- API Java / manutenção: mantém "status" coerente com a coluna antiga "ativo".
  if eu is null then
    if not new.ativo then
      new.status := 'revogado';
    elsif tg_op = 'UPDATE' and not old.ativo then
      new.status := 'ativo';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    select u.email, u.data_nascimento into titular from public.usuarios u where u.id = eu;

    if titular.data_nascimento is not null
       and extract(year from current_date)::integer - titular.data_nascimento < 18 then
      raise exception 'Apenas maiores de 18 anos podem cadastrar dependentes.';
    end if;
    if (select count(*) from public.dependentes d
         where d.usuario_titular_id = eu and d.status <> 'revogado') >= 10 then
      raise exception 'Limite de 10 dependentes por conta atingido.';
    end if;
    if new.data_nascimento > current_date then
      raise exception 'A data de nascimento não pode estar no futuro.';
    end if;

    idade := date_part('year', age(current_date, new.data_nascimento))::integer;
    new.ativo := true;

    if idade < 18 or lower(btrim(new.parentesco)) = 'tutelado' then
      if not coalesce(new.declarou_responsabilidade, false) then
        raise exception 'Confirme que você é o responsável legal por esta pessoa.';
      end if;
      new.status := 'ativo';
      new.autorizado_em := now();
      new.autorizacao_origem := 'declaracao_do_responsavel';
      new.email_dependente := null;
    else
      new.email_dependente := nullif(lower(btrim(coalesce(new.email_dependente, ''))), '');
      if new.email_dependente is null then
        raise exception 'Informe o e-mail do dependente adulto para pedir a autorização dele.';
      end if;
      if new.email_dependente = lower(titular.email) then
        raise exception 'Você não pode cadastrar a si mesmo como dependente.';
      end if;
      new.status := 'pendente';
      new.autorizado_em := null;
      new.autorizacao_origem := null;
      new.declarou_responsabilidade := false;
    end if;
    return new;
  end if;

  -- UPDATE feito pelo titular: pode corrigir os dados ou revogar, mas não
  -- pode se autorizar no lugar do dependente nem trocar o e-mail do convite.
  new.usuario_titular_id := old.usuario_titular_id;
  if not new.ativo or new.status = 'revogado' then
    new.status := 'revogado';
    new.ativo := false;
  else
    new.status := old.status;
  end if;
  new.autorizado_em := old.autorizado_em;
  new.autorizacao_origem := old.autorizacao_origem;
  new.email_dependente := old.email_dependente;
  new.declarou_responsabilidade := old.declarou_responsabilidade;
  return new;
end;
$$;

create or replace trigger conecta_regras_dependente
  before insert or update on public.dependentes
  for each row execute function app.aplicar_regras_dependente();

-- Vínculo revogado: cancela as inscrições em campanhas ainda abertas ----------
create or replace function app.cancelar_inscricoes_do_revogado()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'revogado' and old.status <> 'revogado' then
    delete from public.usuarios_campanhas uc
     using public.comunicacoes c
     where uc.dependente_id = new.id
       and c.id = uc.comunicacao_id
       and c.status = 'ATIVA'
       and (c.data_fim is null or c.data_fim >= now());
  end if;
  return new;
end;
$$;

create or replace trigger conecta_revogacao_dependente
  after update on public.dependentes
  for each row execute function app.cancelar_inscricoes_do_revogado();

-- Só dependente com vínculo ATIVO pode ser inscrito em campanha ---------------
alter policy cv_inscricoes_insert on public.usuarios_campanhas
  with check (
    usuario_id = (select app.usuario_id())
    and exists (select 1 from public.comunicacoes c
                where c.id = comunicacao_id and upper(c.tipo) = 'CAMPANHA')
    and (dependente_id is null or exists (
          select 1 from public.dependentes d
          where d.id = dependente_id and d.ativo and d.status = 'ativo'
            and d.usuario_titular_id = (select app.usuario_id())))
  );

-- O dependente adulto vê e responde os pedidos feitos com o e-mail dele -------
create or replace function public.meus_convites_de_dependente()
returns table (id bigint, titular_nome text, parentesco text, status text, criado_em timestamp without time zone)
language sql stable security definer set search_path = ''
as $$
  select d.id, t.nome::text, d.parentesco::text, d.status, d.criado_em
    from public.dependentes d
    join public.usuarios t on t.id = d.usuario_titular_id
    join public.usuarios eu on eu.auth_id = (select auth.uid())
   where lower(d.email_dependente) = lower(eu.email)
     and d.status in ('pendente', 'ativo')
   order by (d.status = 'pendente') desc, d.criado_em desc
$$;

create or replace function public.responder_convite_dependente(p_dependente_id bigint, p_acao text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  meu_email text;
  vinculo public.dependentes%rowtype;
  novo_status text;
begin
  select lower(u.email) into meu_email from public.usuarios u where u.auth_id = auth.uid();
  if meu_email is null then raise exception 'Não autenticado.'; end if;

  select * into vinculo from public.dependentes d where d.id = p_dependente_id;
  if not found or lower(coalesce(vinculo.email_dependente, '')) <> meu_email then
    raise exception 'Pedido não encontrado.';
  end if;

  if p_acao = 'autorizar' and vinculo.status = 'pendente' then
    novo_status := 'ativo';
  elsif p_acao in ('recusar', 'revogar') and vinculo.status in ('pendente', 'ativo') then
    novo_status := 'revogado';
  else
    raise exception 'Esta ação não é possível para este pedido.';
  end if;

  perform set_config('app.resposta_convite', '1', true);
  update public.dependentes
     set status = novo_status,
         autorizado_em = case when novo_status = 'ativo' then now() else autorizado_em end,
         autorizacao_origem = case when novo_status = 'ativo' then 'aceite_do_dependente' else autorizacao_origem end
   where id = p_dependente_id;
  perform set_config('app.resposta_convite', '', true);
  return novo_status;
end;
$$;

revoke all on function public.meus_convites_de_dependente(),
  public.responder_convite_dependente(bigint, text) from public, anon;
grant execute on function public.meus_convites_de_dependente(),
  public.responder_convite_dependente(bigint, text) to authenticated;
