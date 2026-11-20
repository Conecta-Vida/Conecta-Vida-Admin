# Qualidade de Software: testes das regras no banco

Testes do caso de uso **Inscrever-se em campanha** (Trabalho 2 de Qualidade de
Software, IFSP Bragança Paulista). Eles aplicam as migrations reais de
`supabase/migrations` num PostgreSQL e verificam as regras de negócio que
ficam nas políticas RLS e nos gatilhos.

| Pasta / arquivo | O que é |
| :--- | :--- |
| `testes_banco/sql/00_supabase_stub.sql` | **Stub** do Supabase (auth, storage, cron, realtime). |
| `testes_banco/sql/01_base_schema.sql` | Tabelas base criadas originalmente pelo Flyway V1 (reconstruídas das entidades JPA). |
| `testes_banco/sql/02_flyway_V2_dependentes.sql` | Cópia do Flyway V2 da API Java (dependentes e inscrições por participante). |
| `testes_banco/conftest.py` | **Driver** (`Banco`) e massa de dados (`cenario`). |
| `testes_banco/test_regras_inscricao.py` | Testes RN01 a RN06. |
| `.github/workflows/qualidade-testes-banco.yml` | Roda tudo no GitHub Actions e publica o relatório. |

## Rodar na sua máquina

Com um PostgreSQL local (16 ou 17) e o `psql` no PATH:

```bash
cd qualidade/testes_banco
pip install pytest pytest-html
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres pytest -v -rxX
```

## Defeito encontrado

**D01:** a política `cv_inscricoes_insert` só confere se a comunicação é do tipo
CAMPANHA. Ela não confere `status = 'ATIVA'` nem `data_fim`, então é possível se
inscrever numa campanha **encerrada** chamando a API direto. O app também deixa
isso acontecer: quando o titular já estava inscrito numa campanha encerrada, o
diálogo abre e permite marcar dependentes novos. O teste
`test_rn02_nao_aceita_inscricao_em_campanha_encerrada` fica marcado como
`xfail` (falha esperada) até a correção.

Correção: migration `supabase/migrations/20261120120000_inscricao_somente_campanha_aberta.sql`
(neste branch; ainda não aplicada em produção). O workflow roda os testes duas vezes:

| Execução | Resultado esperado | Relatório |
| :--- | :--- | :--- |
| antes da correção | 19 passam, 2 `xfail` (defeito D01 comprovado) | `relatorios/pytest-relatorio-antes-da-correcao.html` |
| depois da correção | 21 passam (reteste de regressão) | `relatorios/pytest-relatorio-depois-da-correcao.html` |

Para rodar localmente depois da correção: `COM_CORRECAO=1 pytest -v -rxX`.
