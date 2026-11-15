import { useEffect, useState } from "react";
import { CheckCircle2, HeartPulse, Loader2, MailWarning } from "lucide-react";
import { supabase } from "../services/supabase";

type Etapa = "verificando" | "confirmado" | "link-invalido";

/**
 * Página aberta pelo link do e-mail de confirmação de cadastro.
 * O Supabase valida o link antes de redirecionar para cá; aqui só
 * mostramos o resultado e orientamos a voltar ao aplicativo.
 */
export default function EmailConfirmado() {
  const [etapa, setEtapa] = useState<Etapa>("verificando");

  useEffect(() => {
    const endereco = window.location.hash + window.location.search;
    if (endereco.includes("error")) {
      setEtapa("link-invalido");
      return;
    }

    // O link cria uma sessão neste navegador. Ela não é necessária aqui
    // (a pessoa vai entrar pelo aplicativo), então é encerrada em seguida.
    let cancelado = false;
    const concluir = async () => {
      await supabase.auth.getSession();
      await supabase.auth.signOut();
      if (!cancelado) setEtapa("confirmado");
    };
    const espera = window.setTimeout(concluir, 800);
    return () => {
      cancelado = true;
      window.clearTimeout(espera);
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <div className="flex flex-col items-center space-y-2">
          <div className="rounded-2xl bg-blue-600 p-3 text-white shadow-md shadow-blue-200">
            <HeartPulse className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Conecta Vida</h1>
        </div>

        {etapa === "verificando" && (
          <div className="flex flex-col items-center gap-3 py-4 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium">Confirmando seu e-mail...</p>
          </div>
        )}

        {etapa === "confirmado" && (
          <div className="space-y-3">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <p className="text-lg font-bold text-slate-800">E-mail confirmado!</p>
            <p className="text-sm text-slate-500">
              Sua conta está pronta. Volte ao aplicativo Conecta Vida e entre com seu e-mail e senha.
            </p>
          </div>
        )}

        {etapa === "link-invalido" && (
          <div className="space-y-3">
            <MailWarning className="mx-auto h-12 w-12 text-amber-500" />
            <p className="text-lg font-bold text-slate-800">Este link expirou ou já foi usado.</p>
            <p className="text-sm text-slate-500">
              Se você já confirmou, é só entrar no aplicativo. Caso contrário, tente entrar e toque em
              "Reenviar o e-mail" para receber um link novo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
