import { Download, Globe, HeartPulse, Smartphone } from "lucide-react";
import { Link } from "react-router-dom";
import { SUPABASE_URL } from "../services/supabase";

const APK = `${SUPABASE_URL}/storage/v1/object/public/downloads/conecta-vida.apk`;
const APK_ANTIGO = `${SUPABASE_URL}/storage/v1/object/public/downloads/conecta-vida-celular-antigo.apk`;
const APP_WEB = "https://conecta-vida-app.netlify.app";

/** Página pública para instalar o app no celular (Android ou pelo navegador). */
export default function Baixar() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white"><HeartPulse className="h-6 w-6" /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Conecta Vida</h1>
            <p className="text-sm text-slate-500">Notícias, campanhas e alertas de saúde</p>
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 font-bold text-slate-900"><Smartphone className="h-4 w-4 text-blue-600" /> Android</h2>
          <a href={APK} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700">
            <Download className="h-5 w-5" /> Baixar o app (APK)
          </a>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Toque em "Baixar" e abra o arquivo quando terminar.</li>
            <li>Se o Android pedir, permita "Instalar apps desta fonte" para o navegador.</li>
            <li>Toque em "Instalar". Pronto!</li>
          </ol>
          <p className="text-xs text-slate-400">
            Celular muito antigo (32 bits) e o app não instala? Use a <a className="underline" href={APK_ANTIGO}>versão compatível</a>.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="flex items-center gap-2 font-bold text-slate-900"><Globe className="h-4 w-4 text-blue-600" /> iPhone ou qualquer celular</h2>
          <p className="text-sm text-slate-600">
            Abra <a className="font-semibold text-blue-600 underline" href={APP_WEB}>conecta-vida-app.netlify.app</a> no navegador e use
            "Adicionar à tela de início" (Safari: botão Compartilhar; Chrome: menu ⋮). O app fica com ícone, como um aplicativo instalado.
          </p>
        </section>

        <p className="text-center text-xs text-slate-400">
          <Link to="/privacidade" className="underline">Política de Privacidade</Link> · <Link to="/excluir-conta" className="underline">Excluir conta</Link>
        </p>
      </div>
    </div>
  );
}
