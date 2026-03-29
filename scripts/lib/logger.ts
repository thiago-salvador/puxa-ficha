const timestamp = () => new Date().toISOString().slice(11, 19)

export function log(source: string, msg: string) {
  console.log(`${timestamp()} [${source}] ${msg}`)
}

export function warn(source: string, msg: string) {
  console.warn(`${timestamp()} [${source}] ⚠ ${msg}`)
}

export function error(source: string, msg: string) {
  console.error(`${timestamp()} [${source}] ✗ ${msg}`)
}
