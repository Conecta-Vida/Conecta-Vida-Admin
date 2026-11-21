"""
Testes da regra de negócio RN07 do caso de uso "Inscrever-se em campanha",
implementada no banco (gatilhos do Supabase).

RN07 - Cada campanha pode ter um limite de vagas (coluna `vagas`). Cada pessoa
       inscrita (titular ou dependente) ocupa uma vaga e cancelar a inscrição
       libera a vaga. Vagas nulo significa sem limite. O banco é a autoridade:
       a regra vale também quando duas pessoas disputam a última vaga ao
       mesmo tempo.
"""
import subprocess
import time

import pytest

from conftest import ErroSql, criar_campanha, inscrever, total_inscricoes

ESGOTADAS = "Vagas esgotadas para esta campanha."


def definir_vagas(banco, campanha, vagas):
    banco.admin(f"update public.comunicacoes set vagas = {vagas} where id = {campanha};")


def inscritos(banco, campanha):
    return int(banco.admin(f"select inscritos from public.comunicacoes where id = {campanha};"))


def test_rn07_sem_vagas_nao_limita(banco, cenario):
    c = cenario["campanha_aberta"]
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"], c)
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"], c, cenario["dep_menor"])
    assert total_inscricoes(banco, c) == 2


def test_rn07_aceita_ate_a_ultima_vaga(banco, cenario):
    c = cenario["campanha_aberta"]
    definir_vagas(banco, c, 2)
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"], c)
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"], c, cenario["dep_menor"])
    assert total_inscricoes(banco, c) == 2
    assert inscritos(banco, c) == 2


def test_rn07_recusa_alem_da_ultima_vaga(banco, cenario):
    c = cenario["campanha_aberta"]
    definir_vagas(banco, c, 2)
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"], c)
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"], c, cenario["dep_menor"])
    with pytest.raises(ErroSql, match=ESGOTADAS):
        inscrever(banco, cenario["outro_auth"], cenario["outro_id"], c)
    assert total_inscricoes(banco, c) == 2


def test_rn07_cancelar_libera_a_vaga(banco, cenario):
    c = cenario["campanha_aberta"]
    definir_vagas(banco, c, 2)
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"], c)
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"], c, cenario["dep_menor"])
    banco.como(cenario["titular_auth"],
               f"delete from public.usuarios_campanhas where comunicacao_id = {c} and dependente_id is null;")
    assert inscritos(banco, c) == 1
    inscrever(banco, cenario["outro_auth"], cenario["outro_id"], c)
    assert total_inscricoes(banco, c) == 2
    assert inscritos(banco, c) == 2


def test_rn07_rn05_revogar_dependente_libera_vaga(banco, cenario):
    c = cenario["campanha_aberta"]
    definir_vagas(banco, c, 2)
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"], c, cenario["dep_menor"])
    assert inscritos(banco, c) == 1
    banco.como(cenario["titular_auth"],
               f"update public.dependentes set ativo = false where id = {cenario['dep_menor']};")
    assert total_inscricoes(banco, c) == 0
    assert inscritos(banco, c) == 0


def test_rn07_gestor_reduz_vagas_abaixo_dos_inscritos(banco, cenario):
    c = cenario["campanha_aberta"]
    definir_vagas(banco, c, 5)
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"], c)
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"], c, cenario["dep_menor"])
    definir_vagas(banco, c, 1)
    assert total_inscricoes(banco, c) == 2  # ninguém é removido
    with pytest.raises(ErroSql, match=ESGOTADAS):
        inscrever(banco, cenario["outro_auth"], cenario["outro_id"], c)


def test_rn07_vagas_zero_recusada(banco, cenario):
    with pytest.raises(ErroSql, match="check"):
        definir_vagas(banco, cenario["campanha_aberta"], 0)


def test_rn07_excluir_campanha_com_inscritos(banco, cenario):
    c = criar_campanha(banco, "Campanha a excluir")
    definir_vagas(banco, c, 3)
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"], c)
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"], c, cenario["dep_menor"])
    banco.admin(f"delete from public.comunicacoes where id = {c};")
    assert total_inscricoes(banco, c) == 0


def test_rn07_duas_pessoas_disputando_a_ultima_vaga(banco, cenario):
    c = cenario["campanha_aberta"]
    definir_vagas(banco, c, 1)

    def sessao(auth_id, usuario_id, segurar):
        sql = (
            "begin;\n"
            "set local role authenticated;\n"
            f"select set_config('request.jwt.claim.sub', '{auth_id}', true) \\g /dev/null\n"
            "insert into public.usuarios_campanhas (usuario_id, comunicacao_id, notificacao_lida) "
            f"values ({usuario_id}, {c}, false);\n"
            + (f"select pg_sleep({segurar}) \\g /dev/null\n" if segurar else "")
            + "commit;\n"
        )
        return subprocess.Popen(
            ["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", banco.banco],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        ), sql

    a, sql_a = sessao(cenario["titular_auth"], cenario["titular_id"], 2)
    b, sql_b = sessao(cenario["outro_auth"], cenario["outro_id"], 0)
    a.stdin.write(sql_a); a.stdin.close()
    time.sleep(0.5)  # A já inseriu e segura a transação aberta
    b.stdin.write(sql_b); b.stdin.close()
    _, erro_a = a.communicate()
    _, erro_b = b.communicate()

    assert a.returncode == 0, erro_a
    assert b.returncode != 0
    assert ESGOTADAS in erro_b
    assert total_inscricoes(banco, c) == 1
    assert inscritos(banco, c) == 1
