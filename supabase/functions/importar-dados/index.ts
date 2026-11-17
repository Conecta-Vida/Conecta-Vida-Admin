// Edge Function "importar-dados": traz dados REAIS de fontes oficiais.
//
//   alvo "noticias": notícias do Ministério da Saúde (feed do gov.br) e da
//                    Agência SP (editoria de saúde do Governo do Estado),
//                    publicadas no app como NOTICIA, com a imagem de capa e o
//                    link da fonte. Abrangência: "Brasil", "Estado de SP" ou a
//                    cidade da região citada no título/resumo.
//   alvo "imagens":  busca a imagem de capa das notícias importadas sem imagem.
//   alvo "unidades": unidades de saúde de Bragança Paulista no CNES
//                    (dados abertos do Ministério da Saúde).
//   alvo "alertas":  nível de alerta semanal de dengue, chikungunya e zika do
//                    InfoDengue (Fiocruz/FGV) nas cidades dos usuários. Nível
//                    laranja (3) ou vermelho (4) vira ALERTA no app; quando o
//                    nível baixa, o alerta é arquivado.
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
    const local = dataLocal(n.data);
    return {
      tipo: "NOTICIA",
      titulo: cortar(n.titulo, 150),
      descricao: n.resumo || n.titulo,
      categoria: "Informativo",
      localizacao: abrangencia(`${n.titulo} ${n.resumo}`, "Brasil"),
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
  // Capas das notícias novas (e das que ficaram sem imagem antes).
  const imagens = await completarImagens(db, 20);
  return { encontradas: encontradas.length, novas: novas.length, imagens, falhas };
}

// --------------------------------------------------------------- imagens
// A imagem é copiada para o Storage do Supabase: imagens de outros sites
// podem ser bloqueadas pelo navegador na versão web do app.
const BUCKET = "comunicacoes";
const EXTENSOES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

async function imagemDaMateria(url: string): Promise<string | null> {
  try {
    const html = await (await fetch(url, { headers: NAVEGADOR })).text();
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (!og) return null;
    const imagem = decodificar(og[1]);
    // Matérias sem foto usam o logotipo do site (ex.: gov.br/saude/logo.png): não serve de capa.
    return /\/logo[^/]*\.(png|svg|jpe?g)$/i.test(imagem) ? null : imagem;
  } catch {
    return null;
  }
}

async function copiarImagem(db: SupabaseClient, origem: string | null, prefixo: string): Promise<string | null> {
  if (!origem) return null;
  try {
    const resposta = await fetch(origem.replace(/^http:/, "https:"), { headers: NAVEGADOR });
    const tipo = (resposta.headers.get("content-type") ?? "").split(";")[0].trim();
    const extensao = EXTENSOES[tipo];
    if (!resposta.ok || !extensao) return null;
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) return null;
    const caminho = `importadas/${prefixo}-${crypto.randomUUID()}.${extensao}`;
    const { error } = await db.storage.from(BUCKET).upload(caminho, bytes, { contentType: tipo, cacheControl: "31536000" });
    if (error) return null;
    return db.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
  } catch {
    return null;
  }
}

/** Busca e grava a capa das notícias importadas que ainda não têm imagem. */
async function completarImagens(db: SupabaseClient, limite = 40) {
  const { data, error } = await db.from("comunicacoes")
    .select("id, fonte_url").not("fonte_url", "is", null).is("linkimagem", null)
    .neq("status", "ARQUIVADO").order("data_postada", { ascending: false }).limit(limite);
  if (error) throw new Error(error.message);
  let com = 0;
  for (const linha of data ?? []) {
    const url = await copiarImagem(db, await imagemDaMateria(linha.fonte_url), "noticia");
    if (!url) continue;
    const r = await db.from("comunicacoes").update({ linkimagem: url }).eq("id", linha.id);
    if (!r.error) com++;
  }
  return { verificadas: (data ?? []).length, comImagem: com };
}

