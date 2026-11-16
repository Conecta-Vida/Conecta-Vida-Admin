import { useEffect, useState } from "react";
import { Users, AlertTriangle, Megaphone, Newspaper, Activity, Loader2, HeartHandshake, ClipboardCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { dashboardService, logService, usoService, type DashboardStats, type ChartData, type LogAtividade, type UsoDoApp } from "../services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * COMPONENTE: Index (Dashboard)
 * 🟢 MANTIDO: Toda a estrutura visual, cards superiores e listagem criados pelo grupo.
 * 🛠️ CORREÇÃO: Ajustada a fórmula de altura inline do gráfico para usar porcentagem limpa (0% a 100%).
 * Isso faz as barras refletirem o crescimento real sem achatamentos artificiais na tela.
 */
export default function Index() {
  const [stats, setStats] = useState<DashboardStats>({ totalUsuarios: 0, alertasAtivos: 0, campanhasAtivas: 0, noticiasPublicadas: 0 });
  const [grafico, setGrafico] = useState<ChartData[]>([]);
  const [logs, setLogs] = useState<LogAtividade[]>([]);
  const [uso, setUso] = useState<UsoDoApp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const carregarDashboard = async () => {
      try {
        const [dadosStats, dadosGrafico, dadosLogs, dadosUso] = await Promise.all([
          dashboardService.getStats(),
          dashboardService.getChartData(),
          logService.listarRecentes(),
          usoService.carregar().catch(() => null),
        ]);
        setUso(dadosUso);

        if (dadosStats) setStats(dadosStats);
        if (dadosGrafico) setGrafico(dadosGrafico);
        if (dadosLogs) setLogs(dadosLogs);
      } catch (error) {
        console.error("Erro ao carregar os dados do painel:", error);
      } finally {
        setLoading(false);
      }
    };

    carregarDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex h-[70vh] w-full items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">Indicadores consolidados em tempo real do ecossistema Conecta à Vida.</p>
      </div>

      {/* BLOCOS SUPERIORES */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">Usuários Cadastrados</CardTitle>
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><Users className="w-4 h-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">{stats.totalUsuarios}</div>
            <p className="text-xs text-blue-600 font-medium mt-1">Cidadãos integrados na base</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">Alertas Ativos</CardTitle>
            <div className="p-2 bg-red-50 rounded-lg text-red-600"><AlertTriangle className="w-4 h-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">{stats.alertasAtivos}</div>
            <p className="text-xs text-red-600 font-medium mt-1">Avisos urgentes em aberto</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">Campanhas Ativas</CardTitle>
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><Megaphone className="w-4 h-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">{stats.campanhasAtivas}</div>
            <p className="text-xs text-emerald-600 font-medium mt-1">Mutirões públicos em andamento</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">Notícias Publicadas</CardTitle>
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600"><Newspaper className="w-4 h-4" /></div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">{stats.noticiasPublicadas}</div>
            <p className="text-xs text-amber-600 font-medium mt-1">Informativos ativos no feed</p>
          </CardContent>
        </Card>
      </div>

      {/* SEÇÃO INFERIOR: GRÁFICO DE BARRAS PROPORCIONAL E TIMELINE */}
      <div className="grid gap-6 md:grid-cols-7">
        <Card className="md:col-span-4 border-none shadow-sm bg-white">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-800">Publicações por mês</CardTitle>
            <p className="text-xs text-slate-400">Notícias, campanhas e alertas publicados nos últimos 6 meses</p>
          </CardHeader>
          <CardContent className="h-[240px] flex items-end justify-between gap-2 pt-4 px-4">
            {grafico.map((item, index) => {
              // Altura proporcional ao mês com mais publicações.
              const maior = Math.max(...grafico.map((g) => g.quantidade), 1);
              const percentualAltura = (item.quantidade / maior) * 100;

              return (
                <div key={index} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                  <div 
                    className="w-full bg-blue-600/90 rounded-t-md group-hover:bg-blue-600 transition-all duration-300 relative min-h-[4px]"
                    style={{ height: `${percentualAltura}%` }}
                  >
                    <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                      {item.quantidade} publicações
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-slate-400 uppercase mt-1">{item.mes}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* TIMELINE DE AUDITORIA */}
        <Card className="md:col-span-3 border-none shadow-sm bg-white">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-800">Atividade Recente</CardTitle>
              <p className="text-xs text-slate-400">Trilha de auditoria em tempo real</p>
            </div>
            <Activity className="w-4 h-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-[240px] overflow-y-auto pr-1">
              {logs.map((log) => (
                <div key={log.id} className="flex items-start gap-3 border-b border-slate-50 pb-3 last:border-none last:pb-0">
                  <div className="w-2 h-2 rounded-full bg-blue-600 mt-2 shrink-0" />
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-800">{log.usuario?.nome || "Sistema"}</p>
                    <p className="text-xs text-slate-500 leading-tight">{log.acao}</p>
                    <p className="text-[10px] text-slate-400">{new Date(log.dataHora).toLocaleString()}</p>
                  </div>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-center py-12 text-sm text-slate-400 italic">Sem atividades recentes gravadas.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* USO DO APLICATIVO: o que os cidadãos fazem de fato */}
      {uso && (
        <div className="grid gap-6 md:grid-cols-7">
          <Card className="md:col-span-4 border-none shadow-sm bg-white">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-800">Campanhas mais procuradas</CardTitle>
                <p className="text-xs text-slate-400">Pessoas inscritas pelo aplicativo (titulares e dependentes)</p>
              </div>
              <ClipboardCheck className="w-4 h-4 text-slate-400" />
            </CardHeader>
            <CardContent className="space-y-3">
              {uso.campanhasMaisProcuradas.length === 0 && (
                <p className="py-8 text-center text-sm italic text-slate-400">Nenhuma inscrição ainda.</p>
              )}
              {uso.campanhasMaisProcuradas.map((c) => {
                const maior = uso.campanhasMaisProcuradas[0]?.total || 1;
                return (
                  <Link key={c.id} to={`/campanhas/${c.id}`} className="block group">
                    <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                      <span className="truncate pr-3 group-hover:text-blue-700">{c.titulo}</span>
                      <span className="shrink-0 text-slate-500">{c.total}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${(c.total / maior) * 100}%` }} />
                    </div>
                  </Link>
                );
              })}
            </CardContent>
          </Card>

          <Card className="md:col-span-3 border-none shadow-sm bg-white">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-800">Famílias no app</CardTitle>
                <p className="text-xs text-slate-400">Dependentes e inscrições feitas por responsáveis</p>
              </div>
              <HeartHandshake className="w-4 h-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-violet-50 p-3">
                  <p className="text-2xl font-black text-violet-700">{uso.dependentesAtivos}</p>
                  <p className="text-xs font-medium text-violet-700/80">dependentes ativos</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3">
                  <p className="text-2xl font-black text-amber-700">{uso.dependentesPendentes}</p>
                  <p className="text-xs font-medium text-amber-700/80">aguardando autorização</p>
                </div>
                <div className="col-span-2 rounded-xl bg-slate-50 p-3">
                  <p className="text-2xl font-black text-slate-800">
                    {uso.inscricoesDeDependentes} <span className="text-sm font-semibold text-slate-400">de {uso.totalInscricoes}</span>
                  </p>
                  <p className="text-xs font-medium text-slate-500">inscrições feitas para dependentes</p>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Inscrições por mês</p>
                <div className="flex h-20 items-end gap-2">
                  {uso.inscricoesPorMes.map((m) => {
                    const maior = Math.max(...uso.inscricoesPorMes.map((x) => x.quantidade), 1);
                    return (
                      <div key={m.mes} className="flex flex-1 flex-col items-center gap-1 h-full justify-end" title={`${m.quantidade} inscrição(ões)`}>
                        <div className="w-full rounded-t bg-emerald-500/80 min-h-[3px]" style={{ height: `${(m.quantidade / maior) * 100}%` }} />
                        <span className="text-[10px] font-semibold text-slate-400 uppercase">{m.mes}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}