#!/usr/bin/env python3
"""Veredito do diff de schema entre o replay linear e o replay so-DDL.

Le no stdin a saida de `diff dump_linear dump_ddl` e decide. Rodada 3 da
vistoria do PR #142: a versao anterior aceitava qualquer par de linhas contendo
a substring `candidatos_status_dominio`, entao uma definicao alterada da
constraint preservava a contagem 2 e passava. Aqui o delta esperado e CANONICO:
lado e conteudo exatos, nem uma linha a mais, nem a menos, nem diferente.

Linha presente nos dois lados apos normalizacao (so a virgula final mudou, caso
da constraint vizinha que ganha virgula quando a nova entra) nao e divergencia.

Sai 0 somente quando o conjunto de deltas e EXATAMENTE o esperado.
"""

import sys

# Deltas legitimos: migrations de schema condicionadas por dados podem terminar
# em estados diferentes no replay linear sintético e no replay só-DDL. A lista
# abaixo foi medida integralmente no PostgreSQL 17 em 06/09/2026. Ela inclui o
# domínio de status, o contrato Senado, o domínio de situação de candidatura e
# a validação da barreira mínima de publicação. Produção tem o schema do lado
# só-DDL; nenhuma dessas diferenças é inferida por contagem.
# Mudou a definicao ou o comentario? Este arquivo tem que mudar JUNTO, no mesmo
# PR, com a re-medicao anexada.
DELTAS_ESPERADOS = {
    (
        ">",
        "CONSTRAINT candidatos_status_dominio CHECK ((status = ANY "
        "(ARRAY['pre-candidato'::text, 'candidato'::text, 'indeferido'::text, "
        "'desistente'::text, 'removido'::text])))",
    ),
    (
        ">",
        "COMMENT ON CONSTRAINT candidatos_status_dominio ON public.candidatos "
        "IS 'Espelha o union de status em src/lib/types.ts. Mudou la, muda "
        "aqui na mesma PR.';",
    ),
    (
        ">",
        "CONSTRAINT votacoes_chave_senado_exige_evento_exato_check CHECK "
        "(((casa IS DISTINCT FROM 'Senado'::text) OR ((fonte = 'senado'::text) "
        "AND (votacao_id_api IS NOT NULL) AND (btrim(votacao_id_api) <> ''::text))))",
    ),
    (
        "<",
        "ADD CONSTRAINT candidatos_publicacao_minima_2026_check CHECK (((publicavel IS DISTINCT FROM true) "
        "OR (cargo_disputado <> ALL (ARRAY['Presidente'::text, 'Governador'::text])) OR "
        "((COALESCE(btrim(foto_url), ''::text) <> ''::text) AND (COALESCE(btrim(partido_sigla), ''::text) <> ''::text) "
        "AND (COALESCE(btrim(situacao_candidatura), ''::text) <> ''::text) AND (COALESCE(btrim(biografia), ''::text) <> ''::text) "
        "AND (COALESCE(btrim(naturalidade), ''::text) <> ''::text) AND (data_nascimento IS NOT NULL) "
        "AND (COALESCE(btrim(formacao), ''::text) <> ''::text) AND (COALESCE(btrim(profissao_declarada), ''::text) <> ''::text) "
        "AND (COALESCE(btrim(genero), ''::text) <> ''::text) AND (COALESCE(btrim(estado_civil), ''::text) <> ''::text) "
        "AND (COALESCE(btrim(cor_raca), ''::text) <> ''::text) AND (COALESCE(verificacao_campos, '{}'::jsonb) ? 'candidate_registration'::text) "
        "AND (COALESCE(verificacao_campos, '{}'::jsonb) ? 'candidate_complement'::text)))) NOT VALID;",
    ),
    ("<", "ALTER TABLE public.candidatos"),
    (
        ">",
        "COMMENT ON CONSTRAINT candidatos_situacao_candidatura_dominio ON public.candidatos IS "
        "'Vocabulario fechado de situacao_candidatura. NULL e permitido de proposito (ausencia de informacao). "
        "Espelha SITUACAO_CANDIDATURA_DOMINIO em src/lib/situacao-candidatura.ts: mudou la, muda aqui na mesma PR. "
        "Os quatro estados de julgamento entraram em 03/09/2026, quando o julgamento de 2026 apareceu em "
        "consulta_cand_complementar (134 deferidos, 4 indeferidos e 2 deferidos com recurso entre as 206 fichas "
        "publicaveis com SQ).';",
    ),
    (
        ">",
        "CONSTRAINT candidatos_publicacao_minima_2026_check CHECK (((publicavel IS DISTINCT FROM true) "
        "OR (cargo_disputado <> ALL (ARRAY['Presidente'::text, 'Governador'::text])) OR "
        "((COALESCE(btrim(foto_url), ''::text) <> ''::text) AND (COALESCE(btrim(partido_sigla), ''::text) <> ''::text) "
        "AND (COALESCE(btrim(situacao_candidatura), ''::text) <> ''::text) AND (COALESCE(btrim(biografia), ''::text) <> ''::text) "
        "AND (COALESCE(btrim(naturalidade), ''::text) <> ''::text) AND (data_nascimento IS NOT NULL) "
        "AND (COALESCE(btrim(formacao), ''::text) <> ''::text) AND (COALESCE(btrim(profissao_declarada), ''::text) <> ''::text) "
        "AND (COALESCE(btrim(genero), ''::text) <> ''::text) AND (COALESCE(btrim(estado_civil), ''::text) <> ''::text) "
        "AND (COALESCE(btrim(cor_raca), ''::text) <> ''::text) AND (COALESCE(verificacao_campos, '{}'::jsonb) ? 'candidate_registration'::text) "
        "AND (COALESCE(verificacao_campos, '{}'::jsonb) ? 'candidate_complement'::text))))",
    ),
    (
        ">",
        "CONSTRAINT candidatos_situacao_candidatura_dominio CHECK ((situacao_candidatura = ANY "
        "(ARRAY['aguardando julgamento'::text, 'candidatura declarada'::text, 'incerto'::text, 'deferido'::text, "
        "'deferido com recurso'::text, 'indeferido'::text, 'indeferido com recurso'::text])))",
    ),
}


def normalizar(linha: str) -> str:
    return linha.rstrip("\n").rstrip(",").strip()


def main() -> int:
    esquerda: set[str] = set()
    direita: set[str] = set()
    for linha in sys.stdin:
        lado = linha[:1]
        if lado == "<":
            esquerda.add(normalizar(linha[2:]))
        elif lado == ">":
            direita.add(normalizar(linha[2:]))

    deltas = {("<", linha) for linha in esquerda - direita} | {
        (">", linha) for linha in direita - esquerda
    }

    inesperados = sorted(deltas - DELTAS_ESPERADOS)
    faltantes = sorted(DELTAS_ESPERADOS - deltas)

    print(f"conhecidos={len(deltas & DELTAS_ESPERADOS)} " f"inesperados={len(inesperados)} faltantes={len(faltantes)}")
    for lado, conteudo in inesperados[:40]:
        print(f"INESPERADO {lado} {conteudo}")
    for lado, conteudo in faltantes:
        # Delta esperado ausente e tao grave quanto inesperado: significa dumps
        # degenerados ou mudanca de comportamento da mista, e os dois exigem
        # re-medicao antes de qualquer aprovacao.
        print(f"FALTANTE {lado} {conteudo}")

    return 0 if not inesperados and not faltantes else 1


if __name__ == "__main__":
    sys.exit(main())
