# ⚛️ Conecta à Vida - Painel de Controlo Administrativo Web

<p align="center">
<strong>Uma interface corporativa Single Page Application (SPA) desenvolvida em React com TypeScript, focada na gestão de dados de saúde pública, monitoramento analítico de crises e curadoria de campanhas comunitárias. Apresenta uma arquitetura totalmente expansiva para monitores de alta resolução e layout fluido adaptável para telemóveis.</strong>
</p>

<p align="center">
<img src="https://img.shields.io/badge/React-19.2.4-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19.2.4">
<img src="https://img.shields.io/badge/TypeScript-5.9.3-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript 5.9.3">
<img src="https://img.shields.io/badge/Vite-8.0.1-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite 8.0.1">
<img src="https://img.shields.io/badge/Tailwind%20CSS-4.2.2-38B2AC?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind 4.2.2">
<img src="https://img.shields.io/badge/Axios-1.7.9-5A29E4?style=for-the-badge&logo=axios&logoColor=white" alt="Axios 1.7.9">
</p>

<p align="center">
  <a href="https://youtu.be/gKQ8_JRuKwk" title="Clique para assistir à demonstração">
    <img src="https://img.shields.io/badge/Assista%20à%20Demonstração-FF0000?style=for-the-badge&logo=youtube&logoColor=white" alt="Assista à Demonstração">
  </a>
</p>

-----

## 👥 Autores e Instituição
* **Luiz Henrique Gonçalves**
* **Gustavo**
* **Gabriel**
* **Renan**
* **Maycon**
  * **IFSP - Câmpus Bragança Paulista** *Curso Superior de Tecnologia em Análise e Desenvolvimento de Sistemas*

-----

## 📖 Sobre o Módulo Administrativo

No ecossistema **Conecta à Vida**, o Frontend atua como a central de comando e tomada de decisões para os órgãos reguladores de saúde. A aplicação adota o concept de *Design Semântico*, onde elementos visuais e paletas de cores indicam diretamente o estado de contingência do município:
* **Tons de Azul:** Sinalizam estabilidade e controle na gestão cadastral de hospitais e usuários.
* **Tons de Verde:** Indicam o engajamento positivo e andamento de campanhas de vacinação e doação.
* **Tons de Âmbar/Vermelho:** Alertam em tempo real sobre surtos biológicos ativos ou bloqueios emergenciais de infraestrutura.

Por ser uma aplicação totalmente desacoplada, ela consome os microsserviços da API Java de forma assíncrona, garantindo uma navegação instantânea sem recarregamentos de página.

-----

## 📦 Dependências e Pré-requisitos do Ecossistema

Para que o projeto compile e rode localmente sem erros, as seguintes ferramentas e pacotes serão injetados no ambiente de desenvolvimento:

### ⚙️ 1. Ambiente Global (Obrigatório na Máquina)
* **Node.js:** Versão v18.0.0 ou superior (Recomendado LTS)
* **npm:** Versão 9.0.0 ou superior (Gerenciador de pacotes nativo do Node)

### 📚 2. Dependências de Produção (Core Libraries)
Estas são as bibliotecas que dão vida às funcionalidades do painel administrativo:
* **`react` (^19.2.4) & `react-dom` (^19.2.4):** Motor base reativo para renderização de componentes e manipulação do DOM virtual.
* **`react-router-dom` (^7.13.2):** Sistema de roteamento dinâmico no cliente para gerenciamento de páginas e sub-rotas.
* **`axios` (^1.7.9):** Cliente HTTP baseado em Promessas para consumo assíncrono dos endpoints da API Java.
* **`lucide-react`:** Pacote de ícones semânticos vetoriais de alta resolução.
* **`sonner`:** Mecanismo leve de gerenciamento e disparo de alertas flutuantes temporizados (*Toasts*).

### 🛠️ 3. Dependências de Desenvolvimento (Build & Tooling)
Ferramentas utilizadas estritamente para compilação, tipagem e otimização do código fonte:
* **`typescript` (^5.9.3):** Superset JavaScript que adiciona tipagem estática avançada, prevenindo erros em tempo de escrita.
* **`vite` (^8.0.1):** Build tool e empacotador de altíssima performance para desenvolvimento local instantâneo.
* **`tailwindcss` (^4.2.2):** Framework utilitário de CSS focado em performance para estilização baseada em classes atômicas.
* **`@types/react` & `@types/react-dom`:** Arquivos de definição de tipos TypeScript para os elementos nativos do ecossistema React.

