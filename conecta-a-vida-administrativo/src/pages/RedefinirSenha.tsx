import { useEffect, useState } from "react";
import { CheckCircle2, HeartPulse, KeyRound, Loader2, Lock } from "lucide-react";
import { supabase } from "../services/supabase";
import { authService } from "../services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Etapa = "verificando" | "formulario" | "link-invalido" | "concluido";

/**
 * Página aberta pelo link do e-mail "esqueci minha senha".
 * Serve tanto para cidadãos do aplicativo quanto para administradores:
 * o Supabase valida o link, cria uma sessão temporária e aqui a pessoa
 * define a nova senha.
 */
export default function RedefinirSenha() {
  const [etapa, setEtapa] = useState<Etapa>("verificando");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    // O link traz "#error=..." quando expirou ou já foi usado.
    if (window.location.hash.includes("error")) {
      setEtapa("link-invalido");
      return;
    }

    const { data: assinatura } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (evento === "PASSWORD_RECOVERY" || (evento === "SIGNED_IN" && sessao)) {
        setEtapa("formulario");
      }
    });

    // Se o Supabase já processou o link antes deste componente montar.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setEtapa("formulario");
    });

    // Sem sessão depois de alguns segundos: o link não é válido.
    const limite = window.setTimeout(() => {
      setEtapa((atual) => (atual === "verificando" ? "link-invalido" : atual));
    }, 6000);

    return () => {
      assinatura.subscription.unsubscribe();
      window.clearTimeout(limite);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha.length < 6) {
      toast.warning("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (senha !== confirmacao) {
      toast.warning("As senhas digitadas não são iguais.");
      return;
    }

    setSalvando(true);
    try {
      await authService.definirNovaSenha(senha);
      // Encerra a sessão temporária: a pessoa entra de novo com a senha nova.
      await authService.logout();
      setEtapa("concluido");
    } catch (error: any) {
      toast.error(error.message || "Não foi possível salvar a nova senha.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="rounded-2xl bg-blue-600 p-3 text-white shadow-md shadow-blue-200">
            <HeartPulse className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Conecta à Vida</h1>
          <p className="text-sm text-slate-500 font-medium">Criar nova senha</p>
        </div>

        {etapa === "verificando" && (
          <div className="flex flex-col items-center gap-3 py-6 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium">Validando o link de recuperação...</p>
          </div>
        )}

        {etapa === "link-invalido" && (
          <div className="space-y-3 text-center">
            <KeyRound className="mx-auto h-10 w-10 text-amber-500" />
            <p className="font-bold text-slate-800">Este link expirou ou já foi usado.</p>
            <p className="text-sm text-slate-500">
              Peça um novo link em "Esqueci senha", no aplicativo ou no painel, e abra o e-mail mais recente.
            </p>
          </div>
        )}

        {etapa === "concluido" && (
          <div className="space-y-3 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="font-bold text-slate-800">Senha alterada com sucesso!</p>
            <p className="text-sm text-slate-500">
              Volte ao aplicativo Conecta Vida (ou ao painel) e entre com a nova senha.
            </p>
          </div>
        )}

        {etapa === "formulario" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">Nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Pelo menos 6 caracteres"
                  className="pl-10 bg-slate-50/50 focus-visible:ring-blue-600"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700">Repita a nova senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className="pl-10 bg-slate-50/50 focus-visible:ring-blue-600"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={salvando}
              className="w-full bg-blue-600 font-bold h-11 text-white hover:bg-blue-700 shadow shadow-blue-100"
            >
              {salvando ? (
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</span>
              ) : (
                "Salvar nova senha"
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
