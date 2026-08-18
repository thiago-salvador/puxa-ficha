#!/usr/bin/env python3
"""Corrige as duas fichas que publicam situacao de candidatura de antes de 2026.

O QUE ESTA ERRADO
------------------
Duas das 208 fichas publicam um fato desatualizado, nao so mal redigido:

  soldado-sampaio  'APTO [2022]'    marcador do ciclo de 2022 numa disputa de 2026
  cadu-xavier      'pre-candidato'  status de antes do registro, que fechou em 15/08

Conferido no DivulgaCand 2026 em 18/08/2026, um a um pelo SQ da propria ficha:
ambos respondem descricaoSituacao "Aguardando julgamento" e descricaoTotalizacao
"Concorrendo". Ou seja, o site afirma hoje coisa diferente do que a fonte oficial
diz.

Isso e diferente das outras 206. As 164 que dizem 'registrada, aguardando
julgamento' sao verbosas e fora do vocabulario canonico, mas nao sao FALSAS.
Estas duas sao. Por isso entram como conserto agora, e o vocabulario inteiro
segue como tarefa separada.

O VALOR ESCOLHIDO
------------------
'aguardando julgamento', que e ao mesmo tempo o que o TSE responde e um dos tres
valores do dominio canonico que as migrations de
supabase/migrations-pendentes/ estabelecem ('aguardando julgamento',
'candidatura declarada', 'incerto'). Consertar para o vocabulario certo evita
ter que tocar essas duas linhas de novo quando aquele par entrar.

Uso:
    python3 scripts/corrigir-situacao-2026-stale.py            # dry-run
    python3 scripts/corrigir-situacao-2026-stale.py --apply
"""
from __future__ import annotations

import argparse
import json
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BACKUP_DIR = REPO / "backups"
# Le do ambiente primeiro, como os auditores em TypeScript deste repo fazem, e so
# cai para um .env.local se ele existir. Sem caminho pessoal cravado: o script
# precisa rodar na maquina de qualquer pessoa e em CI.
ENV_PATH = Path(os.environ.get("PF_ENV_FILE", ".env.local"))
AGORA = datetime.now(timezone.utc).isoformat()
CARIMBO = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
CTX = ssl.create_default_context()
ALVO = "aguardando julgamento"
SLUGS = ("soldado-sampaio", "cadu-xavier")

ENV = {}
if ENV_PATH.exists():
    for _l in ENV_PATH.read_text().splitlines():
        _l = _l.strip()
        if _l and "=" in _l and not _l.startswith("#"):
            _k, _v = _l.split("=", 1)
            ENV[_k.strip()] = _v.strip().strip("\"'")


def _cfg(nome: str) -> str:
    v = os.environ.get(nome) or ENV.get(nome)
    if not v:
        raise SystemExit(
            f"ABORTA: {nome} ausente. Defina no ambiente ou num .env.local "
            f"(ou aponte PF_ENV_FILE para o arquivo)."
        )
    return v


BASE = _cfg("SUPABASE_URL").rstrip("/") + "/rest/v1"
KEY = _cfg("SUPABASE_SERVICE_ROLE_KEY")


