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
import sys
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


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
                self.send_error(400, f"payload invalido: {e}")
                return

            registro = {
                "recebido_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "slug": payload.get("slug"),
                "decisoes": payload.get("decisoes", []),
                "livre": payload.get("livre", ""),
            }
            with open(saida, "a", encoding="utf-8") as fh:
                fh.write(json.dumps(registro, ensure_ascii=False) + "\n")

            decididos = [
                d for d in registro["decisoes"] if d.get("decisao") in ("aprovar", "rejeitar")
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
