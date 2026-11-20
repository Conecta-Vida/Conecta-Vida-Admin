"""
Testes das regras de negócio do caso de uso "Inscrever-se em campanha"
implementadas no banco (políticas RLS e gatilhos do Supabase).

RN01 - Só comunicações do tipo CAMPANHA aceitam inscrição.
RN02 - Só campanhas abertas (status ATIVA e término não ultrapassado) aceitam
       novas inscrições.
RN03 - O participante é o próprio titular ou um dependente dele com vínculo
       ATIVO (pendente, revogado ou de outra conta não podem ser inscritos).
RN04 - Cada participante tem no máximo uma inscrição por campanha.
RN05 - Revogar o vínculo de um dependente cancela as inscrições dele em
       campanhas ainda abertas.
RN06 - Cada titular tem no máximo 10 dependentes não revogados (limite de
       participantes por inscrição: titular + 10).
"""
import pytest

from conftest import COM_CORRECAO, ErroSql, criar_campanha, inscrever, total_inscricoes

RLS = "row-level security"


# ---------------------------------------------------------------- RN01 ---
def test_rn01_titular_se_inscreve_em_campanha_aberta(banco, cenario):
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"], cenario["campanha_aberta"])
    assert total_inscricoes(banco, cenario["campanha_aberta"]) == 1


def test_rn01_nao_aceita_inscricao_em_noticia(banco, cenario):
    with pytest.raises(ErroSql, match=RLS):
        inscrever(banco, cenario["titular_auth"], cenario["titular_id"], cenario["noticia"])
    assert total_inscricoes(banco, cenario["noticia"]) == 0


# ---------------------------------------------------------------- RN02 ---
@pytest.mark.xfail(not COM_CORRECAO, strict=True, reason=(
    "DEFEITO D01: a política cv_inscricoes_insert confere só o tipo da "
    "comunicação; não confere status ATIVA nem data_fim. A API aceita "
    "inscrição em campanha ENCERRADA. Corrigido pela migration "
    "20261120120000_inscricao_somente_campanha_aberta.sql."))
def test_rn02_nao_aceita_inscricao_em_campanha_encerrada(banco, cenario):
    with pytest.raises(ErroSql, match=RLS):
        inscrever(banco, cenario["titular_auth"], cenario["titular_id"], cenario["campanha_encerrada"])


@pytest.mark.xfail(not COM_CORRECAO, strict=True, reason="DEFEITO D01 (campanha vencida ainda ATIVA).")
def test_rn02_nao_aceita_inscricao_em_campanha_vencida_antes_do_encerramento(banco, cenario):
    # Término já passou, mas o pg_cron ainda não rodou (status continua ATIVA).
    vencida = criar_campanha(banco, "Vencida há 1 hora", fim="now() - interval '1 hour'")
    with pytest.raises(ErroSql, match=RLS):
        inscrever(banco, cenario["titular_auth"], cenario["titular_id"], vencida)


def test_rn02_cancelar_em_campanha_encerrada_continua_permitido(banco, cenario):
    banco.admin("insert into public.usuarios_campanhas (usuario_id, comunicacao_id) "
                f"values ({cenario['titular_id']}, {cenario['campanha_encerrada']});")
    banco.como(cenario["titular_auth"],
               f"delete from public.usuarios_campanhas where comunicacao_id = {cenario['campanha_encerrada']};")
    assert total_inscricoes(banco, cenario["campanha_encerrada"]) == 0


def test_rn02_encerramento_automatico_fecha_campanha_vencida(banco, cenario):
    vencida = criar_campanha(banco, "Vencida ontem", fim="now() - interval '1 day'")
    banco.admin("select app.encerrar_campanhas_vencidas();")
    assert banco.admin(f"select status from public.comunicacoes where id = {vencida};") == "ENCERRADA"


@pytest.mark.parametrize("fim, esperado", [
    ("now() - interval '1 second'", "ENCERRADA"),   # limite: acabou de vencer
    ("now() + interval '1 minute'", "ATIVA"),       # limite: ainda dentro do prazo
    ("null", "ATIVA"),                               # sem data de término
])
def test_rn02_valor_limite_da_data_de_termino(banco, cenario, fim, esperado):
    campanha = criar_campanha(banco, "Limite", fim=fim)
    banco.admin("select app.encerrar_campanhas_vencidas();")
    assert banco.admin(f"select status from public.comunicacoes where id = {campanha};") == esperado


# ---------------------------------------------------------------- RN03 ---
def test_rn03_inscreve_dependente_ativo(banco, cenario):
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"],
              cenario["campanha_aberta"], cenario["dep_menor"])
    assert total_inscricoes(banco, cenario["campanha_aberta"]) == 1


