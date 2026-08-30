#!/usr/bin/env python3
"""Servidor local do guia de cobertura e da fila de revisão (2026-08-02).

Serve estaticamente o diretório do relatório (o HTML de cobertura mais as
páginas em `revisao/`) e aceita `POST /revisao` com as decisões de aprovar ou
rejeitar de cada item.

Por que existe: o `http.server` puro não aceita POST, então o botão das páginas
de revisão morreria; e o `html-aplicar-server.py` global serve um arquivo só e
encerra no primeiro envio, o que não serve para uma fila com 60+ candidatos.
Aqui o servidor fica de pé e ACUMULA decisões, uma linha JSON por envio.

**Não toca banco.** A saída é um arquivo JSONL. Aplicar as decisões é um passo
separado, deliberado, com migration e readback como qualquer outra escrita.

Uso:
    python3 scripts/audit/review-server.py 8799 ~/.disposable-html decisoes.jsonl

Depois, abra http://127.0.0.1:8799/<nome-do-relatorio>.html
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


NEW_DECISIONS = {
    "publicar_com_evidencia",
    "despublicar_com_motivo_data",
    "recibo_nao_aplicabilidade",
    "coletar",
}


def _valid_https(value):
    try:
        parsed = urlparse(value)
        return parsed.scheme == "https" and bool(parsed.netloc)
    except Exception:
        return False


def _valid_timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return "T" in value and parsed.tzinfo is not None
    except Exception:
        return False


def validate_strict_all_payload(payload):
    if payload.get("schema_version") != 1:
        raise ValueError("schema_version precisa ser 1")
    slug = payload.get("slug")
    queue_id = payload.get("queue_id")
    queue_sha = payload.get("queue_sha256")
    decisions = payload.get("decisoes")
    if not isinstance(slug, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise ValueError("slug inválido")
    if not isinstance(queue_id, str) or not queue_id.startswith("strict-all-human-review:"):
        raise ValueError("queue_id inválido")
    if not isinstance(queue_sha, str) or not re.fullmatch(r"[a-f0-9]{64}", queue_sha):
        raise ValueError("queue_sha256 inválido")
    if not isinstance(decisions, list) or not decisions:
        raise ValueError("decisoes precisa ter ao menos um item")
    seen = set()
    for item in decisions:
        if not isinstance(item, dict):
            raise ValueError("decisão inválida")
        item_id = item.get("item_id")
        category = item.get("category")
        decision = item.get("decisao")
        if not isinstance(item_id, str) or not item_id.startswith(f"{slug}:"):
            raise ValueError("item_id não pertence ao slug")
        if item_id in seen:
            raise ValueError("item_id duplicado")
        seen.add(item_id)
        if not isinstance(category, str) or not item_id.endswith(f":{category}"):
            raise ValueError("category diverge do item_id")
        if decision not in NEW_DECISIONS:
            raise ValueError(f"decisão não permitida: {decision}")
        if decision in {"publicar_com_evidencia", "recibo_nao_aplicabilidade"}:
            if not _valid_https(item.get("evidence_url")):
                raise ValueError(f"{item_id}: URL HTTPS obrigatória")
            if not _valid_timestamp(item.get("evidence_checked_at", "")):
                raise ValueError(f"{item_id}: timestamp real obrigatório")
            if not re.fullmatch(r"[a-f0-9]{64}", item.get("evidence_sha256", "")):
                raise ValueError(f"{item_id}: SHA-256 obrigatório")
        if decision == "despublicar_com_motivo_data":
            if len(str(item.get("motivo", "")).strip()) < 10:
                raise ValueError(f"{item_id}: motivo obrigatório")
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(item.get("data_efetiva", ""))):
                raise ValueError(f"{item_id}: data efetiva obrigatória")
        if decision == "recibo_nao_aplicabilidade" and len(str(item.get("escopo", "")).strip()) < 10:
            raise ValueError(f"{item_id}: escopo do recibo obrigatório")
    return {
        "schema_version": 1,
        "recebido_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "queue_id": queue_id,
        "queue_sha256": queue_sha,
        "slug": slug,
        "decisoes": decisions,
    }


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__)
        return 2

    porta = int(sys.argv[1])
    raiz = os.path.abspath(os.path.expanduser(sys.argv[2]))
    saida = os.path.abspath(os.path.expanduser(sys.argv[3]))
    os.makedirs(os.path.dirname(saida) or ".", exist_ok=True)

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=raiz, **kwargs)

        def do_POST(self):  # noqa: N802 (assinatura da stdlib)
            if self.path.rstrip("/") != "/revisao":
                self.send_error(404, "endpoint desconhecido")
                return
            try:
                tamanho = int(self.headers.get("Content-Length") or 0)
                if tamanho <= 0 or tamanho > 2_000_000:
                    self.send_error(400, "corpo ausente ou grande demais")
                    return
                payload = json.loads(self.rfile.read(tamanho).decode("utf-8"))
            except Exception as e:  # payload malformado não derruba o servidor
                self._json_error(400, f"payload inválido: {e}")
                return

            try:
                if payload.get("schema_version") == 1:
                    registro = validate_strict_all_payload(payload)
                else:
                    registro = {
                        "recebido_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                        "slug": payload.get("slug"),
                        "decisoes": payload.get("decisoes", []),
                        "livre": payload.get("livre", ""),
                    }
            except ValueError as e:
                self._json_error(400, str(e))
                return
            with open(saida, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(registro, ensure_ascii=False) + "\n")
                fh.flush()
                os.fsync(fh.fileno())

            decididos = [
                d for d in registro["decisoes"]
                if d.get("decisao") in ("aprovar", "rejeitar") or d.get("decisao") in NEW_DECISIONS
            ]
            print(
                f"[revisao] {registro['slug']}: {len(decididos)} decidido(s) "
                f"de {len(registro['decisoes'])}",
                flush=True,
            )

            corpo = json.dumps({"ok": True, "gravados": len(registro["decisoes"])}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)

        def _json_error(self, status, message):
            corpo = json.dumps({"ok": False, "error": message}, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)

        def log_message(self, *args):  # silencia o log de acesso por requisição
            pass

    servidor = ThreadingHTTPServer(("127.0.0.1", porta), Handler)
    print(f"[revisao] servindo {raiz} em http://127.0.0.1:{porta}/", flush=True)
    print(f"[revisao] decisoes vao para {saida}", flush=True)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\n[revisao] encerrado", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
