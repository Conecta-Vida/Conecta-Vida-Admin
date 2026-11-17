import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { imagemService } from "../services/api";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Props = {
  /** Nome do campo no formulário (o valor enviado é o endereço da imagem). */
  name?: string;
  /** Imagem já cadastrada, ao editar. */
  defaultValue?: string;
  label?: string;
};

/**
 * Campo de imagem de capa: o arquivo é enviado para o Supabase Storage e o
 * formulário recebe o endereço público, gravado em `linkimagem`.
 * Assim a imagem sempre aparece no aplicativo (links de outros sites podem
 * ser bloqueados pelo navegador).
 */
export default function ImagemUpload({ name = "linkimagem", defaultValue = "", label = "Imagem de capa (opcional)" }: Props) {
  const [url, setUrl] = useState(defaultValue);
  const [enviando, setEnviando] = useState(false);
  const seletor = useRef<HTMLInputElement>(null);

  const handleArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = ""; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return;

    setEnviando(true);
    try {
      setUrl(await imagemService.enviar(arquivo));
    } catch (erro) {
      toast.error((erro as Error).message || "Não foi possível enviar a imagem.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid gap-1.5">
      <Label className="font-bold text-slate-700">{label}</Label>
      <input type="hidden" name={name} value={url} />
      <input ref={seletor} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleArquivo} />

      <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50/60 p-2">
        <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100 text-slate-400">
          {url ? <img src={url} alt="Imagem de capa" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6" />}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={enviando}
            onClick={() => seletor.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4 text-blue-600" />}
            {enviando ? "Enviando..." : url ? "Trocar imagem" : "Enviar imagem"}
          </button>
          {url && !enviando && (
            <button
              type="button"
              onClick={() => setUrl("")}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" /> Remover
            </button>
          )}
          <span className="basis-full text-xs text-slate-400">PNG, JPG, WebP ou GIF, até 5 MB.</span>
        </div>
      </div>
    </div>
  );
}
