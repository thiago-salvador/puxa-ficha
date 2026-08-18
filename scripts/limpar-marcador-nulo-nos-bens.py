#!/usr/bin/env python3
"""Tira o marcador tecnico #NULO# da descricao de bens publicados.

O QUE ESTA ERRADO
------------------
Tres fichas publicam `#NULO#` como descricao de bem, 50 bens no total, todos do
ano 2018 e todos vindos dos pacotes `bem_candidato_2018_*.csv`:

  ronaldo-caiado       45 bens
  leonardo-avalanche    4 bens
  hertz-dias            1 bem

`#NULO#` e o marcador do TSE para "campo sem valor" nos pacotes de dados abertos.
Publicar o marcador literal afirma ao leitor uma descricao que nao existe. O
gerador do backfill esqueceu de passar pelo saneamento.

O CONSERTO CERTO NAO E MASCARAR NA UI, e o proprio
scripts/audit-marcadores-tse-publicos.ts diz isso no rodape. E limpar o dado: a
descricao vira vazia, e a ficha entao mostra "Descricao nao informada", que e
verdade, porque o TSE realmente nao informou.

`tipo` e `valor` ficam intactos: esses o TSE informou e sao o que importa.

Achado do master review de 18/08, pelo gate audit:marcadores-tse:gate, que hoje
reprova por causa disto e por isso nao pode entrar num workflow como bloqueante
antes desta limpeza.

Uso:
    python3 scripts/limpar-marcador-nulo-nos-bens.py            # dry-run
    python3 scripts/limpar-marcador-nulo-nos-bens.py --apply
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
# Le do ambiente primeiro, como os auditores em TypeScript deste repo fazem, e so
# cai para um .env.local se ele existir. Sem caminho pessoal cravado: o script
# precisa rodar na maquina de qualquer pessoa e em CI.
ENV_PATH = Path(os.environ.get("PF_ENV_FILE", ".env.local"))
AGORA = datetime.now(timezone.utc).isoformat()
CARIMBO = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
MARCADOR = "#NULO#"

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
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


def paginar(path: str):
    fora, off = [], 0
    while True:
        st, d = rest(f"{path}&limit=1000&offset={off}")
        fora += d or []
        if not d or len(d) < 1000:
            return fora
        off += 1000


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    fichas = {c["id"]: c["slug"] for c in paginar("candidatos?select=id,slug")}
    planos = []
    for p in paginar("patrimonio?select=id,candidato_id,ano_eleicao,bens"):
        bens = p.get("bens") or []
        if not isinstance(bens, list):
            continue
        if MARCADOR not in json.dumps(bens, ensure_ascii=False):
            continue
        novos, tocados = [], 0
        for b in bens:
            if isinstance(b, dict) and b.get("descricao") == MARCADOR:
                nb = dict(b)
                nb["descricao"] = ""
                novos.append(nb)
                tocados += 1
            else:
                novos.append(b)
        # Guarda: so a chave `descricao` pode mudar, e so onde valia o marcador.
        antes = [{k: v for k, v in b.items() if k != "descricao"} if isinstance(b, dict) else b
                 for b in bens]
        depois = [{k: v for k, v in b.items() if k != "descricao"} if isinstance(b, dict) else b
                  for b in novos]
        if antes != depois:
            raise SystemExit(f"ABORTA: {p['id']} mudaria campo alem de descricao")
        planos.append((p, fichas.get(p["candidato_id"], "?"), novos, tocados))

    total = sum(t for _, _, _, t in planos)
    for p, slug, _, t in planos:
        print(f"  {slug:<22} patrimonio {p['id'][:8]}  ano={p['ano_eleicao']}  bens com marcador: {t}")
    print(f"\n{len(planos)} linha(s), {total} bem(ns) com {MARCADOR}")

    if not args.apply:
        print("\n[dry-run] nada foi gravado. Rode com --apply.")
        return
    if not planos:
        raise SystemExit("nada a fazer")

    BACKUP_DIR.mkdir(exist_ok=True)
    bkp = BACKUP_DIR / f"marcador-nulo-bens-{CARIMBO}.json"
    bkp.write_text(json.dumps({"quando": AGORA, "antes": [
        {"id": p["id"], "slug": s, "bens": p["bens"]} for p, s, _, _ in planos]},
        ensure_ascii=False, indent=2))
    print(f"\nbackup (E o desfazer): backups/{bkp.name}")

    ok = 0
    for p, slug, novos, _ in planos:
        st, _r = rest(f"patrimonio?id=eq.{p['id']}", method="PATCH", body={"bens": novos})
        if st in (200, 204):
            ok += 1
        else:
            print(f"  FALHOU {slug}: {st}")
    print(f"gravadas: {ok} de {len(planos)}")

    restou = sum(1 for p in paginar("patrimonio?select=id,bens")
                 if MARCADOR in json.dumps(p.get("bens") or [], ensure_ascii=False))
    print(f"readback: {restou} linha(s) ainda com {MARCADOR} (esperado 0)")
    if restou:
        raise SystemExit("ABORTA: readback ainda encontra o marcador")

    st_log, resp = rest("coleta_log", method="POST", prefer="return=representation", body={
        "fonte": "bem-candidato-tse-2018", "escopo": "global", "alvo": "patrimonio",
        "resultado": "encontrado" if ok else "sem_achado_no_escopo",
        "natureza": "escrita", "volume": ok,
        "detalhe": (f"{total} bens em {ok} linhas publicavam a descricao como '{MARCADOR}', o "
                    f"marcador do TSE para campo sem valor, vindo dos pacotes "
                    f"bem_candidato_2018. A descricao virou vazia, entao a ficha passa a dizer "
                    f"'Descricao nao informada', que e verdade. tipo e valor intactos. Achado do "
                    f"master review de 18/08 pelo audit:marcadores-tse:gate. "
                    f"Backup em backups/{bkp.name}"),
        "executado_em": AGORA,
    })
    if st_log not in (200, 201):
        raise SystemExit(f"ABORTA: escrita aplicada mas coleta_log falhou ({st_log}): {resp}")
    print(f"coleta_log: recibo gravado ({st_log})")


if __name__ == "__main__":
    main()
