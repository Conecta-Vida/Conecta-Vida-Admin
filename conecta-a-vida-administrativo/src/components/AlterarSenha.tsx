import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authService } from "../services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

/** Troca a senha de quem está logado, sem depender do e-mail de recuperação. */
export function AlterarSenha() {
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const fechar = (valor: boolean) => {
    setAberto(valor);
    if (!valor) { setSenha(""); setConfirmacao(""); }
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.length < 6) return toast.warning("A senha precisa ter pelo menos 6 caracteres.");
    if (senha !== confirmacao) return toast.warning("As senhas digitadas não são iguais.");
    setSalvando(true);
    try {
      await authService.definirNovaSenha(senha);
      toast.success("Senha alterada. Use a nova senha no próximo login.");
      fechar(false);
    } catch (erro: any) {
      const msg = String(erro?.message ?? "");
      toast.error(
        /different from the old/i.test(msg) ? "A nova senha precisa ser diferente da atual."
          : /weak|characters/i.test(msg) ? "Senha fraca. Use pelo menos 6 caracteres."
          : msg || "Não foi possível alterar a senha.",
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogTrigger asChild>
        <button className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50">
          <KeyRound className="h-4 w-4 shrink-0 text-slate-400" />
          Alterar minha senha
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar minha senha</DialogTitle>
          <DialogDescription>A nova senha vale para o painel e para o aplicativo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nova-senha">Nova senha</Label>
            <Input id="nova-senha" type="password" autoComplete="new-password" value={senha}
              onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo de 6 caracteres" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmar-senha">Confirme a nova senha</Label>
            <Input id="confirmar-senha" type="password" autoComplete="new-password" value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => fechar(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvando}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar nova senha
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
