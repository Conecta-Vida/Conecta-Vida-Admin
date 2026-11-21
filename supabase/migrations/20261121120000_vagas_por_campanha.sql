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
-- security definer: o cidadão não tem permissão de ler/travar comunicacoes.
create or replace function app.conferir_vaga()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_vagas integer;
  v_inscritos integer;
begin
  select vagas, inscritos into v_vagas, v_inscritos
    from public.comunicacoes
   where id = new.comunicacao_id
     for update;

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
