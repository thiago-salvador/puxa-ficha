BEGIN;

CREATE TABLE public.alert_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  email_hash TEXT NOT NULL UNIQUE,
  nome TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  verify_token_hash TEXT UNIQUE,
  verify_token_expires_at TIMESTAMPTZ,
  manage_token_hash TEXT NOT NULL UNIQUE,
  manage_token_ciphertext TEXT NOT NULL,
  canal_email BOOLEAN NOT NULL DEFAULT TRUE,
  consentimento_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_consentimento_hash TEXT,
  last_verification_email_sent_at TIMESTAMPTZ,
  last_digest_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_subscribers_verified ON public.alert_subscribers (verified, created_at DESC);
CREATE INDEX idx_alert_subscribers_last_verification_email_sent_at
  ON public.alert_subscribers (last_verification_email_sent_at DESC);

CREATE TABLE public.alert_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID NOT NULL REFERENCES public.alert_subscribers(id) ON DELETE CASCADE,
  candidato_id UUID NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subscriber_id, candidato_id)
);

CREATE INDEX idx_alert_subscriptions_candidate ON public.alert_subscriptions (candidato_id, created_at DESC);

CREATE TABLE public.candidate_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('processo', 'mudanca_partido', 'patrimonio', 'noticia', 'ponto_atencao')),
  operacao TEXT NOT NULL CHECK (operacao IN ('insert', 'update', 'publicado')),
  tabela_origem TEXT NOT NULL,
  registro_id UUID,
  titulo TEXT NOT NULL,
  descricao TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_candidate_changes_candidate_created_at
  ON public.candidate_changes (candidato_id, created_at DESC);
CREATE INDEX idx_candidate_changes_created_at ON public.candidate_changes (created_at DESC);

CREATE TABLE public.notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID REFERENCES public.alert_subscribers(id) ON DELETE SET NULL,
  canal TEXT NOT NULL CHECK (canal IN ('email')),
  digest_date DATE NOT NULL,
  candidato_ids UUID[] NOT NULL DEFAULT '{}',
  change_ids UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subscriber_id, canal, digest_date)
);

CREATE INDEX idx_notification_log_digest_date ON public.notification_log (digest_date DESC, status);

ALTER TABLE public.alert_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.alert_subscribers_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alert_subscribers_set_updated_at ON public.alert_subscribers;
CREATE TRIGGER trg_alert_subscribers_set_updated_at
BEFORE UPDATE ON public.alert_subscribers
FOR EACH ROW
EXECUTE FUNCTION public.alert_subscribers_set_updated_at();

CREATE OR REPLACE FUNCTION public.log_candidate_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate_id UUID;
  change_tipo TEXT;
  change_operacao TEXT;
  change_titulo TEXT;
  change_descricao TEXT;
  change_metadata JSONB;
  should_log BOOLEAN := FALSE;
  new_public_attention_point BOOLEAN := FALSE;
  old_public_attention_point BOOLEAN := FALSE;