-----

## ✨ Funcionalidades e Casos de Uso da Interface

### 🔐 A. Controle de Acesso e Guarda de Sessão (`/login`)
* **Autenticação Stateful:** Formulário integrado para captura de credenciais corporativas com validação preventiva de campos.
* **Mecanismo de Proteção:** Interceptação automática de rotas privadas via componente `<RotaProtegida />`, impedindo o acesso manual de utilizadores sem sessão activa.

### 📊 B. Dashboard e Painel Analítico (`/`)
* **Métricas Consolidadas:** Blocos dinâmicos que exibem os contadores de usuários, alertas de surto ativos, mutirões comunitários e notícias vigentes, carregados simultaneamente via `Promise.all`.
* **Gráfico de Crescimento Nativo:** Gráfico de barras construído puramente em lógica React + Tailwind CSS (sem dependências externas pesadas), que calcula proporcionalmente a altura das colunas com base nos dados do servidor.
* **Timeline de Auditoria:** Feed atualizado que renderiza as 5 últimas ações técnicas de controle executadas no ecossistema.

### 👥 C. Gestão de Cidadãos (`/usuarios`)
* **CRUD de População:** Telas de cadastro, listagem tabular e edição de dados demográficos de usuários civis.
* **Ingestão de Dados em Lote:** Módulo especial para upload de arquivos planilhados `.csv` para inserção em massa de cidadãos no sistema.
* **Disparador de Documentos:** Botão de exportação que solicita e efetua o download em tempo real de relatórios formatados em PDF.

### 🏥 D. Infraestrutura de Unidades de Saúde (`/instituicoes`)
* **Mappeamento da Rede Pública:** Cadastro e consulta de postos de saúde, UPAs, e hemocentros com sinalização por badges.
* **Matriz de Horários:** Gerenciador de grades horárias semanais segmentadas por dias úteis, sábados e domingos.

### 📢 E. Central de Comunicação de Crises (`/campanhas` e `/alertas`)
* **Ações Comunitárias:** Controle completo de mutirões (vacinação, doação de sangue), permitindo a edição avançada de status operacionais (`"ATIVA"`, `"CONCLUÍDA"`).
* **Gatilho Push Epidemiológico:** Lançamento de alertas emergenciais geolocalizados que servem de gatilho direto para o disparo de notificações Push nos smartphones da população civil.

-----

## 🚀 Funcionalidades Extra e Otimizações de UX

Para além dos requisitos básicos de negócio, o Frontend incorpora mecânicas avançadas de engenharia de interface destinadas a mitigar o estresse do navegador e blindar a experiência do utilizador:

* **🔍 Filtros e Pesquisa com Inteligência Client-Side:** As tabelas de utilizadores e unidades de saúde contam com barras de pesquisa reativas baseadas em filtragem de array em memória. A busca é computada instantaneamente sem a necessidade de disparar ciclos adicionais de requisições à API Java, poupando processamento no servidor.
* **💀 Esqueletos Animados de Carregamento (Skeleton Shimmer Effect):** Durante o intervalo de resposta assíncrona do Axios, os cards do Dashboard e as linhas das tabelas exibem blocos pulsantes cinzentos que imitam a geometria exata dos dados reais. Isso neutraliza o efeito nocivo de *Cumulative Layout Shift* (CLS), mantendo os elementos da página estáticos e confortáveis para a leitura.
* **🌓 Alternância Dinâmica de Temas (Modo Escuro / Modo Claro):** Suporte nativo a temas visuais gerenciados por meio de classes utilitárias `dark:` do Tailwind CSS. O sistema identifica a preferência do administrador e guarda de forma persistente a escolha no `localStorage` do browser.
* **🚨 Monitor de Estado Offline com Travamento Defensivo:** A aplicação monitoriza ativamente a API `navigator.onLine` do navegador. Caso a ligação à internet do administrador caia no meio de uma operação, o painel congela preventivamente os botões de submissão de formulários e emite um alerta Toast fixo na tela, evitando erros de timeout e perda de preenchimento.
* **🛡️ Higienização e Sanitização Pré-Injeção:** Todos os formulários realizam máscaras de entrada locais e validações via expressões regulares (Regex). Caracteres proibidos de SQL Injection e tags HTML agressivas (como `<script>`) são neutralizados localmente pelo React antes mesmo de tocarem a rede, aplicando o conceito de defesa em profundidade.

