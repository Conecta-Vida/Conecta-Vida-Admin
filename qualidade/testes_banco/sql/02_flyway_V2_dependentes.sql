-- Estrutura aditiva para dependentes e inscrições por participante.
-- Versão V2 porque os ambientes existentes usam baseline-on-migrate=true (baseline padrão 1).
-- O script é idempotente para permitir aplicação manual no Supabase antes do deploy.

CREATE TABLE IF NOT EXISTS public.dependentes (
    id BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
    usuario_titular_id BIGINT NOT NULL,
    nome_completo VARCHAR(150) NOT NULL,
    data_nascimento DATE NOT NULL,
    parentesco VARCHAR(50) NOT NULL,
    sexo VARCHAR(20),
    criado_em TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT dependentes_pkey PRIMARY KEY (id),
    CONSTRAINT fk_dependente_usuario
        FOREIGN KEY (usuario_titular_id)
        REFERENCES public.usuarios (id)
        ON DELETE CASCADE
);

ALTER TABLE public.dependentes
    ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_dependentes_titular_ativo
    ON public.dependentes (usuario_titular_id, ativo);

ALTER TABLE public.usuarios_campanhas
    ADD COLUMN IF NOT EXISTS dependente_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_usuarios_campanhas_dependente_id'
          AND conrelid = 'public.usuarios_campanhas'::regclass
    ) THEN
        ALTER TABLE public.usuarios_campanhas
            ADD CONSTRAINT fk_usuarios_campanhas_dependente_id
            FOREIGN KEY (dependente_id)
            REFERENCES public.dependentes (id)
            ON DELETE CASCADE;
    END IF;
END $$;

-- Remove a unicidade antiga (titular, campanha), se existir.
-- A nova regra permite um titular e vários dependentes na mesma campanha,
-- mas impede duplicar a inscrição de uma mesma pessoa.
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN
        SELECT c.conname
        FROM pg_constraint c
        WHERE c.conrelid = 'public.usuarios_campanhas'::regclass
          AND c.contype = 'u'
          AND (
              SELECT array_agg(a.attname::text ORDER BY a.attname::text)
              FROM unnest(c.conkey) AS key_col(attnum)
              JOIN pg_attribute a
                ON a.attrelid = c.conrelid
               AND a.attnum = key_col.attnum
          ) = ARRAY['comunicacao_id', 'usuario_id']::text[]
    LOOP
        EXECUTE format(
            'ALTER TABLE public.usuarios_campanhas DROP CONSTRAINT %I',
            constraint_record.conname
        );
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_campanhas_titular_comunicacao
    ON public.usuarios_campanhas (usuario_id, comunicacao_id)
    WHERE dependente_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_campanhas_dependente_comunicacao
    ON public.usuarios_campanhas (usuario_id, comunicacao_id, dependente_id)
    WHERE dependente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_campanhas_dependente_id
    ON public.usuarios_campanhas (dependente_id);
