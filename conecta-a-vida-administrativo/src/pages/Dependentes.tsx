import { useEffect, useMemo, useState } from "react";
import { HeartHandshake, Loader2, Search } from "lucide-react";
import { dependenteService, type DependenteAdmin } from "../services/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Filtro = "todos" | "ativo" | "pendente" | "revogado";

const ROTULOS: Record<DependenteAdmin["status"], { texto: string; classe: string }> = {
  ativo: { texto: "Ativo", classe: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  pendente: { texto: "Aguardando autorização", classe: "bg-amber-100 text-amber-700 border-amber-200" },
  revogado: { texto: "Revogado", classe: "bg-slate-100 text-slate-500 border-slate-200" },
};

/**
 * Acompanhamento dos vínculos entre titulares e dependentes.
 * Somente leitura: quem cria, autoriza ou revoga são os próprios cidadãos
 * pelo aplicativo, seguindo as regras do banco.
 */
export default function Dependentes() {
  const [lista, setLista] = useState<DependenteAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    dependenteService.listar()
      .then(setLista)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setCarregando(false));
  }, []);

  const contagem = useMemo(() => ({
    todos: lista.length,
    ativo: lista.filter((d) => d.status === "ativo").length,
    pendente: lista.filter((d) => d.status === "pendente").length,
    revogado: lista.filter((d) => d.status === "revogado").length,
  }), [lista]);

  const visiveis = lista.filter((d) => {
    if (filtro !== "todos" && d.status !== filtro) return false;
    const termo = busca.trim().toLowerCase();
    if (!termo) return true;
    return [d.nome, d.titularNome, d.titularEmail, d.emailDependente].some((v) => v.toLowerCase().includes(termo));
  });

  if (carregando) {
    return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-blue-600" /></div>;
  }

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-3xl font-black flex items-center gap-2 text-slate-900">
          <HeartHandshake className="w-8 h-8 text-violet-600" /> Dependentes
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Menores de idade e tutelados entram pela declaração do responsável; adultos precisam autorizar pelo próprio aplicativo.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(["todos", "ativo", "pendente", "revogado"] as Filtro[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                filtro === f ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {f === "todos" ? "Todos" : ROTULOS[f].texto} ({contagem[f]})
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" className="pl-9 bg-white" />
        </div>
      </div>

      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <CardContent className="p-0">
          {visiveis.length === 0 ? (
            <p className="py-12 text-center text-sm italic text-slate-400">Nenhum dependente encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-3">Dependente</th>
                    <th className="px-6 py-3">Responsável</th>
                    <th className="px-6 py-3">Situação</th>
                    <th className="px-6 py-3">Como foi autorizado</th>
                    <th className="px-6 py-3">Cadastro</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((d) => (
                    <tr key={d.id} className="border-t border-slate-100">
                      <td className="px-6 py-3">
                        <p className="font-bold text-slate-800">{d.nome}</p>
                        <p className="text-xs text-slate-400">{d.parentesco} · {d.idade} anos</p>
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {d.titularNome}
                        <span className="block text-xs text-slate-400">{d.titularEmail}</span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-black ${ROTULOS[d.status].classe}`}>
                          {ROTULOS[d.status].texto}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {d.origem}
                        {d.emailDependente && <span className="block text-xs text-slate-400">{d.emailDependente}</span>}
                      </td>
                      <td className="px-6 py-3 text-slate-500">{d.criadoEm ? new Date(d.criadoEm).toLocaleDateString("pt-BR") : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
