// Edge Function "importar-dados": traz dados REAIS de fontes oficiais.
//
//   alvo "noticias": notícias do Ministério da Saúde (feed do gov.br),
//                    publicadas no app como NOTICIA com o link da fonte.
//   alvo "unidades": unidades de saúde de Bragança Paulista no CNES
//                    (dados abertos do Ministério da Saúde).
//
// Nada é apagado: só entram registros novos (ou dados reais de uma unidade
// que já existia com o mesmo nome). É chamada pelo agendador do banco
// (cabeçalho x-import-secret) ou por um administrador logado no painel.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-import-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

const NAVEGADOR = { "User-Agent": "Mozilla/5.0 (compatible; ConectaVida/1.0)" };
const MUNICIPIO_IBGE = "350760"; // Bragança Paulista - SP
const CIDADE = "Bragança Paulista";

// ---------------------------------------------------------------- texto
const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decodificar = (texto: string) =>
  texto
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, nome) => ENTIDADES[nome.toLowerCase()] ?? m)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

const cortar = (texto: string, max: number) => (texto.length <= max ? texto : texto.slice(0, max - 1).trimEnd() + "…");

const SIGLAS = new Set(["ESF", "UBS", "UPA", "CAPS", "SAMU", "AD", "CDHU", "SUS", "I", "II", "III", "IV", "S/N", "SP"]);
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "a", "em", "na", "no"]);
/** "ESF AGUA COMPRIDA" -> "ESF Agua Comprida" (o CNES grava tudo em maiúsculas). */
const capitalizar = (texto: string) =>
  texto.trim().replace(/\s+/g, " ").split(" ").map((palavra, i) => {
    const maiuscula = palavra.toUpperCase();
    if (SIGLAS.has(maiuscula)) return maiuscula;
    const minuscula = palavra.toLowerCase();
    if (i > 0 && MINUSCULAS.has(minuscula)) return minuscula;
    return minuscula.charAt(0).toUpperCase() + minuscula.slice(1);
  }).join(" ");

const semAcento = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// ------------------------------------------------------------- notícias
const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

async function importarNoticias(db: SupabaseClient) {
  // Mês atual e anterior (no começo do mês o feed atual ainda está vazio).
  const agora = new Date();
  const feeds = [0, 1].map((atras) => {
    const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - atras, 1));
    return `https://www.gov.br/saude/pt-br/assuntos/noticias/${d.getUTCFullYear()}/${MESES[d.getUTCMonth()]}/RSS`;
  });

  const encontradas: { titulo: string; resumo: string; url: string; data: string }[] = [];
  const falhas: string[] = [];
  for (const feed of feeds) {
    try {
      const resposta = await fetch(feed, { headers: NAVEGADOR });
      if (!resposta.ok) { falhas.push(`${feed}: HTTP ${resposta.status}`); continue; }
      const xml = await resposta.text();
      for (const [, url, corpo] of xml.matchAll(/<item rdf:about="([^"]+)">(.*?)<\/item>/gs)) {
        const campo = (tag: string) => decodificar(corpo.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "s"))?.[1] ?? "");
        // Só matérias; o feed também lista pastas.
        if (campo("dc:type") !== "collective.nitf.content") continue;
        const titulo = campo("title");
        if (!titulo || !url.startsWith("https://www.gov.br/")) continue;
        encontradas.push({ titulo, resumo: campo("description"), url, data: campo("dc:date") });
      }
    } catch (e) {
      falhas.push(`${feed}: ${(e as Error).message}`);
    }
  }

  if (encontradas.length === 0) return { encontradas: 0, novas: 0, falhas };

  // Órgão publicador (criado na primeira importação).
  let { data: orgao } = await db.from("instituicoes_saude").select("id").eq("nome", "Ministério da Saúde").maybeSingle();
  if (!orgao) {
    const criado = await db.from("instituicoes_saude").insert({
      tipo_instituicao: "Órgão Federal",
      nome: "Ministério da Saúde",
      telefone: "136",
      linksite: "https://www.gov.br/saude",
      endereco: "Esplanada dos Ministérios, Bloco G, Brasília - DF",
    }).select("id").single();
    if (criado.error) throw new Error(`Não foi possível cadastrar o órgão: ${criado.error.message}`);
    orgao = criado.data;
  }

  const { data: existentes, error: erroBusca } = await db.from("comunicacoes")
    .select("fonte_url").in("fonte_url", encontradas.map((n) => n.url));
  if (erroBusca) throw new Error(erroBusca.message);
  const jaImportadas = new Set((existentes ?? []).map((l) => l.fonte_url));

  const novas = encontradas.filter((n) => !jaImportadas.has(n.url)).map((n) => {
    // O banco guarda horário de Brasília sem fuso.
    const publicada = new Date(n.data);
    const local = Number.isNaN(publicada.getTime())
      ? null
      : new Date(publicada.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 19);
    return {
      tipo: "NOTICIA",
      titulo: cortar(n.titulo, 150),
      descricao: n.resumo || n.titulo,
      categoria: "Informativo",
      localizacao: "Geral",
      publico_alvo: "População Geral",
      status: "ATIVO",
      lido: false,
      instituicao_id: orgao!.id,
      fonte_url: n.url,
      ...(local && { data_postada: local }),
    };
  });

  if (novas.length > 0) {
    const { error } = await db.from("comunicacoes").upsert(novas, { onConflict: "fonte_url", ignoreDuplicates: true });
    if (error) throw new Error(`Não foi possível gravar as notícias: ${error.message}`);
  }
  return { encontradas: encontradas.length, novas: novas.length, falhas };
}

