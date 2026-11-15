import { createClient } from '@supabase/supabase-js';

// Endereço e chave PÚBLICA do projeto Supabase. Podem ficar no código do
// navegador: quem protege os dados são as regras de acesso (RLS) do banco.
// Para apontar para outro projeto, defina as variáveis no build (Netlify).
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://pborxjuuexiqollesfxw.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  'sb_publishable_BEMytsJ8eC0DdQt6vI7PCg_vfy7UDRd';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
