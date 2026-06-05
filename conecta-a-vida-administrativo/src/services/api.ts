import axios from 'axios';

// ===================================================================
// CONTRATOS DE DADOS / INTERFACES (ALINHADOS COM AS ENTIDADES JAVA)
// ===================================================================

export interface Usuario {
  id?: number;
  nome: string;
  email: string;
  senha?: string;
  idade?: number;
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
}

export interface LogAtividade {
  id?: number;
  usuario?: Usuario;
  acao: string;
  dataHora: string;
}

export interface Alerta {
  id?: number;
  tipo?: 'ALERTA';
  categoria: string; 
  titulo: string;
  descricao: string;
  localizacao?: string;
  lido: boolean;
  dataPostada?: string;
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
// CONFIGURAÇÃO CENTRAL DA INSTÂNCIA DO AXIOS
// ===================================================================

const api = axios.create({
  baseURL: 'http://localhost:8080/api', // Endereço IP local da API Spring Boot
  timeout: 12000, // Cancela a requisição caso o servidor demore mais de 12 segundos
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * 🔒 INTERCEPTOR DE REQUISIÇÃO (REQUEST)
 * Explicação para a banca: Intercepta qualquer chamada que sai do React para o Java.
 * Se houver um token guardado no localStorage vindo do login, injeta-o automaticamente
 * no cabeçalho Authorization como um token Bearer, protegendo a rota no back-end.
 */
api.interceptors.request.use(
  (config) => {
    const dadosSessao = localStorage.getItem('@conecta:admin');
    if (dadosSessao) {
      const { token } = JSON.parse(dadosSessao);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * 🛡️ INTERCEPTOR DE RESPOSTA (RESPONSE)
 * Se o back-end Java retornar HTTP 401 (Não Autorizado), significa que a sessão expirou.
 * O interceptor limpa o lixo de cache na hora e desloga o usuário por segurança.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('@conecta:admin');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ===================================================================
// MAPEAMENTO DOS MICROSSERVIÇOS DA API (SERVICOS ASSÍNCRONOS)
// ===================================================================

export const authService = {
  login: async (email: string, senha: string): Promise<any> => {
    const response = await api.post('/auth/login', { email, senha });
    return response.data;
  },
  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  }
};

export const usuarioService = {
  listarTodos: async (): Promise<Usuario[]> => {
    const response = await api.get('/usuarios');
    return response.data;
  },
  cadastrar: async (dados: Usuario): Promise<Usuario> => {
    const response = await api.post('/usuarios', dados);
    return response.data;
  },
  atualizar: async (id: number, dados: Usuario): Promise<Usuario> => {
    const response = await api.put(`/usuarios/${id}`, dados);
    return response.data;
  },
  deletar: async (id: number): Promise<void> => {
    await api.delete(`/usuarios/${id}`);
  },
  importarCsv: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/usuarios/importar-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  }
};

export const instituicaoService = {
  listarTodas: async (): Promise<InstituicaoSaude[]> => {
    const response = await api.get('/instituicoes');
    return response.data;
  },
  cadastrar: async (dados: InstituicaoSaude): Promise<InstituicaoSaude> => {
    const response = await api.post('/instituicoes', dados);
    return response.data;
  },
  atualizar: async (id: number, dados: InstituicaoSaude): Promise<InstituicaoSaude> => {
    const response = await api.put(`/instituicoes/${id}`, dados);
    return response.data;
  },
  deletar: async (id: number): Promise<void> => {
    await api.delete(`/api/comunicacoes/${id}`); // Executa a exclusão polimórfica centralizada
  }
};

export const campanhaService = {
  listarTodas: async (): Promise<Campanha[]> => {
    const response = await api.get('/campanhas');
    return response.data;
  },
  buscarPorId: async (id: number): Promise<Campanha> => {
    const response = await api.get(`/campanhas/${id}`);
    return response.data;
  },
  cadastrar: async (dados: Campanha): Promise<Campanha> => {
    const response = await api.post('/comunicacoes', { ...dados, tipo: 'CAMPANHA' });
    return response.data;
  },
  atualizar: async (id: number, dados: Campanha): Promise<Campanha> => {
    const response = await api.put(`/campanhas/${id}`, dados);
    return response.data;
  },
  deletar: async (id: number): Promise<void> => {
    await api.delete(`/campanhas/${id}`);
  }
};

export const alertaService = {
  listarTodos: async (): Promise<Alerta[]> => {
    const response = await api.get('/alertas/ativos');
    return response.data;
  },
  cadastrar: async (dados: Alerta): Promise<Alerta> => {
    const response = await api.post('/comunicacoes', { ...dados, tipo: 'ALERTA', lido: false });
    return response.data;
  },
  // 🟢 CORRIGIDO E ATIVADO: Método que faltava e causava o erro de compilação 2339 no Alertas.tsx
  atualizar: async (id: number, dados: Alerta): Promise<Alerta> => {
    const response = await api.put(`/alertas/${id}`, dados);
    return response.data;
  },
  marcarComoLido: async (id: number): Promise<void> => {
    await api.put(`/alertas/${id}`, { lido: true });
  },
  deletar: async (id: number): Promise<void> => {
    await api.delete(`/alertas/${id}`);
  }
};

export const dashboardService = {
  getStats: async (): Promise<DashboardStats> => {
    const response = await api.get('/dashboard/stats');
    return response.data;
  },
  getChartData: async (): Promise<ChartData[]> => {
    const response = await api.get('/dashboard/chart');
    return response.data;
  }
};

export const logService = {
  listarRecentes: async (): Promise<LogAtividade[]> => {
    const response = await api.get('/dashboard/logs/recentes');
    return response.data;
  }
};

export const relatorioService = {
  getUrlDownloadPdf: (): string => {
    return 'http://localhost:8080/api/relatorios/usuarios';
  },
  getUrlExportarCsv: (): string => {
    return 'http://localhost:8080/api/usuarios/exportar-csv';
  }
};

export default api;