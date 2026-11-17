import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase';

// ===================================================================
// CONTRATOS DE DADOS / INTERFACES (ALINHADOS COM AS TABELAS DO SUPABASE)
// ===================================================================

export interface Usuario {
  id?: number;
  nome: string;
  email: string;
  senha?: string;
  dataNascimento?: number; // 🟢 Alterado de idade para dataNascimento
  sexo?: string;
  localizacao?: string; 
  permissao?: string;
}

export interface InstituicaoSaude {
  id?: number;
  tipoInstituicao: string; 
  nome: string;
  email?: string;
  telefone?: string;
  linksite?: string;
  endereco?: string;
  horarioSegSex?: string;
  horarioSabado?: string;
  horarioDomingo?: string;
  /** Código IBGE do município (unidades vindas do CNES). */
  codigoMunicipio?: number;
  /** Veio do cadastro oficial do CNES. */
  doCnes?: boolean;
}

export interface Municipio { codigo: number; nome: string; uf: string; }

export interface LogAtividade {
  id?: number;
  usuario?: Usuario;
  acao: string;
  dataHora: string;
}

export interface Alerta {
  id?: number;
  tipo?: 'ALERTA' | 'NOTICIA';
  status?: string;
  linkimagem?: string;
  categoria: string; 
  titulo: string;
  descricao: string;
  localizacao?: string;
  lido: boolean;
  dataPostada?: string;
  /** Link da matéria original (notícias importadas). */
  fonteUrl?: string;
  /** Instituição de saúde que publica (órgão, UBS, hospital...). */
  instituicaoId?: number | null;
}

export interface Campanha {
  id?: number;
  tipo?: 'CAMPANHA';
  titulo: string;
  descricao: string;
  categoria?: string;
  linkimagem?: string;
  localizacao?: string;
  dataInicio: string;
  dataFim: string;
  publicoAlvo?: string;
  status: string;
  /** Instituição de saúde responsável pela campanha. */
  instituicaoId?: number | null;
}

export interface InscritoCampanha {
  id: number;
  /** Quem vai participar (o titular ou o dependente). */
  participante: string;
  /** "Titular" ou o parentesco do dependente. */
  vinculo: string;
  /** Dono da conta que fez a inscrição. */
  responsavel: string;
  emailResponsavel: string;
  dataInscricao: string;
}

export interface DashboardStats {
  totalUsuarios: number;
  alertasAtivos: number;
  campanhasAtivas: number;
  noticiasPublicadas: number;
}

export interface ChartData {
  mes: string;
  quantidade: number;
}

// ===================================================================
// ACESSO AOS DADOS: SUPABASE DIRETO (SEM API JAVA)
// O painel fala com o banco pela API do Supabase. Quem decide o que cada
// conta pode ler ou gravar são as regras de acesso (RLS) do próprio banco;
// este arquivo apenas traduz os nomes das colunas para os usados nas telas.
// ===================================================================

export const CHAVE_SESSAO = '@conecta:admin';

/** Transforma o erro do Supabase em uma mensagem legível para o toast. */
function falhar(error: { message?: string; code?: string } | null, contexto: string): never {
  const detalhe = error?.message ?? 'erro desconhecido';
  if (error?.code === '42501' || /row-level security|permission denied/i.test(detalhe)) {
    throw new Error(`${contexto}: sua conta não tem permissão para esta ação.`);
  }
  throw new Error(`${contexto}: ${detalhe}`);
}

const vazioParaNulo = <T,>(valor: T | '' | undefined): T | null =>
  valor === '' || valor === undefined ? null : (valor as T);

/** Datas do formulário (aaaa-mm-dd ou ISO) no formato aceito pelo banco. */
const dataParaBanco = (valor?: string): string | null => {
  if (!valor) return null;
  return valor.length === 10 ? `${valor}T00:00:00` : valor;
};

// ---------- Usuários ----------
const COLUNAS_USUARIO = 'id, nome, email, sexo, localizacao, permissao, data_nascimento';

type LinhaUsuario = {
  id: number; nome: string; email: string; sexo: string | null;
  localizacao: string | null; permissao: string; data_nascimento: number | null;
};

const paraUsuario = (l: LinhaUsuario): Usuario => ({
  id: l.id,
  nome: l.nome,
  email: l.email,
  sexo: l.sexo ?? undefined,
  localizacao: l.localizacao ?? undefined,
  permissao: l.permissao,
  dataNascimento: l.data_nascimento ?? undefined,
});

