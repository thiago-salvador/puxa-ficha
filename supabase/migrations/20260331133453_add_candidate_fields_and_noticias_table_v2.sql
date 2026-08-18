
ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS genero text;
ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS estado_civil text;
ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS cor_raca text;
ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS email_campanha text;

CREATE TABLE IF NOT EXISTS noticias_candidato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid REFERENCES candidatos(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  fonte text,
  url text NOT NULL,
  data_publicacao timestamptz,
  snippet text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(candidato_id, url)
);

CREATE INDEX IF NOT EXISTS idx_noticias_candidato_id ON noticias_candidato(candidato_id);
CREATE INDEX IF NOT EXISTS idx_noticias_data ON noticias_candidato(data_publicacao DESC);

ALTER TABLE noticias_candidato ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'noticias_candidato' AND policyname = 'noticias_read') THEN
    CREATE POLICY noticias_read ON noticias_candidato FOR SELECT USING (true);
  END IF;
END $$;
;