BEGIN
  IF TG_TABLE_NAME = 'processos' THEN
    candidate_id := NEW.candidato_id;
    change_tipo := 'processo';
    change_titulo := COALESCE(NULLIF(NEW.descricao, ''), 'Processo atualizado');
    change_descricao := CONCAT_WS(' · ', NEW.tribunal, NEW.status);
    change_metadata := jsonb_strip_nulls(
      jsonb_build_object(
        'tribunal', NEW.tribunal,
        'status', NEW.status,
        'gravidade', NEW.gravidade,
        'data_inicio', NEW.data_inicio,
        'data_decisao', NEW.data_decisao,
        'numero_processo', NEW.numero_processo
      )
    );

    IF TG_OP = 'INSERT' THEN
      should_log := TRUE;
      change_operacao := 'insert';
    ELSIF NEW.status IS DISTINCT FROM OLD.status
      OR NEW.data_decisao IS DISTINCT FROM OLD.data_decisao
      OR NEW.gravidade IS DISTINCT FROM OLD.gravidade
      OR NEW.descricao IS DISTINCT FROM OLD.descricao THEN
      should_log := TRUE;
      change_operacao := 'update';
    END IF;
  ELSIF TG_TABLE_NAME = 'mudancas_partido' THEN
    candidate_id := NEW.candidato_id;
    change_tipo := 'mudanca_partido';
    change_operacao := 'insert';
    change_titulo := CONCAT('Mudança de partido: ', COALESCE(NEW.partido_novo, 'partido não informado'));
    change_descricao := CONCAT_WS(' · ', NEW.partido_anterior, NEW.contexto);
    change_metadata := jsonb_strip_nulls(
      jsonb_build_object(
        'partido_anterior', NEW.partido_anterior,
        'partido_novo', NEW.partido_novo,
        'ano', NEW.ano,
        'data_mudanca', NEW.data_mudanca,
        'contexto', NEW.contexto
      )
    );
    should_log := TG_OP = 'INSERT';
  ELSIF TG_TABLE_NAME = 'patrimonio' THEN
    candidate_id := NEW.candidato_id;
    change_tipo := 'patrimonio';
    change_titulo := CONCAT('Patrimônio declarado ', NEW.ano_eleicao);
    change_descricao := 'Declaração patrimonial atualizada.';
    change_metadata := jsonb_strip_nulls(
      jsonb_build_object(
        'ano_eleicao', NEW.ano_eleicao,
        'valor_total', NEW.valor_total,
        'quantidade_bens', jsonb_array_length(COALESCE(NEW.bens, '[]'::jsonb))
      )
    );

    IF TG_OP = 'INSERT' THEN
      should_log := TRUE;
      change_operacao := 'insert';
    ELSIF NEW.valor_total IS DISTINCT FROM OLD.valor_total
      OR NEW.bens IS DISTINCT FROM OLD.bens THEN
      should_log := TRUE;
      change_operacao := 'update';
    END IF;
  ELSIF TG_TABLE_NAME = 'noticias_candidato' THEN
    candidate_id := NEW.candidato_id;
    change_tipo := 'noticia';
    change_operacao := 'insert';
    change_titulo := NEW.titulo;
    change_descricao := COALESCE(NEW.snippet, NEW.fonte, 'Nova notícia publicada.');
    change_metadata := jsonb_strip_nulls(
      jsonb_build_object(
        'fonte', NEW.fonte,
        'url', NEW.url,
        'data_publicacao', NEW.data_publicacao
      )
    );
    should_log := TG_OP = 'INSERT';
  ELSIF TG_TABLE_NAME = 'pontos_atencao' THEN
    candidate_id := NEW.candidato_id;
    change_tipo := 'ponto_atencao';
    new_public_attention_point := public.is_public_attention_point(NEW.visivel, NEW.gerado_por, NEW.verificado);
    old_public_attention_point := CASE
      WHEN TG_OP = 'UPDATE' THEN public.is_public_attention_point(OLD.visivel, OLD.gerado_por, OLD.verificado)
      ELSE FALSE
    END;
    change_titulo := NEW.titulo;
    change_descricao := NEW.descricao;
    change_metadata := jsonb_strip_nulls(
      jsonb_build_object(
        'categoria', NEW.categoria,
        'gravidade', NEW.gravidade,
        'gerado_por', NEW.gerado_por,
        'verificado', NEW.verificado,
        'data_referencia', NEW.data_referencia,
        'fontes_count', jsonb_array_length(COALESCE(NEW.fontes, '[]'::jsonb))
      )
    );

    IF new_public_attention_point THEN
      IF TG_OP = 'INSERT' THEN
        should_log := TRUE;
        change_operacao := 'insert';
      ELSIF NOT old_public_attention_point THEN
        should_log := TRUE;
        change_operacao := 'publicado';
      END IF;
    END IF;
  END IF;

  IF NOT should_log OR candidate_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.candidate_changes (
    candidato_id,
    tipo,
    operacao,
    tabela_origem,
    registro_id,
    titulo,
    descricao,
    metadata
  )
  VALUES (
    candidate_id,
    change_tipo,
    change_operacao,
    TG_TABLE_NAME,
    NEW.id,
    change_titulo,
    change_descricao,
    change_metadata
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_candidate_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_candidate_change_processos ON public.processos;
CREATE TRIGGER trg_candidate_change_processos
AFTER INSERT OR UPDATE ON public.processos
FOR EACH ROW
EXECUTE FUNCTION public.log_candidate_change();

DROP TRIGGER IF EXISTS trg_candidate_change_mudancas_partido ON public.mudancas_partido;
CREATE TRIGGER trg_candidate_change_mudancas_partido
AFTER INSERT ON public.mudancas_partido
FOR EACH ROW
EXECUTE FUNCTION public.log_candidate_change();

DROP TRIGGER IF EXISTS trg_candidate_change_patrimonio ON public.patrimonio;
CREATE TRIGGER trg_candidate_change_patrimonio
AFTER INSERT OR UPDATE ON public.patrimonio
FOR EACH ROW
EXECUTE FUNCTION public.log_candidate_change();

DROP TRIGGER IF EXISTS trg_candidate_change_noticias_candidato ON public.noticias_candidato;
CREATE TRIGGER trg_candidate_change_noticias_candidato
AFTER INSERT ON public.noticias_candidato
FOR EACH ROW
EXECUTE FUNCTION public.log_candidate_change();

DROP TRIGGER IF EXISTS trg_candidate_change_pontos_atencao ON public.pontos_atencao;
CREATE TRIGGER trg_candidate_change_pontos_atencao
AFTER INSERT OR UPDATE ON public.pontos_atencao
FOR EACH ROW
EXECUTE FUNCTION public.log_candidate_change();

COMMIT;