/** Chama a Edge Function que cria contas (exige administrador). */
async function criarConta(dados: Usuario): Promise<Usuario> {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', {
    body: {
      nome: dados.nome,
      email: dados.email,
      senha: dados.senha,
      sexo: dados.sexo,
      localizacao: dados.localizacao,
      data_nascimento: dados.dataNascimento,
      permissao: dados.permissao,
    },
  });
  if (error) {
    // A função devolve { mensagem } com o motivo em português.
    let mensagem = error.message;
    try {
      const corpo = await (error as { context?: Response }).context?.json();
      if (corpo?.mensagem) mensagem = corpo.mensagem;
    } catch { /* mantém a mensagem padrão */ }
    throw new Error(mensagem);
  }
  return paraUsuario(data.usuario as LinhaUsuario);
}

export const authService = {
  /** Login do painel: só entra quem tem permissão de Administrador. */
  login: async (email: string, senha: string): Promise<any> => {
    let { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    // Conta criada pela antiga API Java: confere a senha antiga, cria o login
    // no Supabase com ela e tenta de novo.
    if (error && /invalid login credentials/i.test(error.message)) {
      const { data: migracao } = await supabase.functions.invoke('entrar-conta-antiga', {
        body: { email: email.trim(), senha },
      });
      if (migracao?.migrada) {
        ({ data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha }));
      }
    }
    if (error) {
      throw new Error(
        /invalid login credentials/i.test(error.message)
          ? 'E-mail ou senha incorretos.'
          : /email not confirmed/i.test(error.message)
            ? 'Confirme seu e-mail antes de entrar.'
            : error.message,
      );
    }
    if (!data.user || !data.session) throw new Error('Não foi possível entrar. Tente novamente.');
    const { data: perfil, error: erroPerfil } = await supabase
      .from('usuarios').select(COLUNAS_USUARIO).eq('auth_id', data.user.id).maybeSingle();
    if (erroPerfil || !perfil) {
      await supabase.auth.signOut();
      throw new Error('Perfil não encontrado para esta conta.');
    }
    if (perfil.permissao !== 'Administrador') {
      await supabase.auth.signOut();
      throw new Error('Acesso restrito a administradores.');
    }
    return { ...paraUsuario(perfil as LinhaUsuario), token: data.session.access_token };
  },
  /** O login com Microsoft está ligado no Supabase? (o botão só aparece se estiver) */
  microsoftDisponivel: async (): Promise<boolean> => {
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      });
      return Boolean((await r.json())?.external?.azure);
    } catch {
      return false;
    }
  },
  /** Vai para a tela de login da Microsoft; volta para /login com a sessão. */
  loginMicrosoft: async (): Promise<void> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { scopes: 'email', redirectTo: `${window.location.origin}/login` },
    });
    if (error) throw new Error(error.message);
  },
  /**
   * Depois de voltar da Microsoft: confere se a conta é de administrador.
   * Devolve null quando não há sessão (ainda não houve login).
   */
  concluirLoginExterno: async (): Promise<any | null> => {
    const { data } = await supabase.auth.getSession();
    const sessao = data.session;
    if (!sessao) return null;
    const { data: perfil } = await supabase
      .from('usuarios').select(COLUNAS_USUARIO).eq('auth_id', sessao.user.id).maybeSingle();
    if (!perfil || perfil.permissao !== 'Administrador') {
      await supabase.auth.signOut();
      throw new Error(perfil ? 'Acesso restrito a administradores.' : 'Perfil não encontrado para esta conta.');
    }
    return { ...paraUsuario(perfil as LinhaUsuario), token: sessao.access_token };
  },
  logout: async (): Promise<void> => {
    localStorage.removeItem(CHAVE_SESSAO);
    await supabase.auth.signOut();
  },
  /** Existe uma sessão válida do Supabase neste navegador? */
  temSessao: async (): Promise<boolean> => {
    const { data } = await supabase.auth.getSession();
    return data.session !== null;
  },
  /** Envia o e-mail com o link para criar uma nova senha. */
  solicitarRecuperacao: async (email: string): Promise<void> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    if (error) throw new Error(error.message);
  },
  /** Grava a nova senha (usado na página aberta pelo link do e-mail). */
  definirNovaSenha: async (senha: string): Promise<void> => {
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) throw new Error(error.message);
  },
};

