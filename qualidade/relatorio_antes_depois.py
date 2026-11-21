#!/usr/bin/env python3
"""
relatorio_antes_depois.py - junta os relatórios JUnit do pytest das duas
execuções (antes e depois da correção do D01) numa tabela HTML única.

Uso:
  python3 relatorio_antes_depois.py relatorios/pytest-junit-antes-da-correcao.xml \
      relatorios/pytest-junit-depois-da-correcao.xml -o relatorios/antes-depois.html
"""
import argparse
import html
import xml.etree.ElementTree as ET
from pathlib import Path


def ler(caminho):
    resultado = {}
    for caso in ET.parse(caminho).getroot().iter("testcase"):
        nome = caso.get("name")
        if caso.find("failure") is not None or caso.find("error") is not None:
            status = "FALHOU"
        elif caso.find("skipped") is not None:
            # pytest grava o xfail (falha esperada) como "skipped" no JUnit
            status = "XFAIL"
        else:
            status = "PASSOU"
        resultado[nome] = status
    return resultado


ROTULO = {
    "PASSOU": ("passou", "ok"),
    "XFAIL": ("falhou como esperado (defeito D01)", "xf"),
    "FALHOU": ("falhou", "nok"),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("antes")
    ap.add_argument("depois")
    ap.add_argument("-o", "--saida", required=True)
    a = ap.parse_args()
    antes, depois = ler(a.antes), ler(a.depois)
    nomes = list(dict.fromkeys(list(antes) + list(depois)))

    def total(r, s):
        return sum(1 for v in r.values() if v == s)

    linhas = []
    for nome in nomes:
        regra = nome.split("_")[1].upper() if nome.startswith("test_rn") else "RNF01"
        descricao = nome.replace("test_", "").split("_", 1)[-1].replace("_", " ")
        celulas = []
        for r in (antes, depois):
            texto, css = ROTULO[r.get(nome, "FALHOU")]
            celulas.append(f"<td class='{css}'>{texto}</td>")
        linhas.append(f"<tr><td>{regra}</td><td>{html.escape(descricao)}</td>{''.join(celulas)}</tr>")

    pagina = f"""<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Testes das regras no banco: antes e depois da correção</title><style>
body {{ font-family: "DejaVu Sans", Arial, sans-serif; font-size: 13px; margin: 12px; width: 760px; }}
h1 {{ font-size: 16px; margin: 0 0 4px; }} p {{ margin: 2px 0 8px; }}
table {{ border-collapse: collapse; width: 100%; }}
th {{ background: #5b6fa8; color: #fff; text-align: left; }}
td, th {{ border: 1px solid #bbb; padding: 3px 6px; vertical-align: top; }}
.ok {{ background: #c6efce; }} .xf {{ background: #fff2cc; }} .nok {{ background: #f8cbad; }}
</style></head><body>
<h1>pytest: regras do caso de uso no PostgreSQL, antes e depois da correção do D01</h1>
<p>Antes: {total(antes, 'PASSOU')} passaram, {total(antes, 'XFAIL')} falharam como esperado, {total(antes, 'FALHOU')} falhas.
Depois: {total(depois, 'PASSOU')} passaram, {total(depois, 'XFAIL')} falharam como esperado, {total(depois, 'FALHOU')} falhas.</p>
<table><tr><th>Regra</th><th>Teste</th><th>Antes da correção</th><th>Depois da correção</th></tr>
{''.join(linhas)}</table></body></html>"""
    Path(a.saida).write_text(pagina, encoding="utf-8")
    print(f"{len(nomes)} testes -> {a.saida}")


if __name__ == "__main__":
    main()
