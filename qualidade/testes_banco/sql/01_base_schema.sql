-- =====================================================================
-- Esquema base (anterior às migrations do Supabase).
-- As tabelas abaixo foram criadas originalmente pelo Flyway da API Java
-- (versão V1, que não está versionada no repositório). Foram reconstruídas
-- a partir das entidades JPA de conecta-vida-backend/core/.../domain e do
-- DER em Conecta-Vida-Documentacao/BANCO_E_SERVICOS.md.
-- =====================================================================

create table if not exists public.usuarios (
  id bigint generated always as identity primary key,
  nome varchar(100) not null,
  email varchar(100) not null unique,
  senha varchar(255) not null,
  data_nascimento integer,               -- ano de nascimento
  sexo varchar(20),
  localizacao varchar(255),
  permissao varchar(30) not null default 'Usuário Comum'
);

create table if not exists public.instituicoes_saude (
  id bigint generated always as identity primary key,
  tipo_instituicao varchar(50) not null,
  nome varchar(150) not null,
  email varchar(150),
  telefone varchar(20) not null,
  linksite varchar(255),
  endereco varchar(255),
  horario_seg_sex varchar(100),
  horario_sabado varchar(100),
  horario_domingo varchar(100)
);

create table if not exists public.comunicacoes (
  id bigint generated always as identity primary key,
  tipo varchar(20) not null,
  instituicao_id bigint references public.instituicoes_saude (id),
  titulo varchar(255) not null,
  descricao text not null,
  categoria varchar(100),
  linkimagem varchar(500),
  localizacao varchar(255),
  publico_alvo varchar(255),
  status varchar(20),
  lido boolean default false,
  data_postada timestamp without time zone not null default now(),
  data_inicio timestamp without time zone,
  data_fim timestamp without time zone
);

create table if not exists public.usuarios_campanhas (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references public.usuarios (id) on delete cascade,
  comunicacao_id bigint not null references public.comunicacoes (id) on delete cascade,
  data_inscricao timestamp without time zone not null default now(),
  data_notificacao_fim timestamp without time zone,
  notificacao_lida boolean not null default false,
  criado_em timestamp without time zone not null default now(),
  atualizado_em timestamp without time zone
);

create table if not exists public.logs_atividade (
  id bigint generated always as identity primary key,
  usuario_id bigint not null references public.usuarios (id) on delete cascade,
  acao varchar(255) not null,
  data_hora timestamp without time zone not null default now()
);

-- No Supabase as tabelas do schema public já nascem com RLS ligada e com
-- privilégios para o papel "authenticated"; a migração de RLS só ajusta.
alter table public.usuarios enable row level security;
alter table public.instituicoes_saude enable row level security;
alter table public.comunicacoes enable row level security;
alter table public.usuarios_campanhas enable row level security;
alter table public.logs_atividade enable row level security;

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