export const usuarioService = {
  /** Administrador define uma nova senha para outro usuário. */
  definirSenha: async (usuarioId: number, senha: string): Promise<void> => {
    const { error } = await supabase.functions.invoke('admin-usuarios', {
      body: { acao: 'definir_senha', usuario_id: usuarioId, senha },
    });
    if (error) {
      let mensagem = error.message;
      try {
        const corpo = await (error as { context?: Response }).context?.json();
        if (corpo?.mensagem) mensagem = corpo.mensagem;
      } catch { /* mantém a mensagem padrão */ }
      throw new Error(mensagem);
    }
  },
  listarTodos: async (): Promise<Usuario[]> => {
    const { data, error } = await supabase.from('usuarios').select(COLUNAS_USUARIO).order('nome');
    if (error) falhar(error, 'Não foi possível listar os usuários');
    return (data as LinhaUsuario[]).map(paraUsuario);
  },
  cadastrar: async (dados: Usuario): Promise<Usuario> => criarConta(dados),
  atualizar: async (id: number, dados: Usuario): Promise<Usuario> => {
    const { data, error } = await supabase.from('usuarios').update({
      nome: dados.nome,
      sexo: vazioParaNulo(dados.sexo),
      localizacao: vazioParaNulo(dados.localizacao),
      data_nascimento: dados.dataNascimento ?? null,
    }).eq('id', id).select(COLUNAS_USUARIO).single();
    if (error) falhar(error, 'Não foi possível atualizar o usuário');
    let usuario = paraUsuario(data as LinhaUsuario);

    // A permissão é alterada por uma função do banco que confere se quem pede é administrador.
    if (dados.permissao && dados.permissao !== usuario.permissao) {
      const { error: erroPermissao } = await supabase.rpc('admin_definir_permissao', {
        p_usuario_id: id, p_permissao: dados.permissao,
      });
      if (erroPermissao) falhar(erroPermissao, 'Não foi possível alterar a permissão');
      usuario = { ...usuario, permissao: dados.permissao };
    }
    return usuario;
  },
  deletar: async (id: number): Promise<void> => {
    const { error } = await supabase.rpc('admin_excluir_usuario', { p_usuario_id: id });
    if (error) falhar(error, 'Não foi possível remover o usuário');
  },
  /**
   * Importa usuários de um CSV com cabeçalho. Colunas aceitas (em qualquer ordem):
   * nome, email, senha, sexo, localizacao, data_nascimento, permissao.
   */
  importarCsv: async (file: File): Promise<string> => {
    const linhas = (await file.text()).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (linhas.length < 2) throw new Error('O arquivo precisa de um cabeçalho e ao menos uma linha.');
    const separador = linhas[0].includes(';') ? ';' : ',';
    const colunas = linhas[0].split(separador).map((c) => c.trim().toLowerCase().replace(/^"|"$/g, ''));
    if (!colunas.includes('nome') || !colunas.includes('email')) {
      throw new Error('O cabeçalho do CSV precisa ter as colunas "nome" e "email".');
    }

    let criados = 0;
    const falhas: string[] = [];
    for (const linha of linhas.slice(1)) {
      const valores = linha.split(separador).map((v) => v.trim().replace(/^"|"$/g, ''));
      const campo = (nome: string) => valores[colunas.indexOf(nome)] ?? '';
      const nascimento = Number.parseInt(campo('data_nascimento'), 10);
      try {
        await criarConta({
          nome: campo('nome'),
          email: campo('email'),
          senha: campo('senha') || '123456',
          sexo: campo('sexo') || undefined,
          localizacao: campo('localizacao') || undefined,
          dataNascimento: Number.isNaN(nascimento) ? undefined : nascimento,
          permissao: campo('permissao') || 'Usuário Comum',
        });
        criados += 1;
      } catch (e) {
        falhas.push(`${campo('email') || linha}: ${(e as Error).message}`);
      }
    }
    const resumo = `${criados} usuário(s) importado(s)`;
    return falhas.length ? `${resumo}; ${falhas.length} com erro (${falhas.slice(0, 3).join(' | ')})` : `${resumo}.`;
  },
};

// ---------- Instituições ----------
type LinhaInstituicao = {
  id: number; tipo_instituicao: string; nome: string; email: string | null; telefone: string | null;
  linksite: string | null; endereco: string | null; horario_seg_sex: string | null;
  horario_sabado: string | null; horario_domingo: string | null;
  codigo_municipio?: number | null; codigo_cnes?: number | null;
};

const paraInstituicao = (l: LinhaInstituicao): InstituicaoSaude => ({
  id: l.id,
  tipoInstituicao: l.tipo_instituicao,
  nome: l.nome,
  email: l.email ?? undefined,
  telefone: l.telefone ?? undefined,
  linksite: l.linksite ?? undefined,
  endereco: l.endereco ?? undefined,
  horarioSegSex: l.horario_seg_sex ?? undefined,
  horarioSabado: l.horario_sabado ?? undefined,
  horarioDomingo: l.horario_domingo ?? undefined,
  codigoMunicipio: l.codigo_municipio ?? undefined,
  doCnes: l.codigo_cnes != null,
});

