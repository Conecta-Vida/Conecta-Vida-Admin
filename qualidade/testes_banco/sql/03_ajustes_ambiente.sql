-- No Supabase toda tabela do schema public tem RLS ligada (RNF01). A tabela
-- dependentes foi criada pelo Flyway (V2), que não liga a RLS; no projeto
-- isso foi feito pelo painel do Supabase. Aqui ligamos para reproduzir a
-- produção.
alter table public.dependentes enable row level security;
grant select, insert, update, delete on public.dependentes to authenticated;