// ------------------------------------------------------------- unidades
// Tipos de estabelecimento do CNES que interessam ao cidadão.
const TIPOS_CNES: Record<number, string> = { 2: "UBS", 5: "Hospital", 20: "UPA", 73: "UPA", 70: "CAPS", 76: "SAMU" };

function telefone(bruto: string | null): string {
  const digitos = (bruto ?? "").replace(/\D/g, "");
  const semDdd = digitos.length > 9 ? digitos.slice(-digitos.length + 2) : digitos;
  const ddd = digitos.length > 9 ? digitos.slice(0, 2) : "11";
  if (semDdd.length === 8) return `(${ddd}) ${semDdd.slice(0, 4)}-${semDdd.slice(4)}`;
  if (semDdd.length === 9) return `(${ddd}) ${semDdd.slice(0, 5)}-${semDdd.slice(5)}`;
  return "Não informado";
}

function horario(turno: string | null) {
  const t = (turno ?? "").toUpperCase();
  if (t.includes("24 HORAS")) return { horario_seg_sex: "24 horas", horario_sabado: "24 horas", horario_domingo: "24 horas" };
  if (t.includes("NOITE")) return { horario_seg_sex: "Manhã, tarde e noite" };
  if (t.includes("MANHA")) return { horario_seg_sex: "Manhã e tarde" };
  return {};
}