const instituicaoParaBanco = (d: InstituicaoSaude) => ({
  tipo_instituicao: d.tipoInstituicao,
  nome: d.nome,
  email: vazioParaNulo(d.email),
  telefone: d.telefone ?? '',
  linksite: vazioParaNulo(d.linksite),
  endereco: vazioParaNulo(d.endereco),
  horario_seg_sex: vazioParaNulo(d.horarioSegSex),
  horario_sabado: vazioParaNulo(d.horarioSabado),
  horario_domingo: vazioParaNulo(d.horarioDomingo),
});

export const instituicaoService = {
  /** Nomes dos municípios (IBGE) que aparecem na lista de unidades. */
  municipios: async (codigos: number[]): Promise<Municipio[]> => {
    if (codigos.length === 0) return [];
    const { data, error } = await supabase.from('municipios_ibge').select('codigo, nome, uf').in('codigo', codigos).order('nome');
    if (error) falhar(error, 'Não foi possível carregar as cidades');
    return (data ?? []) as Municipio[];
  },
  listarTodas: async (): Promise<InstituicaoSaude[]> => {
    const { data, error } = await supabase.from('instituicoes_saude').select('*').order('nome');
    if (error) falhar(error, 'Não foi possível listar as instituições');
    return (data as LinhaInstituicao[]).map(paraInstituicao);
  },
  cadastrar: async (dados: InstituicaoSaude): Promise<InstituicaoSaude> => {
    const { data, error } = await supabase.from('instituicoes_saude')
      .insert(instituicaoParaBanco(dados)).select().single();
    if (error) falhar(error, 'Não foi possível cadastrar a instituição');
    return paraInstituicao(data as LinhaInstituicao);
  },
  atualizar: async (id: number, dados: InstituicaoSaude): Promise<InstituicaoSaude> => {
    const { data, error } = await supabase.from('instituicoes_saude')
      .update(instituicaoParaBanco(dados)).eq('id', id).select().single();
    if (error) falhar(error, 'Não foi possível atualizar a instituição');
    return paraInstituicao(data as LinhaInstituicao);
  },
  deletar: async (id: number): Promise<void> => {
    const { error } = await supabase.from('instituicoes_saude').delete().eq('id', id);
    if (error) {
      if (error.code === '23503') {
        throw new Error('Esta instituição possui comunicações publicadas e não pode ser removida.');
      }
      falhar(error, 'Não foi possível remover a instituição');
    }
  },
};

// ---------- Comunicações (campanhas, alertas e notícias na mesma tabela) ----------
type LinhaComunicacao = {
  id: number; tipo: string; instituicao_id: number | null; titulo: string; descricao: string;
  categoria: string | null; linkimagem: string | null; localizacao: string | null;
  publico_alvo: string | null; status: string | null; lido: boolean | null;
  data_postada: string | null; data_inicio: string | null; data_fim: string | null;
  fonte_url?: string | null;
};

const paraCampanha = (l: LinhaComunicacao): Campanha => ({
  id: l.id,
  tipo: 'CAMPANHA',
  titulo: l.titulo,
  descricao: l.descricao,
  categoria: l.categoria ?? undefined,
  linkimagem: l.linkimagem ?? undefined,
  localizacao: l.localizacao ?? undefined,
  dataInicio: l.data_inicio ?? '',
  dataFim: l.data_fim ?? '',
  publicoAlvo: l.publico_alvo ?? undefined,
  status: l.status ?? 'ATIVA',
  instituicaoId: l.instituicao_id,
});

const campanhaParaBanco = (d: Partial<Campanha>) => ({
  ...(d.titulo !== undefined && { titulo: d.titulo }),
  ...(d.descricao !== undefined && { descricao: d.descricao }),
  ...(d.categoria !== undefined && { categoria: vazioParaNulo(d.categoria) }),
  ...(d.linkimagem !== undefined && { linkimagem: vazioParaNulo(d.linkimagem) }),
  ...(d.localizacao !== undefined && { localizacao: vazioParaNulo(d.localizacao) }),
  ...(d.publicoAlvo !== undefined && { publico_alvo: vazioParaNulo(d.publicoAlvo) }),
  ...(d.status !== undefined && { status: d.status }),
  ...(d.dataInicio !== undefined && { data_inicio: dataParaBanco(d.dataInicio) }),
  ...(d.dataFim !== undefined && { data_fim: dataParaBanco(d.dataFim) }),
  ...(d.instituicaoId !== undefined && { instituicao_id: d.instituicaoId }),
});

