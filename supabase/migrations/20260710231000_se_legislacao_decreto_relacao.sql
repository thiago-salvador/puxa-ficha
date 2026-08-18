-- Allow the executive-legislation table to represent official decrees without
-- misclassifying them as sanctioned laws or legislative projects.
alter table public.legislacao_mandato_executivo
  drop constraint if exists chk_tipo_relacao;

alter table public.legislacao_mandato_executivo
  add constraint chk_tipo_relacao check (
    tipo_relacao in (
      'projeto_enviado_pelo_executivo',
      'lei_sancionada',
      'lei_promulgada_pelo_legislativo',
      'decreto_executivo'
    )
  );
