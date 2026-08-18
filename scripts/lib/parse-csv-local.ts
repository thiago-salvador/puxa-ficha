/**
 * Leitura de CSV local (fs + csv-parse) sem Supabase.
 * Extraído de `helpers.ts` para não acoplar scripts só de ficheiro a credenciais de DB.
 */
import { createReadStream } from "node:fs"
import { parse } from "csv-parse"

export async function parseCSV(
  filePath: string,
  onRow: (row: Record<string, string>) => Promise<void> | void,
): Promise<number> {
  let count = 0
  const parser = createReadStream(filePath, { encoding: "latin1" }).pipe(
    parse({
      delimiter: ";",
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      /** Prestações TSE antigas: campos citados podem conter aspas soltas — sem isto o parse falha (ex. 2010–2016). */
      relax_quotes: true,
      cast: (value) => value.trim(),
    }),
  )

  for await (const row of parser) {
    await onRow(row as Record<string, string>)
    count += 1
  }

  return count
}