export const campanhaService = {
  listarTodas: async (): Promise<Campanha[]> => {
    const { data, error } = await supabase.from('comunicacoes').select('*')
      .ilike('tipo', 'campanha').order('data_postada', { ascending: false });
    if (error) falhar(error, 'Não foi possível listar as campanhas');
    return (data as LinhaComunicacao[]).map(paraCampanha);
  },
  buscarPorId: async (id: number): Promise<Campanha> => {
    const { data, error } = await supabase.from('comunicacoes').select('*').eq('id', id).single();
    if (error) falhar(error, 'Campanha não encontrada');
    return paraCampanha(data as LinhaComunicacao);
  },
  /** Pessoas inscritas na campanha: o titular da conta ou um dependente dele. */
  listarInscritos: async (id: number): Promise<InscritoCampanha[]> => {
    const { data, error } = await supabase.from('usuarios_campanhas')
      .select('id, data_inscricao, usuario:usuarios(nome, email), dependente:dependentes(nome_completo, parentesco)')
      .eq('comunicacao_id', id).order('data_inscricao', { ascending: false });
    if (error) falhar(error, 'Não foi possível listar os inscritos');
    return (data as any[]).map((l) => ({
      id: l.id,
      participante: l.dependente?.nome_completo ?? l.usuario?.nome ?? 'Usuário removido',
      vinculo: l.dependente ? (l.dependente.parentesco || 'Dependente') : 'Titular',
      responsavel: l.usuario?.nome ?? '',
      emailResponsavel: l.usuario?.email ?? '',
      dataInscricao: l.data_inscricao ?? '',
    }));
  },
  /** Total de inscritos de cada campanha, em uma única consulta. */
  contarInscritosPorCampanha: async (): Promise<Record<number, number>> => {
    const { data, error } = await supabase.from('usuarios_campanhas').select('comunicacao_id');
    if (error) falhar(error, 'Não foi possível contar os inscritos');
    const totais: Record<number, number> = {};
    for (const linha of data as { comunicacao_id: number }[]) {
      totais[linha.comunicacao_id] = (totais[linha.comunicacao_id] ?? 0) + 1;
    }
    return totais;
  },
  /** Quantas pessoas (titulares e dependentes) estão inscritas na campanha. */
  contarInscritos: async (id: number): Promise<number> => {
    const { count, error } = await supabase.from('usuarios_campanhas')
      .select('id', { count: 'exact', head: true }).eq('comunicacao_id', id);
    if (error) falhar(error, 'Não foi possível contar os inscritos');
    return count ?? 0;
  },
  cadastrar: async (dados: Campanha): Promise<Campanha> => {
    const { data, error } = await supabase.from('comunicacoes')
      .insert({ ...campanhaParaBanco(dados), tipo: 'CAMPANHA', lido: false }).select().single();
    if (error) falhar(error, 'Não foi possível publicar a campanha');
    return paraCampanha(data as LinhaComunicacao);
  },
  atualizar: async (id: number, dados: Partial<Campanha>): Promise<Campanha> => {
    const { data, error } = await supabase.from('comunicacoes')
      .update(campanhaParaBanco(dados)).eq('id', id).select().single();
    if (error) falhar(error, 'Não foi possível atualizar a campanha');
    return paraCampanha(data as LinhaComunicacao);
  },
  encerrar: async (id: number): Promise<Campanha> => campanhaService.atualizar(id, { status: 'ENCERRADA' }),
  deletar: async (id: number): Promise<void> => {
    const { error } = await supabase.from('comunicacoes').delete().eq('id', id);
    if (error) falhar(error, 'Não foi possível remover a campanha');
  },
};

const paraAlerta = (l: LinhaComunicacao): Alerta => ({
  id: l.id,
  tipo: l.tipo.toUpperCase() === 'NOTICIA' ? 'NOTICIA' : 'ALERTA',
  categoria: l.categoria ?? '',
  titulo: l.titulo,
  descricao: l.descricao,
  localizacao: l.localizacao ?? undefined,
  linkimagem: l.linkimagem ?? undefined,
  status: l.status ?? undefined,
  lido: l.lido ?? false,
  dataPostada: l.data_postada ?? undefined,
  fonteUrl: l.fonte_url ?? undefined,
  instituicaoId: l.instituicao_id,
});

const alertaParaBanco = (d: Partial<Alerta>) => ({
  ...(d.titulo !== undefined && { titulo: d.titulo }),
  ...(d.descricao !== undefined && { descricao: d.descricao }),
  ...(d.categoria !== undefined && { categoria: vazioParaNulo(d.categoria) }),
  ...(d.localizacao !== undefined && { localizacao: vazioParaNulo(d.localizacao) }),
  ...(d.linkimagem !== undefined && { linkimagem: vazioParaNulo(d.linkimagem) }),
  ...(d.lido !== undefined && { lido: d.lido }),
  ...(d.instituicaoId !== undefined && { instituicao_id: d.instituicaoId }),
});

