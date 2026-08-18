#!/usr/bin/env python3
"""Tira do dado o marcador `interno:` que a view publica ja escondia.

O QUE ESTA ERRADO
------------------
Cinco fichas tem em `candidatos.fonte_dados` uma entrada com prefixo `interno:`,
que e nota editorial nossa e nao fonte:

    interno:nome_completo=nome_urna (placeholder, aguarda registro TSE 2026)

A view `candidatos_publico` filtra essas entradas, entao a UI nunca mostrou. Mas
`candidatos` e legivel pela chave anon, que e publica por desenho do Supabase, e
ali o marcador aparece. Ou seja, quem chama o PostgREST direto le o que a ficha
esconde, e isso contradiz a promessa do projeto.

POR QUE NAO E CONSERTO DE PERMISSAO
------------------------------------
RLS e por LINHA e o problema e uma COLUNA, entao policy nao resolve. E revogar a
coluna do anon quebraria a view junto, porque `candidatos_publico` e
`security_invoker=true` e le com a permissao de quem chama. Sobra limpar na
origem, que e o que a migration 20260803142851 ja tinha feito uma vez: estas
cinco sao reincidencia em dado que entrou depois.

A informacao nao se perde: `nome_completo = nome_urna` continua verificavel nas
proprias colunas, que e exatamente o que a nota dizia.

Uso:
    python3 scripts/limpar-prefixo-interno-fonte-dados.py            # dry-run
    python3 scripts/limpar-prefixo-interno-fonte-dados.py --apply
"""
from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
BACKUP_DIR = REPO / "backups"
ENV_PATH = Path(os.environ.get("PF_ENV_FILE", ".env.local"))
AGORA = datetime.now(timezone.utc).isoformat()
CARIMBO = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
PREFIXO = "interno:"

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
        raise SystemExit(f"ABORTA: {nome} ausente. Defina no ambiente ou num .env.local.")
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
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


def paginar(path: str):
    out, off = [], 0
    while True:
        st, d = rest(f"{path}&limit=1000&offset={off}")
        out += d or []
        if not d or len(d) < 1000:
            return out
        off += 1000


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    planos = []
    for c in paginar("candidatos?select=id,slug,fonte_dados"):
        fontes = c.get("fonte_dados") or []
        if not isinstance(fontes, list):
            continue
        marcados = [f for f in fontes if isinstance(f, str) and f.lower().startswith(PREFIXO)]
        if not marcados:
            continue
        limpo = [f for f in fontes if not (isinstance(f, str) and f.lower().startswith(PREFIXO))]
        # Guarda: nada alem das entradas com o prefixo pode sair.
        if [f for f in fontes if f not in limpo] != marcados:
            raise SystemExit(f"ABORTA: {c['slug']} perderia entrada que nao e do prefixo")
        planos.append((c, limpo, marcados))
        print(f"  {c['slug']:<24} sai: {marcados}")

    print(f"\n{len(planos)} ficha(s) a limpar")
    if not args.apply:
        print("\n[dry-run] nada foi gravado. Rode com --apply.")
        return
    if not planos:
        print("nada a fazer")
        return

    BACKUP_DIR.mkdir(exist_ok=True)
    bkp = BACKUP_DIR / f"fonte-dados-interno-{CARIMBO}.json"
    bkp.write_text(json.dumps({"quando": AGORA, "antes": [
        {"id": c["id"], "slug": c["slug"], "fonte_dados": c["fonte_dados"]}
        for c, _, _ in planos]}, ensure_ascii=False, indent=2))
    print(f"\nbackup (E o desfazer): backups/{bkp.name}")

    ok = 0
    for c, limpo, _ in planos:
        st, _r = rest(f"candidatos?id=eq.{c['id']}", method="PATCH", body={"fonte_dados": limpo})
        if st in (200, 204):
            ok += 1
        else:
            print(f"  FALHOU {c['slug']}: {st}")
    print(f"gravadas: {ok} de {len(planos)}")

    restou = sum(1 for c in paginar("candidatos?select=fonte_dados")
                 if any(isinstance(f, str) and f.lower().startswith(PREFIXO)
                        for f in (c.get("fonte_dados") or [])))
    print(f"readback: {restou} ficha(s) ainda com '{PREFIXO}' (esperado 0)")
    if restou:
        raise SystemExit("ABORTA: readback ainda encontra o prefixo")

    st_log, resp = rest("coleta_log", method="POST", prefer="return=representation", body={
        "fonte": "curadoria", "escopo": "global", "alvo": "candidatos",
        "resultado": "encontrado" if ok else "sem_achado_no_escopo",
        "natureza": "escrita", "volume": ok,
        "detalhe": (f"{ok} fichas tinham em fonte_dados uma entrada com prefixo 'interno:', "
                    f"nota editorial que a view candidatos_publico ja escondia mas que a "
                    f"tabela base expunha pela chave anon. Limpo na origem porque RLS e por "
                    f"linha e revogar a coluna quebraria a view, que e security_invoker. "
                    f"Reincidencia do que a migration 20260803142851 tratou. Achado do review "
                    f"de seguranca de lancamento. Backup em backups/{bkp.name}"),
        "executado_em": AGORA,
    })
    if st_log not in (200, 201):
        raise SystemExit(f"ABORTA: escrita aplicada mas coleta_log falhou ({st_log}): {resp}")
    print(f"coleta_log: recibo gravado ({st_log})")


if __name__ == "__main__":
    main()
