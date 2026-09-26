import { getJson, requiredBaseUrl } from './check-utils.mjs'

const base = requiredBaseUrl('check-chapa-senado.mjs')
const { data } = await getJson(base, '/api/imprensa/export?format=json&cargo=Senador')
const failures = data.rows.filter((row) => row.cargo === 'Senador' && row.chapa?.estado === 'sem_dado' && !row.chapa?.viceNome)
if (failures.length) throw new Error(`CHAPA_SENADO_FAIL sem_dado_sem_vice=${failures.length}`)
console.log('CHAPA_SENADO_OK')
