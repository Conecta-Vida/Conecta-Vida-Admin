// Edge Function "unidades-proximas": unidades de saúde do SUS da cidade de quem
// usa o app, em qualquer município do Brasil.
//
// Recebe { cidade, uf? } (o app descobre pela localização ou pelo perfil).
//   1. Acha o município no cadastro do IBGE (guardado na tabela municipios_ibge).
//   2. Se as unidades dessa cidade nunca foram buscadas, ou a busca tem mais de
//      30 dias, consulta o CNES (dados abertos do Ministério da Saúde) e grava.
//   3. Devolve as unidades da cidade, com coordenadas para calcular a distância.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

const NAVEGADOR = { "User-Agent": "Mozilla/5.0 (compatible; ConectaVida/1.0)" };
const VALIDADE_DIAS = 30;
const COLUNAS = "id, tipo_instituicao, nome, telefone, endereco, horario_seg_sex, horario_sabado, horario_domingo, latitude, longitude";

const semAcento = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const cortar = (t: string, max: number) => (t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…");

const SIGLAS = new Set(["ESF", "UBS", "UPA", "CAPS", "SAMU", "AD", "USF", "SUS", "AMA", "I", "II", "III", "IV", "S/N", "SP", "UBSF", "PSF"]);
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "a", "em", "na", "no"]);
const capitalizar = (texto: string) =>
  texto.trim().replace(/\s+/g, " ").split(" ").map((p, i) => {
    const M = p.toUpperCase();
    if (SIGLAS.has(M)) return M;
    const m = p.toLowerCase();
    if (i > 0 && MINUSCULAS.has(m)) return m;
    return m.charAt(0).toUpperCase() + m.slice(1);
  }).join(" ");

