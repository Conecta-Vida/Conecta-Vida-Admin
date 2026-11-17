import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Megaphone, ArrowLeft, Loader2, Save, Trash2, Users } from "lucide-react";
import { campanhaService, type Campanha, type InscritoCampanha } from "../services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function CampanhaDetalhes() {
  const { id } = useParams(); 
  const navigate = useNavigate();
  const [campanha, setCampanha] = useState<Campanha | null>(null);
  const [loading, setLoading] = useState(true);
  const [inscritos, setInscritos] = useState<InscritoCampanha[] | null>(null);

  useEffect(() => {
    if (!id) return;
    campanhaService.buscarPorId(Number(id))
      .then(setCampanha)
      .catch(() => toast.error("Campanha não localizada."))
      .finally(() => setLoading(false));
    campanhaService.listarInscritos(Number(id))
      .then(setInscritos)
      .catch(() => setInscritos([]));
  }, [id]);

  const handleSalvar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!campanha || !id) return;
    const f = new FormData(e.currentTarget);
    const atualizada: Campanha = {
      ...campanha,
      titulo: f.get("titulo") as string,
      descricao: f.get("descricao") as string,
      status: f.get("status") as string, 
    };

    try {
      await campanhaService.atualizar(Number(id), atualizada);
      toast.success("Alterações salvas!");
      navigate("/campanhas");
    } catch (err) {
      toast.error((err as Error)?.message || "Erro ao salvar.");
    }
  };

  const handleDeletar = async () => {
    if (!id || !confirm("Remover esta campanha definitivamente do feed público?")) return;
    try {
      await campanhaService.deletar(Number(id));
      toast.success("Campanha excluída.");
      navigate("/campanhas");
    } catch (err) {
      toast.error((err as Error)?.message || "Erro ao deletar.");
    }
  };

  if (loading) return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="animate-spin text-blue-600" /></div>;
  if (!campanha) return <div className="text-center py-20 text-slate-400 font-bold">Nenhum dado encontrado.</div>;

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10">
      <Button variant="ghost" size="sm" onClick={() => navigate("/campanhas")} className="gap-1 font-bold text-slate-500 hover:text-slate-900"><ArrowLeft className="w-4 h-4" /> Voltar</Button>
      
      <Card className="border-none shadow-sm bg-white overflow-hidden rounded-xl">
        <CardHeader className="bg-slate-50 border-b border-slate-100 flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-black flex items-center gap-1.5"><Megaphone className="w-5 h-5 text-blue-600" /> Detalhes operacionais</CardTitle>
          <Button variant="destructive" size="sm" onClick={handleDeletar} className="font-bold gap-1 border-none shadow-sm"><Trash2 className="w-4 h-4" /> Excluir</Button>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSalvar} className="space-y-4">
            <div className="grid gap-1.5"><Label className="font-bold text-slate-700">Título da Campanha</Label><Input name="titulo" defaultValue={campanha.titulo} required /></div>
            <div className="grid gap-1.5"><Label className="font-bold text-slate-700">Instruções Médicas / Descrição</Label><textarea name="descricao" defaultValue={campanha.descricao} required className="w-full min-h-[120px] border p-3 text-sm rounded-md bg-white border-slate-200 outline-none focus:ring-2 focus:ring-blue-600 font-medium" /></div>
            <div className="grid gap-1.5">
              <Label className="font-bold text-slate-700">Status Operacional</Label>
              <select name="status" defaultValue={campanha.status?.toUpperCase()} className="h-10 border bg-white border-slate-200 rounded-md px-3 text-sm font-semibold focus:ring-2 focus:ring-blue-600 w-full">
                <option value="ATIVA">Ativa (Visível no App)</option>
                <option value="ENCERRADA">Encerrada (Histórico)</option>
                <option value="AGENDADA">Agendada (Oculta)</option>
              </select>
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 font-bold text-white h-11 gap-1 shadow mt-4 border-none"><Save className="w-4 h-4" /> Salvar Modificações</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm bg-white overflow-hidden rounded-xl">
        <CardHeader className="bg-slate-50 border-b border-slate-100 flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-black flex items-center gap-1.5">
            <Users className="w-5 h-5 text-blue-600" /> Inscritos
          </CardTitle>
          <span className="rounded-full bg-blue-100 px-3 py-0.5 text-xs font-black text-blue-700">
            {inscritos === null ? "..." : `${inscritos.length} pessoa(s)`}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {inscritos === null ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-600" /></div>
          ) : inscritos.length === 0 ? (
            <p className="py-8 text-center text-sm font-medium italic text-slate-400">
              Ninguém se inscreveu nesta campanha ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-6 py-3">Participante</th>
                    <th className="px-6 py-3">Vínculo</th>
                    <th className="px-6 py-3">Conta responsável</th>
                    <th className="px-6 py-3">Inscrito em</th>
                  </tr>
                </thead>
                <tbody>
                  {inscritos.map((i) => (
                    <tr key={i.id} className="border-t border-slate-100">
                      <td className="px-6 py-3 font-bold text-slate-800">{i.participante}</td>
                      <td className="px-6 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${
                          i.vinculo === "Titular" ? "bg-slate-100 text-slate-600" : "bg-violet-100 text-violet-700"
                        }`}>
                          {i.vinculo}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {i.responsavel}
                        <span className="block text-xs text-slate-400">{i.emailResponsavel}</span>
                      </td>
                      <td className="px-6 py-3 text-slate-500">
                        {i.dataInscricao ? new Date(i.dataInscricao).toLocaleDateString("pt-BR") : "-"}
                      </td>
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