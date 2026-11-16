# Conecta Vida — Painel administrativo e banco (Supabase)

Painel web usado pelos gestores de saúde para publicar notícias, campanhas e alertas, cadastrar instituições e gerenciar usuários. O cidadão recebe tudo no [aplicativo Flutter](https://github.com/Conecta-Vida/Conecta-Vida-Mobile).

**IFSP — Câmpus Bragança Paulista** · Tecnologia em Análise e Desenvolvimento de Sistemas

## Arquitetura

```
 App Flutter (cidadão) ─┐
                        ├──► Supabase ── Auth (login, recuperação de senha)
 Painel React (admin) ──┘             ├─ Postgres + regras de acesso (RLS)
      hospedado no Netlify            ├─ Realtime (alertas chegam na hora)
                                      └─ Edge Function admin-usuarios
```

Não há mais API Java nem servidor próprio: o app e o painel falam direto com o Supabase. A segurança fica no banco — as regras de acesso (RLS) garantem que cada conta só lê e grava o que pode, mesmo que alguém chame a API fora das telas.

| Quem | Pode |
|---|---|
| Visitante (sem login) | nada |
| Cidadão | ler comunicações e instituições; ver e editar o próprio perfil; gerenciar os próprios dependentes e inscrições |
| Administrador | tudo acima, mais publicar/editar/remover comunicações e instituições, ver e gerenciar usuários, ver o registro de atividades |

## Pastas

| Pasta | Conteúdo |
|---|---|
| `conecta-a-vida-administrativo/` | Painel (React 19 + Vite + TypeScript + Tailwind). Todo o acesso a dados está em `src/services/api.ts`. |
| `supabase/migrations/` | SQL do vínculo com o Supabase Auth, regras de acesso e funções administrativas. É aditivo e pode ser executado mais de uma vez. |
| `supabase/functions/importar-dados/` | Edge Function que importa notícias e unidades de saúde de fontes oficiais. |
| `supabase/functions/admin-usuarios/` | Edge Function que cria contas pelo painel (usa a chave de serviço, que nunca vai para o navegador). |
| `netlify.toml` | Configuração de build e rotas para o Netlify. |

## Rodar o painel

```bash
cd conecta-a-vida-administrativo
```

```bash
npm install
```

```bash
npm run dev
```

O endereço e a chave **pública** do Supabase já estão em `src/services/supabase.ts`. Para apontar para outro projeto, defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Publicar no Netlify

O site `conecta-vida-admin` já existe na conta. Em **Project configuration → Build & deploy → Link repository**, conecte este repositório; o `netlify.toml` cuida do resto (pasta base, comando de build e redirecionamento das rotas).

## Configuração do Supabase (painel do Supabase → Authentication)

1. **URL Configuration → Redirect URLs**: adicione `https://conecta-vida-admin.netlify.app/**`. Cobre as duas páginas que recebem links de e-mail: `/redefinir-senha` ("esqueci minha senha", do app e do painel) e `/email-confirmado` (confirmação de cadastro do app). Em **Site URL**, use `https://conecta-vida-admin.netlify.app/email-confirmado`.
2. **E-mails**: a confirmação de e-mail no cadastro fica **ligada**. O serviço de e-mail padrão do Supabase só envia para membros do projeto e tem limite baixo por hora, então configure um SMTP próprio em **Emails → SMTP Settings** (por exemplo Resend, Brevo ou uma conta do Gmail com senha de app); sem isso, os e-mails de confirmação e de recuperação não chegam aos usuários. Contas criadas pelo painel já nascem confirmadas.

## Contas antigas (da API Java)

As senhas antigas não podem ser migradas. Quem já tinha conta se cadastra de novo com o **mesmo e-mail**: o banco reconhece o perfil antigo e mantém inscrições e dependentes. Perfis de administrador antigos não são herdados automaticamente quando a confirmação de e-mail está desligada (seria possível tomar a conta de outra pessoa); um administrador cria ou promove o usuário pelo painel.

## Funções do painel

- **Dashboard**: indicadores, publicações por mês e atividade recente.
- **Usuários**: listar, criar, editar, promover a administrador, remover, importar CSV, exportar CSV e relatório para impressão/PDF.
- **Unidades de Saúde**, **Campanhas**, **Alertas** e **Notícias**: cadastro completo.
- **Imagens de capa**: enviadas pelo próprio painel para o Supabase Storage.
- **Inscritos por campanha**: total em cada card e lista de participantes (titular ou dependente) nos detalhes.
- **Dados reais automáticos**: a função `importar-dados` publica as notícias do Ministério da Saúde (duas vezes por dia) e atualiza as unidades de saúde de Bragança Paulista pelo CNES (todo mês). Os botões **Importar do Ministério da Saúde** e **Importar do CNES** fazem o mesmo na hora.
- **Encerramento automático**: todo dia o banco marca como encerradas as campanhas com data de término vencida.
- **Login** restrito a administradores e **recuperação de senha** por e-mail.

© 2026 Conecta Vida. Projeto acadêmico do IFSP Bragança Paulista.
