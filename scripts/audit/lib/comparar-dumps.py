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

# Deltas legitimos: a mista 20260805120633 e o contrato 20260811100100 falham
# no replay linear por pre-condicoes de dado e aplicam no so-DDL. Producao TEM
# a primeira constraint; a segunda passa a existir somente depois da carga
# 20260811100000. Por isso ambas aparecem no lado ">" (com-ddl).
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
