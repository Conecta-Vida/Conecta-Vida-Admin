-- Vagas por campanha (RN07) ----------------------------------------------------
-- O gestor define quantas vagas a campanha tem (vagas nulo = sem limite). Cada
-- inscrição (titular ou dependente) ocupa uma vaga; cancelar libera. O banco é a
-- autoridade da regra: a trava da última vaga vale também sob concorrência.

alter table public.comunicacoes
  add column if not exists vagas integer,
  add column if not exists inscritos integer not null default 0;

alter table public.comunicacoes
  drop constraint if exists comunicacoes_vagas_positivas;
alter table public.comunicacoes
  add constraint comunicacoes_vagas_positivas check (vagas is null or vagas > 0);

-- Contador das campanhas que já têm inscrições
update public.comunicacoes c
   set inscritos = (select count(*) from public.usuarios_campanhas uc
                     where uc.comunicacao_id = c.id);

-- Recusa a inscrição quando as vagas acabaram. Trava a linha da campanha
-- (for update) para que duas inscrições simultâneas sejam conferidas em fila.
-- A conferência conta as linhas de usuarios_campanhas em vez de ler o
-- contador: num INSERT de várias linhas o contador só é atualizado no fim do
-- comando, mas a contagem já enxerga as linhas gravadas antes no mesmo comando.
-- security definer: o cidadão não tem permissão de ler/travar comunicacoes.
create or replace function app.conferir_vaga()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_vagas integer;
  v_inscritos integer;
begin
  select vagas into v_vagas
    from public.comunicacoes
   where id = new.comunicacao_id
     for update;

  -- Inscrição repetida: deixa a restrição de unicidade recusar (23505, que o
  -- app trata como "já inscrito") em vez de responder "Vagas esgotadas".
  if exists (select 1 from public.usuarios_campanhas uc
              where uc.usuario_id = new.usuario_id
                and uc.comunicacao_id = new.comunicacao_id
                and uc.dependente_id is not distinct from new.dependente_id) then
    return new;
  end if;

  select count(*) into v_inscritos
    from public.usuarios_campanhas
   where comunicacao_id = new.comunicacao_id;

  if v_vagas is not null and v_inscritos >= v_vagas then
    raise exception 'Vagas esgotadas para esta campanha.';
  end if;
  return new;
end;
$$;

create or replace trigger trg_inscricao_confere_vaga
  before insert on public.usuarios_campanhas
  for each row execute function app.conferir_vaga();

-- Mantém o contador: +1 ao inscrever, -1 ao cancelar (nunca abaixo de zero).
-- security definer: o cidadão não pode atualizar comunicacoes.
create or replace function app.contar_inscritos()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.comunicacoes set inscritos = inscritos + 1 where id = new.comunicacao_id;
    return new;
  end if;
  update public.comunicacoes set inscritos = greatest(inscritos - 1, 0) where id = old.comunicacao_id;
  return old;
end;
$$;

create or replace trigger trg_inscricao_conta_inscritos
  after insert or delete on public.usuarios_campanhas
  for each row execute function app.contar_inscritos();
