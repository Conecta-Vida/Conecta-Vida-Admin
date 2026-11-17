import { useState } from "react";
import { CheckCircle2, HeartPulse, Loader2, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "../services/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Página pública para excluir a conta do app sem abrir o aplicativo
 * (exigência da Play Store). A pessoa confirma com e-mail e senha.
 */
export default function ExcluirConta() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmo, setConfirmo] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [concluido, setConcluido] = useState(false);

  const excluir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmo) return toast.warning("Marque a confirmação para continuar.");
    setExcluindo(true);
    try {
      const { error: erroLogin } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
      if (erroLogin) throw new Error("E-mail ou senha incorretos.");
      const { error } = await supabase.rpc("excluir_minha_conta");
      if (error) throw new Error("Não foi possível excluir a conta. Tente novamente.");
      await supabase.auth.signOut();
      setConcluido(true);
    } catch (erro) {
      toast.error((erro as Error).message);
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><HeartPulse className="h-5 w-5" /></div>
          <span className="text-sm font-bold uppercase tracking-wider text-blue-600">Conecta Vida</span>
        </div>

        {concluido ? (
          <div className="space-y-3 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h1 className="text-2xl font-black text-slate-900">Conta excluída</h1>
            <p className="text-slate-600">Seu perfil, inscrições e dependentes foram apagados.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-slate-900">Excluir minha conta</h1>
              <p className="text-[15px] leading-relaxed text-slate-600">
                Isso apaga permanentemente sua conta do Conecta Vida, com seu perfil, suas inscrições em campanhas e seus
                dependentes. Também é possível excluir pelo app, em <strong>Ajustes → Deletar</strong>.
              </p>
            </div>
            <form onSubmit={excluir} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail da conta</Label>
                <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="senha">Senha</Label>
                <Input id="senha" type="password" required autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input type="checkbox" className="mt-1" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} />
                Entendo que a exclusão é definitiva e não pode ser desfeita.
              </label>
              <Button type="submit" disabled={excluindo} className="w-full bg-red-600 hover:bg-red-700">
                {excluindo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Excluir conta definitivamente
              </Button>
            </form>
            <p className="text-center text-sm text-slate-500">
              Esqueceu a senha? Use "Esqueci senha" no app. Veja também a{" "}
              <Link to="/privacidade" className="font-semibold text-blue-600 underline">Política de Privacidade</Link>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