@pytest.mark.parametrize("dependente", ["dep_pendente", "dep_revogado", "dep_de_outro"])
def test_rn03_recusa_dependente_sem_vinculo_ativo_ou_de_outra_conta(banco, cenario, dependente):
    with pytest.raises(ErroSql, match=RLS):
        inscrever(banco, cenario["titular_auth"], cenario["titular_id"],
                  cenario["campanha_aberta"], cenario[dependente])
    assert total_inscricoes(banco, cenario["campanha_aberta"]) == 0


def test_rn03_dependente_adulto_vira_ativo_apos_autorizar(banco, cenario):
    banco.como(cenario["adulto_auth"],
               f"select public.responder_convite_dependente({cenario['dep_pendente']}, 'autorizar');")
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"],
              cenario["campanha_aberta"], cenario["dep_pendente"])
    assert total_inscricoes(banco, cenario["campanha_aberta"]) == 1


def test_rn03_nao_inscreve_em_nome_de_outro_titular(banco, cenario):
    with pytest.raises(ErroSql, match=RLS):
        inscrever(banco, cenario["titular_auth"], cenario["outro_id"], cenario["campanha_aberta"])


# ---------------------------------------------------------------- RN04 ---
def test_rn04_inscricao_duplicada_do_titular_e_barrada(banco, cenario):
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"], cenario["campanha_aberta"])
    with pytest.raises(ErroSql, match="duplicate key"):   # código 23505
        inscrever(banco, cenario["titular_auth"], cenario["titular_id"], cenario["campanha_aberta"])
    assert total_inscricoes(banco, cenario["campanha_aberta"]) == 1


def test_rn04_titular_e_dependente_na_mesma_campanha(banco, cenario):
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"], cenario["campanha_aberta"])
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"],
              cenario["campanha_aberta"], cenario["dep_menor"])
    with pytest.raises(ErroSql, match="duplicate key"):
        inscrever(banco, cenario["titular_auth"], cenario["titular_id"],
                  cenario["campanha_aberta"], cenario["dep_menor"])
    assert total_inscricoes(banco, cenario["campanha_aberta"]) == 2


# ---------------------------------------------------------------- RN05 ---
def test_rn05_revogar_dependente_cancela_inscricao_em_campanha_aberta(banco, cenario):
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"],
              cenario["campanha_aberta"], cenario["dep_menor"])
    # Inscrição antiga numa campanha que depois foi encerrada (feita pelo admin).
    banco.admin("insert into public.usuarios_campanhas (usuario_id, comunicacao_id, dependente_id) "
                f"values ({cenario['titular_id']}, {cenario['campanha_encerrada']}, {cenario['dep_menor']});")

    banco.como(cenario["titular_auth"],
               f"update public.dependentes set ativo = false where id = {cenario['dep_menor']};")

    assert total_inscricoes(banco, cenario["campanha_aberta"]) == 0      # cancelada
    assert total_inscricoes(banco, cenario["campanha_encerrada"]) == 1   # histórico mantido


# ---------------------------------------------------------------- RN06 ---
def _cadastrar_dependentes(banco, cenario, quantos):
    for n in range(quantos):
        banco.como(cenario["titular_auth"],
            "insert into public.dependentes (usuario_titular_id, nome_completo, data_nascimento, parentesco, declarou_responsabilidade) "
            f"values ({cenario['titular_id']}, 'Extra {n}', current_date - interval '4 years', 'Filho(a)', true);")


def test_rn06_aceita_ate_o_decimo_dependente(banco, cenario):
    # O cenário já tem 2 não revogados (menor + pendente); 8 extras = 10.
    _cadastrar_dependentes(banco, cenario, 8)
    assert banco.admin(
        f"select count(*) from public.dependentes where usuario_titular_id = {cenario['titular_id']} "
        "and status <> 'revogado';") == "10"


def test_rn06_recusa_o_decimo_primeiro_dependente(banco, cenario):
    _cadastrar_dependentes(banco, cenario, 8)
    with pytest.raises(ErroSql, match="Limite de 10 dependentes"):
        _cadastrar_dependentes(banco, cenario, 1)


# ------------------------------------------------- privacidade (RNF01) ---
def test_titular_so_ve_as_proprias_inscricoes(banco, cenario):
    inscrever(banco, cenario["titular_auth"], cenario["titular_id"], cenario["campanha_aberta"])
    inscrever(banco, cenario["outro_auth"], cenario["outro_id"], cenario["campanha_aberta"])
    visiveis = banco.como(cenario["titular_auth"], "select usuario_id from public.usuarios_campanhas;")
    assert visiveis.splitlines() == [str(cenario["titular_id"])]
