// Edge Function "admin-usuarios": cria contas pelo painel administrativo.
//
// Criar uma conta já confirmada exige a chave de serviço do Supabase, que
// nunca pode ir para o navegador. Por isso o painel chama esta função, que:
//   1. confere se quem chamou está logado e é Administrador;
//   2. cria a conta no Supabase Auth (o gatilho do banco cria o perfil);
//   3. ajusta a permissão e devolve o perfil criado.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const responder = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const COLUNAS = "id, nome, email, sexo, localizacao, permissao, data_nascimento";
const PERMISSOES = ["Administrador", "Usuário Comum"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder(405, { mensagem: "Método não permitido." });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // 1. Quem está chamando?
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: quem, error: erroToken } = await admin.auth.getUser(token);
  if (erroToken || !quem?.user) return responder(401, { mensagem: "Faça login novamente." });

  const { data: solicitante } = await admin
    .from("usuarios").select("id, permissao").eq("auth_id", quem.user.id).maybeSingle();
  if (solicitante?.permissao !== "Administrador") {
    return responder(403, { mensagem: "Apenas administradores podem criar contas." });
  }

  // 2. Dados da nova conta
  let dados: Record<string, unknown>;
  try {
    dados = await req.json();
  } catch {
    return responder(400, { mensagem: "Corpo da requisição inválido." });
  }
  const nome = String(dados.nome ?? "").trim();
  const email = String(dados.email ?? "").trim().toLowerCase();
  const senha = String(dados.senha ?? "");
  const permissao = PERMISSOES.includes(String(dados.permissao)) ? String(dados.permissao) : "Usuário Comum";
  const nascimento = Number.parseInt(String(dados.data_nascimento ?? ""), 10);

  if (!nome || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return responder(400, { mensagem: "Informe nome e um e-mail válido." });
  }
  if (senha.length < 6) {
    return responder(400, { mensagem: "A senha precisa ter pelo menos 6 caracteres." });
  }

  const { data: existente } = await admin.from("usuarios").select("id, auth_id").eq("email", email).maybeSingle();
  if (existente?.auth_id) return responder(409, { mensagem: "Este e-mail já está cadastrado." });

  // 3. Cria a conta já confirmada. Se existir um perfil antigo (da API Java)
  //    com o mesmo e-mail, ele é reaproveitado com suas inscrições.
  const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: {
      nome,
      sexo: dados.sexo ?? null,
      localizacao: dados.localizacao ?? null,
      data_nascimento: Number.isNaN(nascimento) ? null : nascimento,
    },
  });
  if (erroCriar || !criado?.user) {
    const jaExiste = /already|registered|exists/i.test(erroCriar?.message ?? "");
    return responder(jaExiste ? 409 : 400, {
      mensagem: jaExiste ? "Este e-mail já está cadastrado." : (erroCriar?.message ?? "Não foi possível criar a conta."),
    });
  }

  const { data: perfil, error: erroPerfil } = await admin
    .from("usuarios")
    .update({
      nome,
      permissao,
      sexo: dados.sexo ?? null,
      localizacao: dados.localizacao ?? null,
      data_nascimento: Number.isNaN(nascimento) ? null : nascimento,
    })
    .eq("auth_id", criado.user.id)
    .select(COLUNAS)
    .single();

  if (erroPerfil || !perfil) {
    // Sem perfil a conta ficaria inutilizável: desfaz a criação.
    await admin.auth.admin.deleteUser(criado.user.id);
    return responder(500, { mensagem: "Não foi possível criar o perfil do usuário." });
  }

  await admin.from("logs_atividade").insert({
    usuario_id: solicitante.id,
    acao: `Criou usuário "${nome}" (${permissao})`.slice(0, 255),
  });

  return responder(201, { usuario: perfil });
});
