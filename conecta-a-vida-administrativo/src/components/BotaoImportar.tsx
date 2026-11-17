import { useState } from "react";
import { CloudDownload, Loader2 } from "lucide-react";
import { importacaoService } from "../services/api";
import { toast } from "sonner";

type Props = {
  alvo: "noticias" | "unidades";
  rotulo: string;
  /** Chamado depois de uma importação bem-sucedida (para recarregar a lista). */
  aoConcluir?: () => void;
};

/**
 * Busca dados reais na fonte oficial agora, sem esperar o agendamento:
 * notícias do Ministério da Saúde ou unidades de saúde do CNES.
 */
export default function BotaoImportar({ alvo, rotulo, aoConcluir }: Props) {
  const [importando, setImportando] = useState(false);

  const handleImportar = async () => {
    setImportando(true);
    try {
      toast.success(await importacaoService.importar(alvo));
      aoConcluir?.();
    } catch (erro) {
      toast.error((erro as Error).message || "Não foi possível importar os dados.");
    } finally {
      setImportando(false);
    }
  };

  return (
    <button
      type="button"
      disabled={importando}
      onClick={handleImportar}
      className="inline-flex h-10 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
    >
      {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4 text-emerald-600" />}
      {importando ? "Importando..." : rotulo}
    </button>
  );
}
