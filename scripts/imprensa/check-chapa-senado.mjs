import { getJson, requiredBaseUrl } from './check-utils.mjs'

if (process.env.SENADO_ENABLED !== 'true') {
  throw new Error('CHAPA_SENADO_FAIL SENADO_ENABLED precisa estar true antes de executar')
}
const base = requiredBaseUrl('check-chapa-senado.mjs')
const { data } = await getJson(base, '/api/imprensa/export?format=json&cargo=Senador')
const senators = data.rows.filter((row) => row.cargo === 'Senador')
if (senators.length === 0) throw new Error('CHAPA_SENADO_FAIL nenhum senador no export; verifique SENADO_ENABLED e a fonte')
const failures = []
for (const row of senators) {
  const chapa = row.chapa ?? {}
  if (chapa.estado !== chapa.suplentesEstado || chapa.viceNome !== null) {
    failures.push(`${row.slug}: estado geral deve coincidir com o estado dos suplentes no Senado`)
  }
  if (chapa.suplentesEstado === 'publicado') {
    if (!Array.isArray(chapa.suplentes) || chapa.suplentes.length !== 2 || chapa.suplentes.some((name) => !name) || !/^https:\/\//i.test(chapa.fonteUrl ?? '')) failures.push(`${row.slug}: publicado exige fonte HTTPS e dois suplentes identificados`)
  } else if (chapa.suplentesEstado === 'indeferidos_comprovados') {
    if (!/^https:\/\//i.test(chapa.fonteUrl ?? '') || !/^[a-f0-9]{64}$/i.test(chapa.fonteSha256 ?? '') || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(chapa.snapshotEm ?? '')) failures.push(`${row.slug}: indeferidos exige fonte HTTPS, hash e snapshot ISO`)
    if (chapa.suplentes?.length) failures.push(`${row.slug}: indeferidos não deve listar suplentes elegíveis`)
  } else if (chapa.suplentesEstado === 'indeterminado') {
    if (chapa.suplentes?.length) failures.push(`${row.slug}: indeterminado não deve listar suplentes`)
  } else if (chapa.suplentesEstado !== 'indisponivel') {
    failures.push(`${row.slug}: estado de suplentes sem rótulo contratual (${chapa.suplentesEstado})`)
  }
}
if (failures.length) throw new Error(`CHAPA_SENADO_FAIL ${failures.join('; ')}`)
console.log('CHAPA_SENADO_OK')