/** Alertas e notícias têm os mesmos campos; só muda o tipo gravado. */
function servicoDeAvisos(tipo: 'ALERTA' | 'NOTICIA', nome: string) {
  return {
    listarTodos: async (): Promise<Alerta[]> => {
      const { data, error } = await supabase.from('comunicacoes').select('*')
        .ilike('tipo', tipo).order('data_postada', { ascending: false });
      if (error) falhar(error, `Não foi possível listar ${nome}`);
      return (data as LinhaComunicacao[]).map(paraAlerta);
    },
    cadastrar: async (dados: Alerta): Promise<Alerta> => {
      const { data, error } = await supabase.from('comunicacoes')
        .insert({ ...alertaParaBanco(dados), tipo, status: 'ATIVO', lido: false }).select().single();
      if (error) falhar(error, 'Não foi possível publicar');
      return paraAlerta(data as LinhaComunicacao);
    },
    atualizar: async (id: number, dados: Partial<Alerta>): Promise<Alerta> => {
      const { data, error } = await supabase.from('comunicacoes')
        .update(alertaParaBanco(dados)).eq('id', id).select().single();
      if (error) falhar(error, 'Não foi possível atualizar');
      return paraAlerta(data as LinhaComunicacao);
    },
    marcarComoLido: async (id: number): Promise<void> => {
      const { error } = await supabase.from('comunicacoes').update({ lido: true }).eq('id', id);
      if (error) falhar(error, 'Não foi possível atualizar');
    },
    /** Arquivar tira do app (status ARQUIVADO); reativar devolve. */
    definirArquivada: async (id: number, arquivada: boolean): Promise<void> => {
      const { error } = await supabase.from('comunicacoes')
        .update({ status: arquivada ? 'ARQUIVADO' : 'ATIVO', lido: arquivada }).eq('id', id);
      if (error) falhar(error, 'Não foi possível atualizar');
    },
    deletar: async (id: number): Promise<void> => {
      const { error } = await supabase.from('comunicacoes').delete().eq('id', id);
      if (error) falhar(error, 'Não foi possível remover');
    },
  };
}

export const alertaService = servicoDeAvisos('ALERTA', 'os alertas');

// ---------- Imagens (Supabase Storage) ----------
const BUCKET_IMAGENS = 'comunicacoes';
const TIPOS_DE_IMAGEM: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};