async function importarUnidades(db: SupabaseClient) {
  const unidades = new Map<number, Record<string, any>>();
  const falhas: string[] = [];
  for (const tipo of Object.keys(TIPOS_CNES)) {
    for (let pagina = 0; pagina < 15; pagina++) {
      const url = `https://apidadosabertos.saude.gov.br/cnes/estabelecimentos?codigo_municipio=${MUNICIPIO_IBGE}&codigo_tipo_unidade=${tipo}&limit=20&offset=${pagina}`;
      try {
        const resposta = await fetch(url, { headers: NAVEGADOR });
        if (!resposta.ok) { falhas.push(`tipo ${tipo}: HTTP ${resposta.status}`); break; }
        const lista = (await resposta.json()).estabelecimentos ?? [];
        for (const e of lista) unidades.set(e.codigo_cnes, e);
        if (lista.length < 20) break;
      } catch (e) {
        falhas.push(`tipo ${tipo}: ${(e as Error).message}`);
        break;
      }
    }
  }

  // Só unidades em funcionamento que atendem pelo SUS (e a base do SAMU).
  const validas = [...unidades.values()].filter((e) =>
    !e.codigo_motivo_desabilitacao_estabelecimento &&
    (e.estabelecimento_faz_atendimento_ambulatorial_sus === "SIM" || e.codigo_tipo_unidade === 76));

  const { data: atuais, error } = await db.from("instituicoes_saude").select("id, nome, codigo_cnes");
  if (error) throw new Error(error.message);
  const porCnes = new Map((atuais ?? []).filter((i) => i.codigo_cnes).map((i) => [Number(i.codigo_cnes), i.id]));
  const porNome = new Map((atuais ?? []).filter((i) => !i.codigo_cnes).map((i) => [semAcento(i.nome), i.id]));

  let novas = 0, atualizadas = 0;
  for (const e of validas) {
    const nome = cortar(capitalizar(e.nome_fantasia || e.nome_razao_social || ""), 150);
    if (!nome) continue;
    const numero = String(e.numero_estabelecimento ?? "").trim();
    const endereco = [
      capitalizar(e.endereco_estabelecimento ?? "") + (numero && numero.toUpperCase() !== "S/N" ? `, ${numero}` : ""),
      capitalizar(e.bairro_estabelecimento ?? ""),
      `${CIDADE} - SP`,
    ].filter(Boolean).join(" - ");

    const dados = {
      tipo_instituicao: TIPOS_CNES[e.codigo_tipo_unidade as number],
      telefone: telefone(e.numero_telefone_estabelecimento),
      endereco: cortar(endereco, 255),
      codigo_cnes: e.codigo_cnes,
      ...horario(e.descricao_turno_atendimento),
      ...(e.endereco_email_estabelecimento && { email: cortar(String(e.endereco_email_estabelecimento).toLowerCase(), 100) }),
    };

    // Mesma unidade já importada, ou cadastrada antes com o mesmo nome.
    const idExistente = porCnes.get(e.codigo_cnes) ?? porNome.get(semAcento(nome));
    if (idExistente) {
      const r = await db.from("instituicoes_saude").update(dados).eq("id", idExistente);
      if (r.error) falhas.push(`${nome}: ${r.error.message}`); else atualizadas++;
    } else {
      const r = await db.from("instituicoes_saude").insert({ nome, ...dados });
      if (r.error) falhas.push(`${nome}: ${r.error.message}`); else novas++;
    }
  }
  return { encontradas: validas.length, novas, atualizadas, falhas };
}

// ------------------------------------------------------------ entrada
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder(405, { mensagem: "Método não permitido." });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Quem pode chamar: o agendador do banco (segredo) ou um administrador logado.
  // O segredo do agendador fica guardado no cofre (Vault) do banco.
  const segredo = req.headers.get("x-import-secret");
  let autorizado = false;
  if (segredo) {
    const { data } = await db.rpc("conferir_segredo_importacao", { p_segredo: segredo });
    autorizado = data === true;
  }
  let autor: number | null = null;
  if (!autorizado) {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: quem } = await db.auth.getUser(token);
    if (quem?.user) {
      const { data: perfil } = await db.from("usuarios").select("id, permissao").eq("auth_id", quem.user.id).maybeSingle();
      if (perfil?.permissao === "Administrador") { autorizado = true; autor = perfil.id; }
    }
  }
  if (!autorizado) return responder(403, { mensagem: "Apenas administradores podem importar dados." });

  let alvo = "noticias";
  try { alvo = String((await req.json()).alvo ?? "noticias"); } catch { /* corpo vazio: padrão */ }

  try {
    const resultado: Record<string, unknown> = {};
    if (alvo === "noticias" || alvo === "tudo") resultado.noticias = await importarNoticias(db);
    if (alvo === "unidades" || alvo === "tudo") resultado.unidades = await importarUnidades(db);
    if (Object.keys(resultado).length === 0) return responder(400, { mensagem: 'Informe alvo "noticias", "unidades" ou "tudo".' });

    if (autor) {
      await db.from("logs_atividade").insert({ usuario_id: autor, acao: `Importou dados oficiais (${alvo})` });
    }
    return responder(200, resultado);
  } catch (e) {
    return responder(500, { mensagem: (e as Error).message });
  }
});
