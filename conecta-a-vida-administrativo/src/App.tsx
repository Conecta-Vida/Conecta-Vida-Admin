import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner"; 
import AppLayout from "./components/AppLayout";
import { Loader2 } from "lucide-react";
import { authService, CHAVE_SESSAO } from "./services/api";

// OTIMIZAÇÃO: Lazy Loading das Páginas Ativas do Painel
const Index = lazy(() => import("./pages/Index"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const Campanhas = lazy(() => import("./pages/Campanhas"));
const CampanhaDetalhes = lazy(() => import("./pages/CampanhaDetalhes"));
const Alertas = lazy(() => import("./pages/Alertas"));
const Noticias = lazy(() => import("./pages/Noticias"));
const Login = lazy(() => import("./pages/Login"));
const RedefinirSenha = lazy(() => import("./pages/RedefinirSenha"));
const Instituicoes = lazy(() => import("./pages/Instituicoes"));

// Componente visual de carregamento
const TelaCarregamento = () => (
  <div className="flex h-[70vh] w-full items-center justify-center">
    <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
  </div>
);

// BARREIRA DE SEGURANÇA: só entra quem tem sessão válida no Supabase.
// (As regras do banco ainda conferem a permissão em cada operação.)
const RotaProtegida = () => {
  const [estado, setEstado] = useState<"verificando" | "ok" | "negado">(
    localStorage.getItem(CHAVE_SESSAO) ? "verificando" : "negado",
  );

  useEffect(() => {
    if (estado !== "verificando") return;
    authService.temSessao().then((valida) => {
      if (!valida) localStorage.removeItem(CHAVE_SESSAO);
      setEstado(valida ? "ok" : "negado");
    });
  }, [estado]);

  if (estado === "verificando") return <TelaCarregamento />;
  if (estado === "negado") return <Navigate to="/login" replace />;
  return <Outlet />;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ROTA PÚBLICA */}
        <Route path="/login" element={<Suspense fallback={<TelaCarregamento />}><Login /></Suspense>} />
        {/* Aberta pelo link do e-mail de recuperação (app e painel) */}
        <Route path="/redefinir-senha" element={<Suspense fallback={<TelaCarregamento />}><RedefinirSenha /></Suspense>} />

        {/* ROTAS PRIVADAS */}
        <Route element={<RotaProtegida />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Suspense fallback={<TelaCarregamento />}><Index /></Suspense>} />
            <Route path="/usuarios" element={<Suspense fallback={<TelaCarregamento />}><Usuarios /></Suspense>} /> 
            <Route path="/instituicoes" element={<Suspense fallback={<TelaCarregamento />}><Instituicoes /></Suspense>} />
            <Route path="/campanhas" element={<Suspense fallback={<TelaCarregamento />}><Campanhas /></Suspense>} />
            <Route path="/campanhas/:id" element={<Suspense fallback={<TelaCarregamento />}><CampanhaDetalhes /></Suspense>} />
            <Route path="/alertas" element={<Suspense fallback={<TelaCarregamento />}><Alertas /></Suspense>} />
            <Route path="/noticias" element={<Suspense fallback={<TelaCarregamento />}><Noticias /></Suspense>} />
          </Route>
        </Route>

        {/* CAPTURA GLOBAL */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-right" richColors /> 
    </BrowserRouter>
  );
}

export default App;