export const imagemService = {
  /** Envia a imagem de capa e devolve o endereço público para gravar em `linkimagem`. */
  enviar: async (arquivo: File): Promise<string> => {
    const extensao = TIPOS_DE_IMAGEM[arquivo.type];
    if (!extensao) throw new Error('Envie uma imagem PNG, JPG, WebP ou GIF.');
    if (arquivo.size > 5 * 1024 * 1024) throw new Error('A imagem precisa ter no máximo 5 MB.');

    const caminho = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extensao}`;
    const { error } = await supabase.storage.from(BUCKET_IMAGENS)
      .upload(caminho, arquivo, { contentType: arquivo.type, cacheControl: '31536000' });
    if (error) falhar(error, 'Não foi possível enviar a imagem');
    return supabase.storage.from(BUCKET_IMAGENS).getPublicUrl(caminho).data.publicUrl;
  },
};
export const noticiaService = servicoDeAvisos('NOTICIA', 'as notícias');

// ---------- Importação de dados oficiais ----------
export const importacaoService = {
  /**
   * Busca dados reais agora (a mesma função roda sozinha todo dia):
   * "noticias" = Ministério da Saúde; "unidades" = CNES, Bragança Paulista.
   * Devolve um resumo para mostrar ao administrador.
   */
  importar: async (alvo: 'noticias' | 'unidades'): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('importar-dados', { body: { alvo } });
    if (error) {
      let mensagem = error.message;
      try {
        const corpo = await (error as { context?: Response }).context?.json();
        if (corpo?.mensagem) mensagem = corpo.mensagem;
      } catch { /* mantém a mensagem padrão */ }
      throw new Error(mensagem);
    }
    if (alvo === 'noticias') {
      const r = data.noticias;
      return r.novas > 0
        ? `${r.novas} notícia(s) nova(s) do Ministério da Saúde publicada(s).`
        : 'Nenhuma notícia nova: o aplicativo já está em dia com o Ministério da Saúde.';
    }
    const r = data.unidades;
    return `Unidades do CNES: ${r.novas} nova(s) e ${r.atualizadas} atualizada(s).`;
  },
};

// ---------- Dashboard ----------
const contar = async (
  tabela: string,
  filtro?: (q: any) => any,
): Promise<number> => {
  let consulta: any = supabase.from(tabela).select('id', { count: 'exact', head: true });
  if (filtro) consulta = filtro(consulta);
  const { count, error } = await consulta;
  if (error) falhar(error, 'Não foi possível carregar os indicadores');
  return count ?? 0;
};

export const dashboardService = {
  getStats: async (): Promise<DashboardStats> => {
    const [totalUsuarios, alertasAtivos, campanhasAtivas, noticiasPublicadas] = await Promise.all([
      contar('usuarios'),
      // Alertas ainda não marcados como resolvidos/lidos.
      contar('comunicacoes', (q) => q.ilike('tipo', 'alerta').or('lido.is.null,lido.eq.false')),
      contar('comunicacoes', (q) => q.ilike('tipo', 'campanha').ilike('status', 'ativ%')),
      contar('comunicacoes', (q) => q.ilike('tipo', 'noticia')),
    ]);
    return { totalUsuarios, alertasAtivos, campanhasAtivas, noticiasPublicadas };
  },
  /** Comunicações publicadas em cada um dos últimos 6 meses (dados reais). */
  getChartData: async (): Promise<ChartData[]> => {
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
    const { data, error } = await supabase.from('comunicacoes').select('data_postada')
      .gte('data_postada', inicio.toISOString().slice(0, 10));
    if (error) falhar(error, 'Não foi possível carregar o gráfico');

    const serie = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1);
      return { chave: `${d.getFullYear()}-${d.getMonth()}`, mes: meses[d.getMonth()], quantidade: 0 };
    });
    for (const linha of data as { data_postada: string | null }[]) {
      if (!linha.data_postada) continue;
      const d = new Date(linha.data_postada);
      const item = serie.find((s) => s.chave === `${d.getFullYear()}-${d.getMonth()}`);
      if (item) item.quantidade += 1;
    }
    return serie.map(({ mes, quantidade }) => ({ mes, quantidade }));
  },
};

// ---------- Uso do aplicativo (indicadores reais) ----------
export interface UsoDoApp {
  campanhasMaisProcuradas: { id: number; titulo: string; total: number }[];
  inscricoesPorMes: ChartData[];
  dependentesAtivos: number;
  dependentesPendentes: number;
  inscricoesDeDependentes: number;
  totalInscricoes: number;
}

export interface DependenteAdmin {
  id: number;
  nome: string;
  parentesco: string;
  idade: number;
  status: 'ativo' | 'pendente' | 'revogado';
  origem: string;
  emailDependente: string;
  titularNome: string;
  titularEmail: string;
  criadoEm: string;
}

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const idadeEm = (nascimento: string) => {
  const n = new Date(`${nascimento}T00:00:00`);
  const hoje = new Date();
  let idade = hoje.getFullYear() - n.getFullYear();
  if (hoje.getMonth() < n.getMonth() || (hoje.getMonth() === n.getMonth() && hoje.getDate() < n.getDate())) idade--;
  return idade;
};

export const usoService = {
  /** Inscrições e dependentes: o que os cidadãos realmente fazem no app. */
  carregar: async (): Promise<UsoDoApp> => {
    const [inscricoes, dependentes] = await Promise.all([
      supabase.from('usuarios_campanhas').select('comunicacao_id, dependente_id, data_inscricao, campanha:comunicacoes(titulo)'),
      supabase.from('dependentes').select('status'),
    ]);
    if (inscricoes.error) falhar(inscricoes.error, 'Não foi possível carregar as inscrições');
    if (dependentes.error) falhar(dependentes.error, 'Não foi possível carregar os dependentes');

    const linhas = inscricoes.data as any[];
    const porCampanha = new Map<number, { id: number; titulo: string; total: number }>();
    for (const l of linhas) {
      const atual = porCampanha.get(l.comunicacao_id) ?? { id: l.comunicacao_id, titulo: l.campanha?.titulo ?? 'Campanha removida', total: 0 };
      atual.total += 1;
      porCampanha.set(l.comunicacao_id, atual);
    }

    const hoje = new Date();
    const serie = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - 5 + i, 1);
      return { chave: `${d.getFullYear()}-${d.getMonth()}`, mes: MESES_CURTOS[d.getMonth()], quantidade: 0 };
    });
    for (const l of linhas) {
      if (!l.data_inscricao) continue;
      const d = new Date(l.data_inscricao);
      const item = serie.find((s) => s.chave === `${d.getFullYear()}-${d.getMonth()}`);
      if (item) item.quantidade += 1;
    }

    const status = (dependentes.data as { status: string }[]).map((d) => d.status);
    return {
      campanhasMaisProcuradas: [...porCampanha.values()].sort((a, b) => b.total - a.total).slice(0, 5),
      inscricoesPorMes: serie.map(({ mes, quantidade }) => ({ mes, quantidade })),
      dependentesAtivos: status.filter((s) => s === 'ativo').length,
      dependentesPendentes: status.filter((s) => s === 'pendente').length,
      inscricoesDeDependentes: linhas.filter((l) => l.dependente_id !== null).length,
      totalInscricoes: linhas.length,
    };
  },
};

export const dependenteService = {
  /** Todos os vínculos titular–dependente, para acompanhamento (somente leitura). */
  listar: async (): Promise<DependenteAdmin[]> => {
    const { data, error } = await supabase.from('dependentes')
      .select('id, nome_completo, parentesco, data_nascimento, status, autorizacao_origem, email_dependente, criado_em, titular:usuarios(nome, email)')
      .order('criado_em', { ascending: false });
    if (error) falhar(error, 'Não foi possível listar os dependentes');
    return (data as any[]).map((d) => ({
      id: d.id,
      nome: d.nome_completo,
      parentesco: d.parentesco,
      idade: idadeEm(d.data_nascimento),
      status: d.status,
      origem: d.autorizacao_origem === 'aceite_do_dependente'
        ? 'Autorizado pelo dependente'
        : d.status === 'pendente' ? 'Aguardando o dependente' : 'Declaração do responsável',
      emailDependente: d.email_dependente ?? '',
      titularNome: d.titular?.nome ?? '—',
      titularEmail: d.titular?.email ?? '',
      criadoEm: d.criado_em,
    }));
  },
};

export const logService = {
  listarRecentes: async (): Promise<LogAtividade[]> => {
    const { data, error } = await supabase.from('logs_atividade')
      .select('id, acao, data_hora, usuario:usuarios(id, nome, email)')
      .order('data_hora', { ascending: false }).limit(10);
    if (error) falhar(error, 'Não foi possível carregar as atividades');
    return (data as any[]).map((l) => ({
      id: l.id,
      acao: l.acao,
      dataHora: l.data_hora,
      usuario: l.usuario ?? undefined,
    }));
  },
};

// ---------- Relatórios (gerados no navegador) ----------
const escaparHtml = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const relatorioService = {
  /** Baixa a lista de usuários em CSV (abre no Excel com acentos corretos). */
  exportarUsuariosCsv: async (): Promise<void> => {
    const usuarios = await usuarioService.listarTodos();
    const celula = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [
      ['id', 'nome', 'email', 'permissao', 'sexo', 'localizacao', 'data_nascimento'].join(';'),
      ...usuarios.map((u) =>
        [u.id, u.nome, u.email, u.permissao, u.sexo, u.localizacao, u.dataNascimento].map(celula).join(';')),
    ];
    const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `usuarios-conecta-vida-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  },
  /** Abre o relatório de usuários pronto para imprimir ou salvar como PDF. */
  imprimirUsuarios: async (): Promise<void> => {
    const usuarios = await usuarioService.listarTodos();
    const linhas = usuarios.map((u) => `<tr>
      <td>${u.id ?? ''}</td><td>${escaparHtml(u.nome)}</td><td>${escaparHtml(u.email)}</td>
      <td>${escaparHtml(u.permissao ?? '')}</td><td>${escaparHtml(u.localizacao ?? '')}</td></tr>`).join('');
    const janela = window.open('', '_blank');
    if (!janela) throw new Error('Permita pop-ups para gerar o relatório.');
    janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Relatório de usuários · Conecta Vida</title>
      <style>
        body { font-family: system-ui, sans-serif; margin: 32px; color: #0f172a; }
        h1 { font-size: 20px; margin: 0 0 4px; } p { color: #64748b; margin: 0 0 20px; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
        th { background: #f1f5f9; }
      </style></head><body>
      <h1>Relatório de usuários · Conecta Vida</h1>
      <p>${usuarios.length} usuário(s) · gerado em ${new Date().toLocaleString('pt-BR')}</p>
      <table><thead><tr><th>ID</th><th>Nome</th><th>E-mail</th><th>Permissão</th><th>Localização</th></tr></thead>
      <tbody>${linhas}</tbody></table>
      <script>window.onload = () => window.print();<\/script></body></html>`);
    janela.document.close();
  },
};

export { SUPABASE_URL };
