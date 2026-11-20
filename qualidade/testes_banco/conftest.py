"""
Infraestrutura dos testes das regras de negócio do caso de uso
"Inscrever-se em campanha", executados contra as migrations REAIS do
Supabase (supabase/migrations) num PostgreSQL comum.

Recursos de teste usados (exigência do Trabalho 2):
  * STUB   - sql/00_supabase_stub.sql substitui auth, storage, cron e
             realtime do Supabase.
  * DRIVER - a classe Banco abaixo é o driver: ela executa os comandos SQL
             via psql, como se fosse o app logado (papel "authenticated").
  * Massa de dados - a fixture `cenario` monta titular, dependentes e
             campanhas antes de cada teste.

Conexão: variáveis PGHOST, PGPORT, PGUSER (padrão localhost:5432/postgres).
"""
import os
import re
import subprocess
import uuid
from pathlib import Path

import pytest

AQUI = Path(__file__).resolve().parent
MIGRATIONS = AQUI.parent.parent / "supabase" / "migrations"

# Ordem de aplicação: ambiente simulado, esquema base, Flyway V2 e as
# migrations do Supabase que tratam do caso de uso.
ARQUIVOS = [
    AQUI / "sql" / "00_supabase_stub.sql",
    AQUI / "sql" / "01_base_schema.sql",
    AQUI / "sql" / "02_flyway_V2_dependentes.sql",
    AQUI / "sql" / "03_ajustes_ambiente.sql",
    MIGRATIONS / "20261115000000_supabase_auth_e_rls.sql",
    MIGRATIONS / "20261115140000_padronizacao_imagens_e_encerramento.sql",
    MIGRATIONS / "20261115160000_regras_de_dependentes.sql",
]

NOME_BANCO = "conecta_vida_teste"


class ErroSql(Exception):
    """Erro devolvido pelo PostgreSQL (mensagem do RAISE ou da RLS)."""


class Banco:
    """Driver de teste: executa SQL como administrador do banco ou como um
    usuário logado no app (papel authenticated + auth.uid())."""

    def __init__(self, banco):
        self.banco = banco

    def _psql(self, sql, banco=None):
        proc = subprocess.run(
            ["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1",
             "-d", banco or self.banco],
            input=sql, capture_output=True, text=True,
        )
        if proc.returncode != 0:
            raise ErroSql(proc.stderr.strip())
        return proc.stdout.strip()

    def admin(self, sql):
        """Executa como dono do banco (ignora RLS), para montar dados."""
        return self._psql(sql)

    def como(self, auth_id, sql):
        """Executa como o usuário do app dono de `auth_id` (RLS ativa)."""
        return self._psql(
            "begin;\n"
            "set local role authenticated;\n"
            f"select set_config('request.jwt.claim.sub', '{auth_id}', true) \\g /dev/null\n"
            f"{sql}\n"
            "commit;\n"
        )


def _sem_pg_cron(texto):
    # O pg_cron não existe num Postgres comum; o stub cria cron.schedule.
    return re.sub(r"(?im)^\s*create extension if not exists pg_cron;\s*$", "", texto)


@pytest.fixture(scope="session")
def banco():
    driver = Banco(NOME_BANCO)
    driver._psql(f"drop database if exists {NOME_BANCO};", banco="postgres")
    driver._psql(f"create database {NOME_BANCO};", banco="postgres")
    for arquivo in ARQUIVOS:
        driver.admin(_sem_pg_cron(arquivo.read_text(encoding="utf-8")))
    return driver


def criar_conta(banco, email, ano_nascimento, nome="Pessoa Teste"):
    """Simula o Supabase Auth: conta confirmada -> gatilho cria o perfil."""
    auth_id = str(uuid.uuid4())
    banco.admin(
        "insert into auth.users (id, email, email_confirmed_at, confirmation_sent_at, raw_user_meta_data) "
        f"values ('{auth_id}', '{email}', now(), now(), "
        f"'{{\"nome\": \"{nome}\", \"data_nascimento\": \"{ano_nascimento}\"}}');"
    )
    usuario_id = int(banco.admin(f"select id from public.usuarios where auth_id = '{auth_id}';"))
    return auth_id, usuario_id


