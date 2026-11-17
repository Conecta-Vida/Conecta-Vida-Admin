import { useEffect, useMemo, useState } from "react";
import { Newspaper, Radio, MapPin, Layers, Edit2, Trash2, MoreHorizontal, Search, ExternalLink, Archive, RotateCcw, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import ImagemUpload from "../components/ImagemUpload";
import BotaoImportar from "../components/BotaoImportar";
import { noticiaService, type Alerta } from "../services/api";

export default function Noticias() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [openCadastro, setOpenCadastro] = useState(false);
  const [openEdicao, setOpenEdicao] = useState(false);
  const [alertaEditando, setAlertaEditando] = useState<Alerta | null>(null);
  const [busca, setBusca] = useState("");
  const [abrangencia, setAbrangencia] = useState("Todas");
  const [situacao, setSituacao] = useState<"ativas" | "arquivadas">("ativas");

  const carregarAlertas = async () => {
    try {
      const dados = await noticiaService.listarTodos();
      setAlertas(dados);
    } catch (err) {
      toast.error((err as Error)?.message || "Falha ao carregar as notícias.");
    }
  };

  useEffect(() => {
    carregarAlertas();
  }, []);

  const handleCadastro = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);

    const novoAlerta: Alerta = {
      titulo: f.get("titulo") as string,
      descricao: f.get("descricao") as string,
      categoria: f.get("categoria") as string,
      localizacao: f.get("localizacao") as string,
      linkimagem: (f.get("linkimagem") as string) || "",
      lido: false
    };

    try {
      await noticiaService.cadastrar(novoAlerta);
      toast.success("Notícia publicada no aplicativo!");
      setOpenCadastro(false);
      carregarAlertas();
    } catch (err) {
      toast.error((err as Error)?.message || "Erro ao publicar a notícia.");
    }
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!alertaEditando?.id) return;
    const f = new FormData(e.currentTarget);

    const dados: Alerta = {
      titulo: f.get("titulo") as string,
      descricao: f.get("descricao") as string,
      categoria: f.get("categoria") as string,
      localizacao: f.get("localizacao") as string,
      linkimagem: (f.get("linkimagem") as string) ?? alertaEditando.linkimagem,
      lido: alertaEditando.lido
    };

    try {
      await noticiaService.atualizar(alertaEditando.id, dados);
      toast.success("Notícia atualizada.");
      setOpenEdicao(false);
      carregarAlertas();
    } catch (err) {
      toast.error((err as Error)?.message || "Erro ao atualizar o registro no banco de dados.");
    }
  };

  const arquivada = (a: Alerta) => (a.status ?? "").toUpperCase() === "ARQUIVADO";

  const abrangencias = useMemo(() =>
    ["Todas", ...[...new Set(alertas.map((a) => a.localizacao || "Geral"))].sort()], [alertas]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return alertas.filter((a) =>
      (situacao === "arquivadas" ? arquivada(a) : !arquivada(a)) &&
      (abrangencia === "Todas" || (a.localizacao || "Geral") === abrangencia) &&
      (!termo || `${a.titulo} ${a.descricao}`.toLowerCase().includes(termo)));
  }, [alertas, busca, abrangencia, situacao]);

  const handleArquivar = async (a: Alerta) => {
    if (!a.id) return;
    try {
      await noticiaService.definirArquivada(a.id, !arquivada(a));
      toast.success(arquivada(a) ? "Notícia voltou para o app." : "Notícia arquivada: não aparece mais no app.");
      carregarAlertas();
    } catch (err) {
      toast.error((err as Error)?.message || "Falha ao atualizar a notícia.");
    }
  };

  const handleDeletar = async (id: number) => {
    if (!confirm("Remover esta notícia definitivamente do aplicativo?")) return;
    try {
      await noticiaService.deletar(id);
      toast.success("Registro removido com sucesso.");
      carregarAlertas();
    } catch (err) {
      toast.error((err as Error)?.message || "Falha ao deletar a publicação polimórfica.");
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-black flex items-center gap-2 text-slate-900">
          <Newspaper className="w-8 h-8 text-blue-500" /> Gestão de Notícias
        </h1>

        <div className="flex flex-wrap items-center gap-2">
        <BotaoImportar alvo="noticias" rotulo="Importar do Ministério da Saúde" aoConcluir={carregarAlertas} />
        <Dialog open={openCadastro} onOpenChange={setOpenCadastro}>
          <DialogTrigger asChild>
            <Button className="bg-blue-500 font-bold hover:bg-blue-600 shadow-sm gap-1 text-white">
              <Radio className="w-4 h-4 animate-pulse" /> Publicar Notícia
            </Button>
          </DialogTrigger>
          {/* 🟢 ADICIONADO: aria-describedby={undefined} */}
          <DialogContent aria-describedby={undefined} className="sm:max-w-[550px] p-6 bg-white rounded-xl">
            <DialogTitle className="text-xl font-black text-slate-900 border-b pb-3 flex items-center gap-2">
              <Radio className="w-5 h-5 text-blue-500" /> Lançar Transmissão de Emergência
            </DialogTitle>
            <form onSubmit={handleCadastro} className="space-y-4 pt-4">
              <div className="grid gap-1.5">
                <Label className="font-bold text-slate-700">Título da Notícia</Label>
                <Input name="titulo" required placeholder="Ex: Nova UBS inaugurada no centro" />
              </div>
              <div className="grid gap-1.5">
                <Label className="font-bold text-slate-700">Instruções de Contingência para a População</Label>
                <textarea name="descricao" required rows={3} placeholder="Escreva o texto da notícia que os cidadãos verão no smartphone..." className="w-full border rounded-md p-2.5 text-sm border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-medium" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label className="font-bold text-slate-700">Grau de Risco (Gatilho Push)</Label>
                  <select name="categoria" required className="h-10 w-full border rounded-md px-3 bg-white text-sm font-semibold border-slate-200">
                    <option value="Informativo">Informativo</option>
                    <option value="Vacinação">Vacinação</option>
                    <option value="Prevenção">Prevenção</option>
                    <option value="Serviços de Saúde">Serviços de Saúde</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="font-bold text-slate-700">Foco Geográfico (Cidade/Bairro)</Label>
                  <Input name="localizacao" required placeholder="Ex: Zona Norte / Geral" />
                </div>
              </div>
              <ImagemUpload />
              <Button type="submit" className="w-full bg-blue-500 hover:bg-blue-600 font-bold text-white h-11 shadow mt-4">
                Publicar Notícia no Aplicativo
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título ou texto" className="pl-9" />
        </div>
        <select value={abrangencia} onChange={(e) => setAbrangencia(e.target.value)}
          className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold md:w-56">
          {abrangencias.map((a) => <option key={a} value={a}>{a === "Todas" ? "Todas as abrangências" : a}</option>)}
        </select>
        <div className="flex rounded-lg border border-slate-200 p-0.5">
          {(["ativas", "arquivadas"] as const).map((s) => (
            <button key={s} onClick={() => setSituacao(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-bold capitalize ${situacao === s ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {s} ({alertas.filter((a) => (s === "arquivadas") === arquivada(a)).length})
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visiveis.map((a) => (
          <Card key={a.id} className="border border-slate-200 shadow-sm bg-white overflow-hidden flex flex-col rounded-xl">
            {a.linkimagem ? (
              <img src={a.linkimagem} alt="" loading="lazy" className="h-40 w-full object-cover" />
            ) : (
              <div className="flex h-24 w-full items-center justify-center bg-slate-50 text-slate-300"><ImageOff className="h-6 w-6" /></div>
            )}
            <CardContent className="p-5 space-y-3 flex-1 flex flex-col">
              <div className="flex justify-between items-start gap-2">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                    <span className="flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-blue-700"><MapPin className="w-3 h-3" /> {a.localizacao || "Geral"}</span>
                    <span className="flex items-center gap-1"><Layers className="w-3 h-3" /> {a.categoria || "Informativo"}</span>
                  </div>
                  <h3 className="font-black text-base text-slate-900 leading-snug line-clamp-3">{a.titulo}</h3>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-slate-600 rounded-md shrink-0">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40 border bg-white shadow-md rounded-lg">
                    <DropdownMenuItem onClick={() => handleArquivar(a)} className="gap-2 cursor-pointer font-bold text-xs text-emerald-600">
                      {arquivada(a) ? <><RotateCcw className="w-3.5 h-3.5" /> Voltar para o app</> : <><Archive className="w-3.5 h-3.5" /> Arquivar</>}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setAlertaEditando(a); setOpenEdicao(true); }} className="gap-2 cursor-pointer font-bold text-xs text-blue-600">
                      <Edit2 className="w-3.5 h-3.5" /> Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => a.id && handleDeletar(a.id)} className="gap-2 cursor-pointer font-bold text-xs text-red-600">
                      <Trash2 className="w-3.5 h-3.5" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <p className="text-sm text-slate-600 leading-relaxed line-clamp-4">{a.descricao}</p>

              <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {a.dataPostada ? new Date(a.dataPostada).toLocaleDateString("pt-BR") : "Recente"}
                </span>
                <div className="flex items-center gap-2">
                  {a.fonteUrl && (
                    <a href={a.fonteUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:underline">
                      Fonte <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${arquivada(a) ? "bg-slate-100 text-slate-500 border-slate-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                    {arquivada(a) ? "Arquivada" : "No app"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {visiveis.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400 font-medium italic bg-white border rounded-xl shadow-sm">
            Nenhuma notícia com esses filtros.
          </div>
        )}
      </div>

      <Dialog open={openEdicao} onOpenChange={setOpenEdicao}>
        {/* 🟢 ADICIONADO: aria-describedby={undefined} */}
        <DialogContent aria-describedby={undefined} className="sm:max-w-[550px] p-6 bg-white rounded-xl">
          <DialogTitle className="text-xl font-black text-slate-900 border-b pb-3">Editar Notícia</DialogTitle>
          {alertaEditando && (
            <form onSubmit={handleUpdate} className="space-y-4 pt-4">
              <div className="grid gap-1.5">
                <Label className="font-bold text-slate-700">Título da Notícia</Label>
                <Input name="titulo" defaultValue={alertaEditando.titulo} required />
              </div>
              <div className="grid gap-1.5">
                <Label className="font-bold text-slate-700">Texto da notícia</Label>
                <textarea name="descricao" defaultValue={alertaEditando.descricao} required rows={3} className="w-full border rounded-md p-2.5 text-sm border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 font-medium" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <Label className="font-bold text-slate-700">Categoria</Label>
                  <select name="categoria" defaultValue={alertaEditando.categoria} className="h-10 w-full border rounded-md px-3 bg-white text-sm font-semibold border-slate-200">
                    <option value="Informativo">Informativo</option>
                    <option value="Vacinação">Vacinação</option>
                    <option value="Prevenção">Prevenção</option>
                    <option value="Serviços de Saúde">Serviços de Saúde</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="font-bold text-slate-700">Abrangência (cidade, "Estado de SP" ou "Brasil")</Label>
                  <Input name="localizacao" defaultValue={alertaEditando.localizacao} required />
                </div>
              </div>
                <ImagemUpload defaultValue={alertaEditando.linkimagem} />
              <Button type="submit" className="w-full bg-blue-500 hover:bg-blue-600 font-bold text-white h-11 shadow mt-4">
                Salvar alterações
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}