// ----------------------------------------------------------- abrangência
// Cidades da região: uma notícia que cita uma delas aparece para essa cidade.
const CIDADES_DA_REGIAO = [
  "Bragança Paulista", "Atibaia", "Itatiba", "Piracaia", "Joanópolis", "Vargem",
  "Bom Jesus dos Perdões", "Nazaré Paulista", "Pinhalzinho", "Socorro", "Morungaba",
  "Tuiuti", "Pedra Bela", "Amparo", "Jarinu", "Campinas", "Jundiaí",
];

function abrangencia(texto: string, padrao: string): string {
  const alvo = semAcento(texto);
  for (const cidade of CIDADES_DA_REGIAO) {
    if (new RegExp(`\\b${semAcento(cidade)}\\b`).test(alvo)) return cidade;
  }
  return padrao;
}

async function orgao(db: SupabaseClient, nome: string, extra: Record<string, string>) {
  const { data } = await db.from("instituicoes_saude").select("id").eq("nome", nome).maybeSingle();
  if (data) return data.id as number;
  const criado = await db.from("instituicoes_saude").insert({ nome, ...extra }).select("id").single();
  if (criado.error) throw new Error(`Não foi possível cadastrar ${nome}: ${criado.error.message}`);
  return criado.data.id as number;
}

/** Converte uma data do feed para o horário de Brasília sem fuso (como o banco guarda). */
function dataLocal(bruta: string): string | null {
  const d = new Date(bruta);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 19);
}

// ---------------------------------------------- notícias da Agência SP
async function importarAgenciaSP(db: SupabaseClient) {
  const feed = "https://www.agenciasp.sp.gov.br/editoria/saude/feed/";
  const falhas: string[] = [];
  const itens: { titulo: string; resumo: string; url: string; data: string; imagem: string | null }[] = [];
  try {
    const resposta = await fetch(feed, { headers: NAVEGADOR, redirect: "follow" });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const xml = await resposta.text();
    for (const [, corpo] of xml.matchAll(/<item>(.*?)<\/item>/gs)) {
      const campo = (tag: string) => decodificar(corpo.match(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "s"))?.[1] ?? "");
      const url = campo("link");
      const titulo = campo("title");
      if (!titulo || !url.startsWith("https://www.agenciasp.sp.gov.br/")) continue;
      const imagem = corpo.match(/<img[^>]+src="([^"]+\.(?:jpe?g|png|webp))"/i)?.[1] ?? null;
      itens.push({ titulo, resumo: campo("description"), url, data: campo("pubDate"), imagem });
    }
  } catch (e) {
    falhas.push(`${feed}: ${(e as Error).message}`);
  }
  if (itens.length === 0) return { encontradas: 0, novas: 0, falhas };

  const { data: existentes } = await db.from("comunicacoes").select("fonte_url").in("fonte_url", itens.map((n) => n.url));
  const ja = new Set((existentes ?? []).map((l) => l.fonte_url));
  const novos = itens.filter((n) => !ja.has(n.url));
  if (novos.length === 0) return { encontradas: itens.length, novas: 0, falhas };

  const governo = await orgao(db, "Governo do Estado de São Paulo", {
    tipo_instituicao: "Órgão Estadual", telefone: "Não informado",
    linksite: "https://www.agenciasp.sp.gov.br/editoria/saude/", endereco: "São Paulo - SP",
  });

  let gravadas = 0;
  for (const n of novos) {
    const capa = await copiarImagem(db, n.imagem ?? await imagemDaMateria(n.url), "sp");
    const local = dataLocal(n.data);
    const r = await db.from("comunicacoes").upsert({
      tipo: "NOTICIA", titulo: cortar(n.titulo, 150), descricao: n.resumo || n.titulo,
      categoria: "Informativo", localizacao: abrangencia(`${n.titulo} ${n.resumo}`, "Estado de SP"),
      publico_alvo: "População Geral", status: "ATIVO", lido: false, instituicao_id: governo,
      fonte_url: n.url, linkimagem: capa, ...(local && { data_postada: local }),
    }, { onConflict: "fonte_url", ignoreDuplicates: true });
    if (r.error) falhas.push(`${n.titulo}: ${r.error.message}`); else gravadas++;
  }
  return { encontradas: itens.length, novas: gravadas, falhas };
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
      latitude: typeof e.latitude_estabelecimento_decimo_grau === "number" ? e.latitude_estabelecimento_decimo_grau : null,
      longitude: typeof e.longitude_estabelecimento_decimo_grau === "number" ? e.longitude_estabelecimento_decimo_grau : null,
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