def criar_campanha(banco, titulo, status="ATIVA", tipo="CAMPANHA", fim="now() + interval '10 days'"):
    return int(banco.admin(
        "insert into public.comunicacoes (tipo, titulo, descricao, status, data_inicio, data_fim) "
        f"values ('{tipo}', '{titulo}', 'Teste', '{status}', now() - interval '1 day', {fim}) returning id;"
    ))


@pytest.fixture
def cenario(banco):
    """Massa de dados de cada teste (o banco é limpo antes)."""
    banco.admin(
        "truncate public.usuarios_campanhas, public.dependentes, public.comunicacoes, "
        "public.logs_atividade, public.usuarios, auth.users restart identity cascade;"
    )
    titular_auth, titular_id = criar_conta(banco, "titular@teste.com", 1990, "Titular")
    outro_auth, outro_id = criar_conta(banco, "outro@teste.com", 1985, "Outro Titular")
    adulto_auth, _ = criar_conta(banco, "adulto@teste.com", 1960, "Dependente Adulto")

    # Dependentes cadastrados pelo próprio titular (passam pelas regras do gatilho).
    banco.como(titular_auth,
        "insert into public.dependentes (usuario_titular_id, nome_completo, data_nascimento, parentesco, declarou_responsabilidade) "
        f"values ({titular_id}, 'Filho Menor', current_date - interval '8 years', 'Filho(a)', true);")
    banco.como(titular_auth,
        "insert into public.dependentes (usuario_titular_id, nome_completo, data_nascimento, parentesco, email_dependente) "
        f"values ({titular_id}, 'Mãe Adulta', '1960-05-10', 'Mãe', 'adulto@teste.com');")
    banco.como(titular_auth,
        "insert into public.dependentes (usuario_titular_id, nome_completo, data_nascimento, parentesco, declarou_responsabilidade) "
        f"values ({titular_id}, 'Sobrinho Revogado', current_date - interval '5 years', 'Sobrinho(a)', true);")
    banco.como(titular_auth,
        f"update public.dependentes set ativo = false where nome_completo = 'Sobrinho Revogado';")
    banco.como(outro_auth,
        "insert into public.dependentes (usuario_titular_id, nome_completo, data_nascimento, parentesco, declarou_responsabilidade) "
        f"values ({outro_id}, 'Filha de Outro', current_date - interval '3 years', 'Filho(a)', true);")

    ids = {r.split("|")[0]: int(r.split("|")[1]) for r in banco.admin(
        "select nome_completo, id from public.dependentes;").splitlines()}

    return {
        "titular_auth": titular_auth, "titular_id": titular_id,
        "outro_auth": outro_auth, "outro_id": outro_id,
        "adulto_auth": adulto_auth,
        "dep_menor": ids["Filho Menor"], "dep_pendente": ids["Mãe Adulta"],
        "dep_revogado": ids["Sobrinho Revogado"], "dep_de_outro": ids["Filha de Outro"],
        "campanha_aberta": criar_campanha(banco, "Vacinação contra a gripe"),
        "campanha_encerrada": criar_campanha(banco, "Novembro Azul 2025", status="ENCERRADA",
                                             fim="now() - interval '1 day'"),
        "noticia": criar_campanha(banco, "Notícia comum", status="ATIVO", tipo="NOTICIA", fim="null"),
    }


def inscrever(banco, auth_id, usuario_id, comunicacao_id, dependente_id=None):
    dep = "null" if dependente_id is None else dependente_id
    return banco.como(auth_id,
        "insert into public.usuarios_campanhas (usuario_id, comunicacao_id, dependente_id, notificacao_lida) "
        f"values ({usuario_id}, {comunicacao_id}, {dep}, false);")


def total_inscricoes(banco, comunicacao_id):
    return int(banco.admin(
        f"select count(*) from public.usuarios_campanhas where comunicacao_id = {comunicacao_id};"))