def rest(path: str, *, method: str = "GET", body=None, prefer: str | None = None):
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
    if prefer:
        h["Prefer"] = prefer
    req = urllib.request.Request(
        f"{BASE}/{urllib.parse.quote(path, safe=':/?&=.,*()-_')}",
        method=method, headers=h,
        data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


def tse(uf: str, sq: str):
    u = (f"https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/"
         f"{uf}/20322002026/candidato/{sq}")
    r = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with urllib.request.urlopen(r, timeout=45, context=CTX) as resp:
        return json.load(resp)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    lista = ",".join(SLUGS)
    st, fichas = rest(f"candidatos?slug=in.({lista})"
                      f"&select=id,slug,nome_urna,estado,situacao_candidatura,sq_candidato_2026")
    if st != 200 or not fichas:
        raise SystemExit(f"ABORTA: leitura das fichas falhou ({st})")

    planos = []
    for f in fichas:
        d = tse(f["estado"], str(f["sq_candidato_2026"]))
        oficial = (d.get("descricaoSituacao") or "").strip()
        # O conserto so vale se a fonte disser exatamente o que estamos gravando.
        # Se o TSE mudar a redacao, e melhor abortar do que gravar por inercia.
        if oficial.lower() != ALVO:
            print(f"  PULA {f['slug']}: TSE respondeu {oficial!r}, nao {ALVO!r}")
            continue
        # Ja no valor certo: nao entra no plano. Sem isto o dry-run anuncia
        # "2 fichas a corrigir" depois do conserto ja aplicado, que e saida que
        # engana quem le.
        if (f.get("situacao_candidatura") or "") == ALVO:
            print(f"  ja correta {f['slug']}: {ALVO!r}")
            continue
        planos.append((f, oficial, d.get("descricaoTotalizacao")))
        print(f"  {f['slug']:<18} {f['situacao_candidatura']!r}  ->  {ALVO!r}")
        print(f"      TSE 2026: situacao={oficial!r} totalizacao={d.get('descricaoTotalizacao')!r}")

    print(f"\n{len(planos)} ficha(s) a corrigir")
    if not args.apply:
        print("\n[dry-run] nada foi gravado. Rode com --apply.")
        return
    if not planos:
        raise SystemExit("ABORTA: nada passou na conferencia contra o TSE")

    BACKUP_DIR.mkdir(exist_ok=True)
    bkp = BACKUP_DIR / f"situacao-stale-{CARIMBO}.json"
    bkp.write_text(json.dumps({"quando": AGORA, "antes": [
        {"id": f["id"], "slug": f["slug"], "situacao_candidatura": f["situacao_candidatura"]}
        for f, _, _ in planos]}, ensure_ascii=False, indent=2))
    print(f"\nbackup (E o desfazer): backups/{bkp.name}")

    ok = 0
    for f, _, _ in planos:
        st, _r = rest(f"candidatos?id=eq.{f['id']}", method="PATCH",
                      body={"situacao_candidatura": ALVO})
        if st in (200, 204):
            ok += 1
        else:
            print(f"  FALHOU {f['slug']}: {st}")
    print(f"gravadas: {ok} de {len(planos)}")

    st, depois = rest(f"candidatos?slug=in.({lista})&select=slug,situacao_candidatura")
    print("readback:", json.dumps(depois, ensure_ascii=False))
    restou = [x for x in (depois or []) if x["situacao_candidatura"] != ALVO]
    if restou:
        raise SystemExit(f"ABORTA: readback ainda mostra valor antigo em {restou}")

    st_log, resp = rest("coleta_log", method="POST", prefer="return=representation", body={
        "fonte": "divulgacand-tse-2026", "escopo": "global", "alvo": "candidatos",
        "resultado": "encontrado" if ok else "sem_achado_no_escopo",
        "natureza": "escrita", "volume": ok,
        "detalhe": (f"{ok} ficha(s) publicavam situacao de candidatura anterior a 2026 "
                    f"(soldado-sampaio 'APTO [2022]', cadu-xavier 'pre-candidato'). "
                    f"Conferido no DivulgaCand 2026 pelo SQ de cada uma: as duas respondem "
                    f"'Aguardando julgamento' e 'Concorrendo'. Gravado o valor do dominio "
                    f"canonico das migrations pendentes de vocabulario. Achado do master "
                    f"review de 18/08. Backup em backups/{bkp.name}"),
        "executado_em": AGORA,
    })
    if st_log not in (200, 201):
        raise SystemExit(f"ABORTA: escrita aplicada mas coleta_log falhou ({st_log}): {resp}")
    print(f"coleta_log: recibo gravado ({st_log})")


if __name__ == "__main__":
    main()
