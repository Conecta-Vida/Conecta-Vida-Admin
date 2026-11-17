import { HeartPulse } from "lucide-react";
import { Link } from "react-router-dom";

// E-mail público de contato do projeto (aparece na política). Preencha antes
// de publicar na Play Store; vazio, a política indica a página de exclusão.
const EMAIL_CONTATO = "";
const ATUALIZADA_EM = "17 de novembro de 2026";

const Secao = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <section className="space-y-2">
    <h2 className="text-lg font-black text-slate-900">{titulo}</h2>
    <div className="space-y-2 text-[15px] leading-relaxed text-slate-600">{children}</div>
  </section>
);

/** Política de privacidade do app e do painel (exigida pela Play Store e pela LGPD). */
export default function Privacidade() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <article className="mx-auto max-w-3xl space-y-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <header className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><HeartPulse className="h-5 w-5" /></div>
            <span className="text-sm font-bold uppercase tracking-wider text-blue-600">Conecta Vida</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900">Política de Privacidade</h1>
          <p className="text-sm text-slate-500">Atualizada em {ATUALIZADA_EM}.</p>
          <p className="text-[15px] leading-relaxed text-slate-600">
            O Conecta Vida é um projeto acadêmico do curso de Análise e Desenvolvimento de Sistemas do IFSP – Câmpus
            Bragança Paulista. O aplicativo reúne notícias, campanhas e alertas de saúde de fontes oficiais. Esta política
            explica, de forma simples, quais dados usamos e por quê, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).
          </p>
        </header>

        <Secao titulo="1. Dados que coletamos">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Conta:</strong> nome, e-mail e senha (a senha é guardada de forma criptografada e ninguém da equipe tem acesso a ela).</li>
            <li><strong>Perfil (opcional):</strong> ano de nascimento, sexo e cidade, usados para mostrar campanhas adequadas à sua idade e região.</li>
            <li><strong>Localização (opcional):</strong> com sua permissão, a localização do aparelho é usada para descobrir sua cidade e ordenar as unidades de saúde mais próximas. Não guardamos o histórico das suas posições.</li>
            <li><strong>Inscrições e dependentes:</strong> campanhas em que você se inscreveu e, se você cadastrar, nome, ano de nascimento e parentesco dos seus dependentes.</li>
            <li><strong>Preferências:</strong> filtros, acessibilidade e notificações ficam salvos no próprio aparelho.</li>
          </ul>
        </Secao>

        <Secao titulo="2. Para que usamos">
          <p>Somente para o funcionamento do aplicativo: entrar na sua conta, mostrar conteúdo da sua região, inscrever você e seus dependentes em campanhas e enviar alertas de saúde. Não vendemos dados, não mostramos anúncios e não usamos os dados para fins comerciais.</p>
          <p>Bases legais: execução do serviço que você solicitou (art. 7º, V) e consentimento para os dados opcionais e a localização (art. 7º, I), que pode ser retirado a qualquer momento nos Ajustes do app.</p>
        </Secao>

        <Secao titulo="3. Com quem os dados são compartilhados">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Supabase:</strong> serviço de nuvem onde ficam a conta e o banco de dados, com acesso protegido por regras de segurança.</li>
            <li><strong>Netlify:</strong> hospeda os sites do app e do painel.</li>
            <li><strong>OpenStreetMap (Nominatim):</strong> recebe as coordenadas para informar o nome da cidade, sem dados de identificação.</li>
            <li><strong>Google Maps:</strong> abre apenas quando você toca em "Como chegar" ou em um local.</li>
          </ul>
          <p>Os gestores dos órgãos de saúde que usam o painel veem a lista de inscritos das próprias campanhas.</p>
        </Secao>

        <Secao titulo="4. Por quanto tempo guardamos">
          <p>Enquanto a conta existir. Ao excluir a conta, o perfil, as inscrições e os dependentes são apagados. Registros de atividade do painel administrativo são mantidos apenas para segurança.</p>
        </Secao>

        <Secao titulo="5. Seus direitos">
          <p>Você pode consultar e corrigir seus dados em Ajustes, desligar a localização e as notificações e excluir sua conta a qualquer momento — no app (Ajustes → Deletar) ou pela página{" "}
            <Link to="/excluir-conta" className="font-semibold text-blue-600 underline">Excluir minha conta</Link>.
          </p>
        </Secao>

        <Secao titulo="6. Segurança">
          <p>Comunicação sempre criptografada (HTTPS), senhas protegidas por criptografia, regras de acesso no banco que impedem um usuário de ver dados de outro e painel restrito a administradores.</p>
        </Secao>

        <Secao titulo="7. Crianças">
          <p>Contas são para maiores de 18 anos. Menores aparecem no app apenas como dependentes cadastrados por um responsável.</p>
        </Secao>

        <Secao titulo="8. Contato">
          <p>
            {EMAIL_CONTATO
              ? <>Dúvidas ou pedidos sobre seus dados: <a className="font-semibold text-blue-600 underline" href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>.</>
              : <>Dúvidas ou pedidos sobre seus dados podem ser feitos pela equipe do projeto Conecta Vida (IFSP – Câmpus Bragança Paulista) ou pela página <Link to="/excluir-conta" className="font-semibold text-blue-600 underline">Excluir minha conta</Link>.</>}
          </p>
        </Secao>
      </article>
    </div>
  );
}
