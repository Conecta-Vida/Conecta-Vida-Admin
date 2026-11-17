import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Search } from "lucide-react";
import { instituicaoService, type InstituicaoSaude } from "../services/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// A lista de instituições é carregada uma vez e reaproveitada pelos formulários.
let cache: Promise<InstituicaoSaude[]> | null = null;
export function carregarInstituicoes(forcar = false): Promise<InstituicaoSaude[]> {
  if (!cache || forcar) cache = instituicaoService.listarTodas().catch((e) => { cache = null; throw e; });
  return cache;
}

/** Lista de instituições para mostrar o nome de quem publicou nos cartões. */
export function useInstituicoes() {
  const [lista, setLista] = useState<InstituicaoSaude[]>([]);
  useEffect(() => { carregarInstituicoes().then(setLista).catch(() => setLista([])); }, []);
  const porId = useMemo(() => new Map(lista.map((i) => [i.id, i])), [lista]);
  return { lista, porId };
}

// Órgãos e unidades cadastradas no painel primeiro, depois Bragança Paulista, depois o resto.
const prioridade = (i: InstituicaoSaude) => (!i.codigoMunicipio ? 0 : i.codigoMunicipio === 3507605 ? 1 : 2);

/**
 * Campo "Instituição responsável" dos formulários de notícia, campanha e alerta.
 * Grava o id escolhido num campo escondido chamado `instituicaoId`.
 */
export default function SeletorInstituicao({ defaultValue }: { defaultValue?: number | null }) {
  const { lista } = useInstituicoes();
  const [busca, setBusca] = useState("");
  const [valor, setValor] = useState<string>(defaultValue ? String(defaultValue) : "");

  const opcoes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lista
      .filter((i) => !termo || `${i.nome} ${i.tipoInstituicao} ${i.endereco ?? ""}`.toLowerCase().includes(termo))
      .sort((a, b) => prioridade(a) - prioridade(b) || a.nome.localeCompare(b.nome, "pt-BR"))
      .slice(0, 150);
  }, [lista, busca]);

  const selecionada = lista.find((i) => String(i.id) === valor);

  return (
    <div className="grid gap-1.5">
      <Label className="font-bold text-slate-700 flex items-center gap-1.5">
        <Building2 className="h-4 w-4 text-blue-600" /> Instituição responsável
      </Label>
      <input type="hidden" name="instituicaoId" value={valor} />
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar instituição pelo nome ou tipo" className="pl-9" />
      </div>
      <select value={valor} onChange={(e) => setValor(e.target.value)}
        className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold">
        <option value="">Nenhuma (sem instituição vinculada)</option>
        {selecionada && !opcoes.includes(selecionada) && (
          <option value={String(selecionada.id)}>{selecionada.nome} · {selecionada.tipoInstituicao}</option>
        )}
        {opcoes.map((i) => (
          <option key={i.id} value={String(i.id)}>{i.nome} · {i.tipoInstituicao}</option>
        ))}
      </select>
      <p className="text-xs text-slate-400">
        Aparece no app como "Órgão publicador", com telefone e site. Não encontrou?{" "}
        <Link to="/instituicoes" className="font-semibold text-blue-600 underline">Cadastre em Unidades de Saúde</Link>.
      </p>
    </div>
  );
}

/** Lê o campo do formulário: id escolhido ou null. */
export const instituicaoDoFormulario = (f: FormData): number | null => {
  const v = Number(f.get("instituicaoId"));
  return Number.isInteger(v) && v > 0 ? v : null;
};