// --------------------------------------------------- alertas (InfoDengue)
const DOENCAS: Record<string, string> = { dengue: "Dengue", chikungunya: "Chikungunya", zika: "Zika" };
const NIVEIS: Record<number, string> = { 3: "laranja", 4: "vermelho" };

/** Semana epidemiológica aproximada (domingo a sábado) de uma data. */
function semanaEpidemiologica(d: Date) {
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const primeiroDomingo = new Date(inicioAno.getTime() - inicioAno.getUTCDay() * 86400_000);
  const se = Math.floor((d.getTime() - primeiroDomingo.getTime()) / (7 * 86400_000)) + 1;
  return { ano: d.getUTCFullYear(), se: Math.min(Math.max(se, 1), 53) };
}

/** Cidades a acompanhar: Bragança Paulista e as cidades informadas pelos usuários. */
async function cidadesMonitoradas(db: SupabaseClient) {
  const { data: perfis } = await db.from("usuarios").select("localizacao").not("localizacao", "is", null);
  const nomes = new Set<string>(["braganca paulista"]);
  for (const p of perfis ?? []) {
    const n = semAcento(String(p.localizacao ?? ""));
    if (n && !["nao informado", "nao disponivel", "geral"].includes(n)) nomes.add(n);
  }
  const { data: municipios } = await db.from("municipios_ibge").select("codigo, nome, uf, nome_busca").in("nome_busca", [...nomes]);
  // Mesmo nome em mais de um estado: prefere SP (origem do projeto).
  const porNome = new Map<string, { codigo: number; nome: string; uf: string }>();
  for (const m of municipios ?? []) {
    const atual = porNome.get(m.nome_busca);
    if (!atual || m.uf === "SP") porNome.set(m.nome_busca, m);
  }
  return [...porNome.values()].slice(0, 60);
}