-----

## 🎨 Estrutura Visual e Fluxo de Navegação

O Frontend opera como uma **Single Page Application (SPA)** otimizada com **Lazy Loading (Code Splitting)**. Os arquivos das páginas são descarregados na rede sob demanda apenas quando clicados, utilizando componentes `<Suspense>` para garantir transições fluidas e loaders de carregamento.

### 🗺️ Mapa Lógico de Roteamento

```text
                      [ Usuário acessa o Painel ]
                                   │
                                   ▼
                        [ App.tsx (Roteador) ]
                                   │
                ┌──────────────────┴──────────────────┐
                ▼                                     ▼
      [ Rota Pública: /login ]             [ Rotas Privadas ]
                │                                     │
        (Autenticação OK)                             ▼
                │                         [ Componente RotaProtegida ]
                │                                     │
                │                         ┌───────────┴───────────┐
                │                         ▼ (Sem Sessão)          ▼ (Sessão OK)
                │                  [ Expele para /login ]     [ Carrega AppLayout ]
                │                                                     │
                └─────────────────────────────────────────────────────┼────────────────────────┐
                                                                      │                        │
                                    ┌──────────────────┬───────────────┼───────────────┐        │
                                    ▼                  ▼               ▼               ▼        ▼
                            [ / (Dashboard) ]   [ /usuarios ]  [ /instituicoes ] [ /campanhas ] [ /alertas ]
                                                                                       │
                                                                                       ▼
                                                                             [ /campanhas/:id ]
```

---

## 🔒 Arquitetura de Segurança Implementada

1. **JWT Request Interceptor:** O arquivo de serviço `api.ts` intercepta automaticamente todas as requisições enviadas ao Java. Se houver um token guardado no `localStorage`, injeta o cabeçalho `Authorization: Bearer <TOKEN>`, protegendo as chamadas de rede.
2. **Sessão Autolimpante (HTTP 401 Response Guard):** Caso a API Java retorne uma falha de autenticação ou token expirado (HTTP 401), o interceptor de resposta limpa o cache local de forma transparente e ejeta o usuário de volta para a tela de `/login`.
3. **Responsividade com Bloqueio de Visibilidade:** O componente `AppLayout.tsx` oculta a barra lateral em telas pequenas de smartphones, disponibilizando um botão de acesso (hambúrguer) com máscara de fundo escura (`overlay`), impedindo a exposição acidental de relatórios corporativos.

---

## ⚙️ Instalação, Configuração e Execução

### 1. Declaração do Ambiente de Tipos do Vite

Para garantir que o TypeScript reconheça os arquivos estáticos e variáveis do cliente, certifique-se de que o arquivo abaixo exista na raiz da pasta `src/`:

**Ficheiro:** `src/vite-env.d.ts`

```typescript
/// <reference types="vite/client" />

```

### 2. Instalação Automática de Dependências

Abra o terminal do seu computador (or o terminal embutido do VS Code), navegue até a pasta raiz clonada do repositório frontend e execute o comando de instalação do Node Package Manager:

```bash
npm install

```

*Este comando fará o download e estruturação automática de todas as bibliotecas listadas no módulo de dependências deste documento dentro da pasta local `node_modules/`.*

### 3. Execução do Servidor Local (Ambiente de Desenvolvimento)

Para subir o servidor local com espelhamento de alterações em tempo real (Hot-Reload), execute:

```bash
npm run dev

```

* O painel administrativo estará acessível no seu navegador através do endereço padrão: `http://localhost:5173`.

### 4. Compilação de Produção (Build)

Para minificar o código, otimizar o carregamento de CSS/JS e preparar o Frontend para ser hospedado em servidores de produção como o Nginx, utilize o script:

```bash
npm run build

```

* Os arquivos finais otimizados serão gerados dentro do diretório `/dist` criado na raiz.

---

© 2026 Conecta à Vida. Sistema homologado para fins acadêmicos. IFSP Bragança Paulista.
