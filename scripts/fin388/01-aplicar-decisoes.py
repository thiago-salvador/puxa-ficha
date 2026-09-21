#!/usr/bin/env python3
"""Issue #388, passo 1: aplica as decisoes de 2026-09-20 sobre os contextos
pendentes e reconstroi a ponte de identidade.

Decisoes de manutencao (2026-09-20):
  - 5 contextos sem candidatura oficial no ano: remover a atribuicao.
  - rodrigo-pacheco: corrigir o CPF do cadastro pelo CPF da linha oficial
    do SQ 130000604556.
  - jose-eliton e rodrigo-pacheco: aceitos por SQ oficial validado por nome,
    UF, cargo e contexto eleitoral (varredura dirigida de 2026-09-20).

Identidade so e aceita por SQ oficial validado ou por CPF exato. Nunca por nome
isolado. Nenhum CPF ou hash e impresso.
"""
import json, os, sys
from pathlib import Path

# Uso: 01-aplicar-decisoes.py <identity-bridge-refined.json> <dir privado>
REFINED = Path(sys.argv[1])
OUT = Path(sys.argv[2]) / "bridge-final.private.json"

# Aceitos por SQ oficial validado (nome, UF, cargo, contexto eleitoral).
MANUAL_RESOLVED = {
    ("jose-eliton", 2018): {"sq": "90000609446", "official_uf": "GO", "cargo": "GOVERNADOR",
                            "nome_completo": "JOSE ELITON DE FIGUEREDO JUNIOR", "nome_urna": "ZE ELITON",
                            "partido": "PSDB", "situacao": "apto",
                            "method": "sq_oficial_validado_varredura_dirigida_20260920"},
    ("rodrigo-pacheco", 2018): {"sq": "130000604556", "official_uf": "MG", "cargo": "SENADOR",
                                "nome_completo": "RODRIGO OTAVIO SOARES PACHECO", "nome_urna": "RODRIGO PACHECO",
                                "partido": "DEM", "situacao": "apto",
                                "method": "sq_oficial_validado_varredura_dirigida_20260920",
                                "cadastro_cpf_defeituoso": True},
}

# Sem candidatura oficial no ano do contexto. Decisao: remover a atribuicao.
ATTRIBUTION_REMOVED = {
    ("silvio-mendes", 2016), ("joao-roma", 2020), ("paulo-serra", 2018),
    ("paulo-martins-gov-pr", 2016), ("cleitinho", 2024),
}

def main() -> int:
    refined = json.loads(REFINED.read_text())
    contexts = refined["contexts"]
    if len(contexts) != 108:
        print(f"ABORT: esperados 108 contextos na ponte refinada, obtidos {len(contexts)}")
        return 1

    resolved, removed, still_open = [], [], []
    for ctx in contexts:
        key = (ctx.get("slug"), int(ctx["ano"]))
        status = ctx.get("status")
        if key in ATTRIBUTION_REMOVED:
            ctx["status"] = "attribution_removed"
            ctx["decision"] = "remover_atribuicao"
            ctx["decision_authority"] = "decisao de manutencao 2026-09-20"
            ctx["decision_reason"] = ("sem candidatura oficial no ano do contexto, nem por CPF nem por nome "
                                      "completo; ano vem do pacote de receitas, logo o defeito e a atribuicao")
            removed.append(ctx)
            continue
        if key in MANUAL_RESOLVED and status != "resolved":
            extra = MANUAL_RESOLVED[key]
            ctx["status"] = "resolved"
            ctx["sq"] = extra["sq"]
            ctx["official_uf"] = extra["official_uf"]
            ctx["method"] = extra["method"]
            ctx["manual_evidence"] = {k: v for k, v in extra.items() if k not in {"sq", "official_uf", "method"}}
            resolved.append(ctx)
            continue
        if status == "resolved":
            # Resolucao por CPF exato guarda a linha oficial em matches. Promove
            # para sq/official_uf somente quando a correspondencia for unica.
            if not str(ctx.get("sq") or "").strip() or not str(ctx.get("official_uf") or "").strip():
                matches = ctx.get("matches") or []
                # "BR" aparece nos contextos nacionais (presidente), onde a UF
                # oficial nao e estadual. O pacote de receitas usa o membro
                # nacional nesses casos.
                if len(matches) == 1 and matches[0].get("sq") and matches[0].get("uf"):
                    ctx["sq"] = str(matches[0]["sq"])
                    ctx["official_uf"] = str(matches[0]["uf"]).upper()
                    ctx["promoted_from_match"] = True
                else:
                    print(f"ABORT: contexto resolvido sem SQ ou UF utilizavel: "
                          f"{ctx.get('slug')} {ctx.get('ano')} method={ctx.get('method')} matches={len(matches)}")
                    return 1
            resolved.append(ctx)
        else:
            still_open.append(ctx)

    if still_open:
        print(f"ABORT: {len(still_open)} contextos seguem sem resolucao e sem decisao:")
        for ctx in still_open:
            print(f"  - {ctx.get('slug')} {ctx.get('ano')} status={ctx.get('status')}")
        return 1

    total = len(resolved) + len(removed)
    if total != 108:
        print(f"ABORT: {total} contextos contabilizados, esperados 108")
        return 1

    payload = {
        "issue": 388, "step": "01-aplicar-decisoes", "generated_at": "2026-09-20",
        "decision_authority": "decisao de manutencao 2026-09-20",
        "counts": {"total": total, "resolved": len(resolved), "attribution_removed": len(removed)},
        "resolved": resolved, "attribution_removed": removed,
        "raw_sensitive_data_emitted": False,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    os.chmod(OUT, 0o600)
    print(f"OK: {len(resolved)} resolvidos por SQ/CPF, {len(removed)} com atribuicao removida, {total} contabilizados")
    print(f"saida 0600: {OUT}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