async function importarAlertas(db: SupabaseClient, nivelMinimo = 3) {
  const cidades = await cidadesMonitoradas(db);
  const hoje = new Date();
  const fim = semanaEpidemiologica(hoje);
  const ini = semanaEpidemiologica(new Date(hoje.getTime() - 28 * 86400_000));
  const orgaoId = await orgao(db, "InfoDengue (Fiocruz / FGV)", {
    tipo_instituicao: "Órgão Federal", telefone: "136",
    linksite: "https://info.dengue.mat.br", endereco: "Rio de Janeiro - RJ",
  });

  let publicados = 0, arquivados = 0;
  const falhas: string[] = [];
  const situacao: string[] = [];
  for (const cidade of cidades) {
    for (const [doenca, nomeDoenca] of Object.entries(DOENCAS)) {
      try {
        const url = `https://info.dengue.mat.br/api/alertcity?geocode=${cidade.codigo}&disease=${doenca}&format=json` +
          `&ew_start=${ini.ano === fim.ano ? ini.se : 1}&ew_end=${fim.se}&ey_start=${fim.ano}&ey_end=${fim.ano}`;
        const r = await fetch(url, { headers: NAVEGADOR, signal: AbortSignal.timeout(20000) });
        if (!r.ok) { falhas.push(`${cidade.nome}/${doenca}: HTTP ${r.status}`); continue; }
        const semanas = (await r.json()) as Record<string, any>[];
        if (!Array.isArray(semanas) || semanas.length === 0) continue;
        const ultima = semanas.reduce((a, b) => (Number(b.SE) > Number(a.SE) ? b : a));
        const nivel = Number(ultima.nivel);
        situacao.push(`${cidade.nome}/${doenca}: nível ${nivel}`);
        const prefixo = `https://info.dengue.mat.br/alerta/${cidade.codigo}/${doenca}`;

        if (nivel >= nivelMinimo) {
          const se = String(ultima.SE);
          const casos = Math.round(Number(ultima.casos_est ?? ultima.casos ?? 0));
          const incidencia = Number(ultima.p_inc100k ?? 0).toFixed(1).replace(".", ",");
          const linha = {
            tipo: "ALERTA",
            titulo: cortar(`Alerta ${NIVEIS[nivel] ?? ""} de ${nomeDoenca} em ${cidade.nome}`, 150),
            descricao:
              `O InfoDengue (Fiocruz/FGV) classificou ${cidade.nome} - ${cidade.uf} em nível ${NIVEIS[nivel] ?? nivel} ` +
              `para ${nomeDoenca} na semana epidemiológica ${se.slice(4)}/${se.slice(0, 4)}: cerca de ${casos} casos estimados ` +
              `(${incidencia} por 100 mil habitantes). Elimine água parada em vasos, pneus, calhas e garrafas, use repelente e ` +
              `procure uma unidade de saúde em caso de febre, dor no corpo ou manchas na pele.`,
            categoria: "Epidemia",
            localizacao: cidade.nome,
            publico_alvo: "População Geral",
            status: "ATIVO",
            lido: false,
            instituicao_id: orgaoId,
            fonte_url: `${prefixo}?se=${se}`,
          };
          const { data: novo, error } = await db.from("comunicacoes")
            .upsert(linha, { onConflict: "fonte_url", ignoreDuplicates: true }).select("id");
          if (error) falhas.push(`${cidade.nome}/${doenca}: ${error.message}`);
          else if ((novo ?? []).length > 0) publicados++;
          // Alertas de semanas anteriores da mesma cidade e doença saem do app.
          const { data: antigos } = await db.from("comunicacoes").update({ status: "ARQUIVADO" })
            .like("fonte_url", `${prefixo}?se=%`).neq("fonte_url", linha.fonte_url).neq("status", "ARQUIVADO").select("id");
          arquivados += (antigos ?? []).length;
        } else {
          // Nível voltou a verde/amarelo: arquiva os alertas automáticos dessa cidade e doença.
          const { data: antigos } = await db.from("comunicacoes").update({ status: "ARQUIVADO" })
            .like("fonte_url", `${prefixo}?se=%`).neq("status", "ARQUIVADO").select("id");
          arquivados += (antigos ?? []).length;
        }
      } catch (e) {
        falhas.push(`${cidade.nome}/${doenca}: ${(e as Error).message}`);
      }
    }
  }
  return { cidades: cidades.length, publicados, arquivados, situacao, falhas };
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
  let nivelMinimo = 3;
  try {
    const corpo = await req.json();
    alvo = String(corpo.alvo ?? "noticias");
    // Só para teste manual: permite simular com um nível mais baixo.
    if (Number.isInteger(corpo.nivel_minimo)) nivelMinimo = Math.min(Math.max(corpo.nivel_minimo, 1), 4);
  } catch { /* corpo vazio: padrão */ }

  try {
    const resultado: Record<string, unknown> = {};
    if (alvo === "noticias" || alvo === "tudo") {
      resultado.noticias = await importarNoticias(db);
      resultado.estado = await importarAgenciaSP(db);
    }
    if (alvo === "imagens") resultado.imagens = await completarImagens(db);
    if (alvo === "unidades" || alvo === "tudo") resultado.unidades = await importarUnidades(db);
    if (alvo === "alertas" || alvo === "tudo") resultado.alertas = await importarAlertas(db, nivelMinimo);
    if (Object.keys(resultado).length === 0) return responder(400, { mensagem: 'Informe alvo "noticias", "unidades", "imagens", "alertas" ou "tudo".' });

    if (autor) {
      await db.from("logs_atividade").insert({ usuario_id: autor, acao: `Importou dados oficiais (${alvo})` });
    }
    return responder(200, resultado);
  } catch (e) {
    return responder(500, { mensagem: (e as Error).message });
  }
});
