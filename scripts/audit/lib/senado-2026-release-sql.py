#!/usr/bin/env python3
"""Gera o SQL fechado do release de schema do Senado 2026.

Uso: senado-2026-release-sql.py <sha> (<version> <migration> <rollback> <readback>) x6

Cada migration roda na sua própria transação, na ordem dos arquivos:
lock consultivo, CAS do ledger, migration, registro no ledger, readback da
própria migration e prova de que publicavel não mudou. Uma transação final,
somente leitura, repete os seis readbacks contra o ledger completo.

O gerador não conecta em banco nenhum. Ele recusa conjunto diferente do
fechado, arquivo com controle de transação fora do BEGIN;/COMMIT; de topo e
migration com DML (o release é só schema: não carrega dado nem publica ficha).
"""

import base64
import hashlib
import pathlib
import re
import sys

PREVIOUS_TOP = "20260912160200"
VERSIONS = (
    "20260914000000",
    "20260915090000",
    "20260915190000",
    "20260915210000",
    "20260915210100",
    "20260915220000",
)
LOCK_KEY = "puxa-ficha:production-db-migrations"

TRANSACTION_WRAPPER = re.compile(r"^(BEGIN|COMMIT);[ \t]*$", re.MULTILINE)
TRANSACTION_CONTROL = re.compile(
    r"^[ \t]*(BEGIN|COMMIT|ROLLBACK|START[ \t]+TRANSACTION|SAVEPOINT|RELEASE[ \t]+SAVEPOINT|ABORT)"
    r"(?:[ \t]+(?:WORK|TRANSACTION|READ[ \t]+ONLY|ISOLATION[^;]*))?[ \t]*;",
    re.IGNORECASE | re.MULTILINE,
)
DML = re.compile(
    r"\b(INSERT[ \t\n]+INTO|UPDATE[ \t\n]+[\w.\"]+[ \t\n]+SET|DELETE[ \t\n]+FROM|TRUNCATE|COPY[ \t\n]+[\w.\"]+|MERGE[ \t\n]+INTO)\b",
    re.IGNORECASE,
)


def fail(message: str) -> None:
    raise SystemExit(f"senado-2026-release-sql: {message}")


def b64(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


def lit(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def strip_sql_comments(text: str) -> str:
    return re.sub(r"--[^\n]*", "", text)


def unwrap(label: str, text: str) -> str:
    """Remove somente BEGIN;/COMMIT; de topo; qualquer outro controle aborta."""
    body = TRANSACTION_WRAPPER.sub("", text)
    residual = TRANSACTION_CONTROL.search(strip_sql_comments(body))
    if residual:
        fail(f"{label} tem controle de transação não suportado: {residual.group(0).strip()}")
    return body if body.endswith("\n") else body + "\n"


def in_list(values) -> str:
    return ",".join(lit(v) for v in values)


def main(argv: list[str]) -> None:
    if len(argv) < 1:
        fail("sha obrigatório")
    sha, *args = argv
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        fail("sha inválido")
    if len(args) != 4 * len(VERSIONS):
        fail("esperava seis quartetos de release")

    steps = []
    for index in range(0, len(args), 4):
        version, migration_path, rollback_path, readback_path = args[index:index + 4]
        if version != VERSIONS[index // 4]:
            fail(f"versão fora do conjunto fechado ou fora de ordem: {version}")
        for path, suffix in ((migration_path, ".sql"), (rollback_path, ".rollback.sql"), (readback_path, ".readback.sql")):
            name = pathlib.Path(path).name
            if not name.startswith(version + "_") or not name.endswith(suffix) or (suffix == ".sql" and name.endswith(".rollback.sql")):
                fail(f"arquivo não corresponde a {version}: {name}")
        migration = pathlib.Path(migration_path).read_bytes()
        rollback = pathlib.Path(rollback_path).read_bytes()
        readback = pathlib.Path(readback_path).read_bytes()
        migration_text = migration.decode("utf-8")
        if DML.search(strip_sql_comments(migration_text)):
            fail(f"migration {version} contém DML; o release é somente schema")
        name = pathlib.Path(migration_path).stem.removeprefix(version + "_")
        steps.append((version, name, migration, rollback, migration_text, readback.decode("utf-8")))

    print("\\set ON_ERROR_STOP on")
    applied: list[str] = []
    previous = PREVIOUS_TOP
    for version, name, migration, rollback, migration_text, readback_text in steps:
        print(f"-- release senado 2026: {version}_{name}")
        print("BEGIN;")
        print(f"SELECT pg_advisory_xact_lock(hashtextextended({lit(LOCK_KEY)},0));")
        print("LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;")
        print("DO $cas$ BEGIN")
        print(f"  IF (SELECT coalesce(max(version),'') FROM supabase_migrations.schema_migrations) IS DISTINCT FROM {lit(previous)}")
        print(f"     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ({in_list(VERSIONS)})) <> {len(applied)}")
        if applied:
            print(f"     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ({in_list(applied)})) <> {len(applied)}")
        print(f"  THEN RAISE EXCEPTION 'release senado 2026: ledger divergiu sob lock antes de {version}'; END IF;")
        print("END $cas$;")
        print("CREATE TEMP TABLE pf_senado_release_publicavel ON COMMIT DROP AS")
        print("  SELECT count(*) AS total, md5(coalesce(string_agg(id::text || ':' || coalesce(publicavel::text,'null'), ',' ORDER BY id),'')) AS assinatura")
        print("  FROM public.candidatos;")
        print(unwrap(f"migration {version}", migration_text), end="")
        print("INSERT INTO supabase_migrations.schema_migrations")
        print("  (version, statements, name, created_by, idempotency_key, rollback)")
        print("VALUES (")
        print(f"  {lit(version)},")
        print(f"  ARRAY[convert_from(decode({lit(b64(migration))}, 'base64'), 'UTF8')],")
        print(f"  {lit(name)},")
        print(f"  {lit('github-actions:' + sha)},")
        print(f"  {lit('sha256:' + hashlib.sha256(migration).hexdigest())},")
        print(f"  ARRAY[convert_from(decode({lit(b64(rollback))}, 'base64'), 'UTF8')]")
        print(");")
        print(unwrap(f"readback {version}", readback_text), end="")
        print("DO $publicavel$ BEGIN")
        print("  IF (SELECT row(total, assinatura) FROM pg_temp.pf_senado_release_publicavel)")
        print("     IS DISTINCT FROM (SELECT row(count(*), md5(coalesce(string_agg(id::text || ':' || coalesce(publicavel::text,'null'), ',' ORDER BY id),''))) FROM public.candidatos)")
        print(f"  THEN RAISE EXCEPTION 'release senado 2026: candidatos/publicavel mudou em {version}'; END IF;")
        print("END $publicavel$;")
        print("COMMIT;")
        applied.append(version)
        previous = version

    print("-- release senado 2026: readback final do conjunto")
    print("BEGIN READ ONLY;")
    print("DO $final$ BEGIN")
    print(f"  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM {lit(VERSIONS[-1])}")
    print(f"     OR (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ({in_list(VERSIONS)})) <> {len(VERSIONS)}")
    print("  THEN RAISE EXCEPTION 'release senado 2026: ledger final divergiu'; END IF;")
    print("END $final$;")
    for version, _name, _migration, _rollback, _migration_text, readback_text in steps:
        print(unwrap(f"readback final {version}", readback_text), end="")
    print("COMMIT;")


if __name__ == "__main__":
    main(sys.argv[1:])
