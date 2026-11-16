-- Uso em todo o Brasil: as unidades de saúde passam a ser buscadas no CNES
-- para a cidade de quem abre o app (Edge Function "unidades-proximas"), e não
-- só para Bragança Paulista.

-- Municípios do IBGE (preenchida pela função na primeira vez).
create table if not exists public.municipios_ibge (
  codigo integer primary key,          -- código IBGE de 7 dígitos
  nome text not null,
  nome_busca text not null,            -- sem acento e minúsculo, para comparar
  uf char(2) not null,
  unidades_atualizadas_em timestamptz  -- última busca no CNES
);
create index if not exists municipios_ibge_busca on public.municipios_ibge (nome_busca);
alter table public.municipios_ibge enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'municipios_ibge' and policyname = 'cv_municipios_select') then
    create policy cv_municipios_select on public.municipios_ibge for select to anon, authenticated using (true);
  end if;
end $$;

-- De qual município é cada unidade.
alter table public.instituicoes_saude add column if not exists codigo_municipio integer;
create index if not exists instituicoes_saude_municipio on public.instituicoes_saude (codigo_municipio);

-- As unidades já importadas são de Bragança Paulista (IBGE 3507605).
update public.instituicoes_saude set codigo_municipio = 3507605
 where codigo_cnes is not null and codigo_municipio is null;