// ------------------------------------------------------------ municípios
async function carregarMunicipios(db: SupabaseClient) {
  const { count } = await db.from("municipios_ibge").select("codigo", { count: "exact", head: true });
  if ((count ?? 0) > 5000) return;
  const r = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado", { headers: NAVEGADOR });
  if (!r.ok) throw new Error(`IBGE: HTTP ${r.status}`);
  const lista = await r.json() as Record<string, unknown>[];
  const linhas = lista.map((m) => ({
    codigo: Number(m["municipio-id"]),
    nome: String(m["municipio-nome"]),
    nome_busca: semAcento(String(m["municipio-nome"])),
    uf: String(m["UF-sigla"]),
  }));
  for (let i = 0; i < linhas.length; i += 1000) {
    const { error } = await db.from("municipios_ibge").upsert(linhas.slice(i, i + 1000), { onConflict: "codigo", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
}

async function acharMunicipio(db: SupabaseClient, cidade: string, uf: string | null) {
  await carregarMunicipios(db);
  let consulta = db.from("municipios_ibge").select("codigo, nome, uf, unidades_atualizadas_em").eq("nome_busca", semAcento(cidade));
  if (uf) consulta = consulta.eq("uf", uf.toUpperCase());
  const { data } = await consulta.limit(5);
  if (!data || data.length === 0) return null;
  // Mesmo nome em mais de um estado e sem UF: prefere SP (origem do projeto).
  return data.find((m) => m.uf === "SP") ?? data[0];
}

// ------------------------------------------------------------------ CNES
const TIPOS_CNES: Record<number, string> = { 2: "UBS", 5: "Hospital", 20: "UPA", 73: "UPA", 70: "CAPS", 76: "SAMU" };

function telefone(bruto: string | null): string {
  const d = (bruto ?? "").replace(/\D/g, "");
  const ddd = d.length > 9 ? d.slice(0, 2) : "";
  const n = d.length > 9 ? d.slice(2) : d;
  const pre = ddd ? `(${ddd}) ` : "";
  if (n.length === 8) return `${pre}${n.slice(0, 4)}-${n.slice(4)}`;
  if (n.length === 9) return `${pre}${n.slice(0, 5)}-${n.slice(5)}`;
  return "Não informado";
}

function horario(turno: string | null) {
  const t = (turno ?? "").toUpperCase();
  if (t.includes("24 HORAS")) return { horario_seg_sex: "24 horas", horario_sabado: "24 horas", horario_domingo: "24 horas" };
  if (t.includes("NOITE")) return { horario_seg_sex: "Manhã, tarde e noite" };
  if (t.includes("MANHA")) return { horario_seg_sex: "Manhã e tarde" };
  return {};
}

async function buscarTipo(codigo6: string, tipo: string) {
  const achados: Record<string, any>[] = [];
  for (let pagina = 0; pagina < 30; pagina++) {
    const url = `https://apidadosabertos.saude.gov.br/cnes/estabelecimentos?codigo_municipio=${codigo6}&codigo_tipo_unidade=${tipo}&limit=20&offset=${pagina}`;
    const r = await fetch(url, { headers: NAVEGADOR, signal: AbortSignal.timeout(20000) });
    if (!r.ok) break;
    const lista = (await r.json()).estabelecimentos ?? [];
    achados.push(...lista);
    if (lista.length < 20) break;
  }
  return achados;
}

async function importarDoCnes(db: SupabaseClient, municipio: { codigo: number; nome: string; uf: string }) {
  const codigo6 = String(municipio.codigo).slice(0, 6);
  const porTipo = await Promise.all(Object.keys(TIPOS_CNES).map((t) => buscarTipo(codigo6, t).catch(() => [])));
  const unicos = new Map<number, Record<string, any>>();
  for (const e of porTipo.flat()) unicos.set(e.codigo_cnes, e);

  const linhas = [...unicos.values()]
    .filter((e) => !e.codigo_motivo_desabilitacao_estabelecimento &&
      (e.estabelecimento_faz_atendimento_ambulatorial_sus === "SIM" || e.codigo_tipo_unidade === 76))
    .map((e) => {
      const numero = String(e.numero_estabelecimento ?? "").trim();
      const endereco = [
        capitalizar(e.endereco_estabelecimento ?? "") + (numero && numero.toUpperCase() !== "S/N" ? `, ${numero}` : ""),
        capitalizar(e.bairro_estabelecimento ?? ""),
        `${municipio.nome} - ${municipio.uf}`,
      ].filter(Boolean).join(" - ");
      return {
        nome: cortar(capitalizar(e.nome_fantasia || e.nome_razao_social || "Unidade de saúde"), 150),
        tipo_instituicao: TIPOS_CNES[e.codigo_tipo_unidade as number],
        telefone: telefone(e.numero_telefone_estabelecimento),
        endereco: cortar(endereco, 255),
        codigo_cnes: e.codigo_cnes,
        codigo_municipio: municipio.codigo,
        latitude: typeof e.latitude_estabelecimento_decimo_grau === "number" ? e.latitude_estabelecimento_decimo_grau : null,
        longitude: typeof e.longitude_estabelecimento_decimo_grau === "number" ? e.longitude_estabelecimento_decimo_grau : null,
        horario_seg_sex: null as string | null, horario_sabado: null as string | null, horario_domingo: null as string | null,
        ...horario(e.descricao_turno_atendimento),
      };
    });

  for (let i = 0; i < linhas.length; i += 200) {
    const { error } = await db.from("instituicoes_saude").upsert(linhas.slice(i, i + 200), { onConflict: "codigo_cnes" });
    if (error) throw new Error(error.message);
  }
  await db.from("municipios_ibge").update({ unidades_atualizadas_em: new Date().toISOString() }).eq("codigo", municipio.codigo);
  return linhas.length;
}

// --------------------------------------------------------------- entrada
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder(405, { mensagem: "Método não permitido." });

  let cidade = "", uf: string | null = null;
  try {
    const corpo = await req.json();
    cidade = String(corpo.cidade ?? "").trim();
    uf = corpo.uf ? String(corpo.uf).trim().slice(0, 2) : null;
  } catch { /* corpo inválido */ }
  if (!cidade) return responder(400, { mensagem: "Informe a cidade." });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const municipio = await acharMunicipio(db, cidade, uf);
    if (!municipio) return responder(404, { mensagem: `Cidade "${cidade}" não encontrada.` });

    const atualizado = municipio.unidades_atualizadas_em ? new Date(municipio.unidades_atualizadas_em).getTime() : 0;
    if (Date.now() - atualizado > VALIDADE_DIAS * 86400_000) {
      await importarDoCnes(db, municipio);
    }

    const { data, error } = await db.from("instituicoes_saude").select(COLUNAS)
      .eq("codigo_municipio", municipio.codigo).not("codigo_cnes", "is", null).order("nome");
    if (error) throw new Error(error.message);
    return responder(200, { municipio: { codigo: municipio.codigo, nome: municipio.nome, uf: municipio.uf }, unidades: data ?? [] });
  } catch (e) {
    return responder(500, { mensagem: (e as Error).message });
  }
});
