#!/usr/bin/env node
import { spawn } from "node:child_process"

const [secondsRaw, command, ...args] = process.argv.slice(2)
const seconds = Number(secondsRaw)
if (!Number.isInteger(seconds) || seconds < 1 || !command) {
  console.error("uso: run-with-timeout.mjs SEGUNDOS COMANDO [ARGS...]")
  process.exit(2)
}

const child = spawn(command, args, { detached: true, stdio: "inherit" })
let timedOut = false
let finished = false
let terminating = false

function killGroup(signal) {
  if (!child.pid) return
  try {
    process.kill(-child.pid, signal)
  } catch (error) {
    if (error?.code !== "ESRCH") throw error
  }
}

function finish(code) {
  if (finished) return
  finished = true
  process.exit(code)
}

function terminateGroup(code, message) {
  if (terminating || finished) return
  terminating = true
  timedOut = true
  clearTimeout(timer)
  if (message) console.error(message)
  killGroup("SIGTERM")
  setTimeout(() => {
    killGroup("SIGKILL")
    finish(code)
  }, 2_000)
}

const timer = setTimeout(() => {
  terminateGroup(124, `FAIL: comando excedeu ${seconds}s: ${command}`)
}, seconds * 1_000)

for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
  ["SIGHUP", 129],
  ["SIGQUIT", 131],
]) {
  process.on(signal, () => terminateGroup(code))
}

child.once("error", (error) => {
  clearTimeout(timer)
  console.error(`FAIL: não foi possível executar ${command}: ${error.message}`)
  finish(127)
})

child.once("close", (code, signal) => {
  if (timedOut) return
  clearTimeout(timer)
  if (signal) {
    console.error(`FAIL: ${command} terminou por sinal ${signal}`)
    finish(1)
    return
  }
  finish(code ?? 1)
})
