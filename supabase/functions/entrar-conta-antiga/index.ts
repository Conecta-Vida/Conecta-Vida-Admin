// Edge Function "entrar-conta-antiga": leva para o Supabase Auth uma conta
// criada pela antiga API Java (que guardava só o hash da senha na tabela
// usuarios). Recebe { email, senha }; se a senha for a da conta antiga, cria o
// login no Supabase com essa mesma senha (já confirmado) e liga ao perfil. Depois
// disso o painel e o app entram normalmente com e-mail e senha.
//
// Como a senha é conferida:
//   1. hash SHA-256 sem salt (contas mais antigas), direto no banco;
//   2. senão, pergunta à API Java (que tem o salt) se o login é válido.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, "Content-Type": "application/json" } });

const API_ANTIGA = Deno.env.get("API_JAVA_URL") ?? "https://conecta-vida-backend-production.up.railway.app";

async function sha256(texto: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function senhaConfere(email: string, senha: string, hashGuardado: string) {
  if (/^[0-9a-f]{64}$/i.test(hashGuardado) && (await sha256(senha)) === hashGuardado.toLowerCase()) return true;
  try {
    const r = await fetch(`${API_ANTIGA}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
      signal: AbortSignal.timeout(20000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder(405, { mensagem: "Método não permitido." });

  let email = "", senha = "";
  try {
    const corpo = await req.json();
    email = String(corpo.email ?? "").trim().toLowerCase();
    senha = String(corpo.senha ?? "");
  } catch { /* corpo inválido */ }
  if (!email || !senha) return responder(400, { mensagem: "Informe e-mail e senha." });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Só contas antigas: perfil existente, sem login no Supabase.
  const { data: perfil } = await db.from("usuarios").select("id, nome, senha, auth_id").ilike("email", email).maybeSingle();
  const invalida = () => responder(401, { mensagem: "E-mail ou senha incorretos." });
  if (!perfil || perfil.auth_id || !perfil.senha) return invalida();
  if (!(await senhaConfere(email, senha, perfil.senha))) return invalida();

  const { error } = await db.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome: perfil.nome },
    app_metadata: { conta_antiga_verificada: true },
  });
  if (error) {
    // Supabase exige senha com pelo menos 6 caracteres.
    if (/password/i.test(error.message)) {
      return responder(422, { mensagem: "Sua senha antiga é curta demais. Use “Esqueci minha senha” para criar uma nova." });
    }
    return responder(500, { mensagem: `Não foi possível migrar a conta: ${error.message}` });
  }
  return responder(200, { migrada: true });
});
