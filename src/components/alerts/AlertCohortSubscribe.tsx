"use client"

import { FormEvent, useState } from "react"
import { LoaderCircle, Mail } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ALERT_COHORT_CARGOS, ALERT_COHORT_UFS } from "@/lib/alerts-cohort"

export interface AlertCohortSubscribeProps {
  initialCargo?: string
  initialUf?: string | null
  senadoEnabled?: boolean
  className?: string
}

/** Formulário de recorte puro para ser embutido na Mesa de Imprensa. */
export function AlertCohortSubscribe({
  initialCargo = "Governador",
  initialUf = null,
  senadoEnabled = false,
  className,
}: AlertCohortSubscribeProps) {
  const [email, setEmail] = useState("")
  const cargos = ALERT_COHORT_CARGOS.filter((option) => senadoEnabled || option !== "Senador")
  const safeInitialCargo = (cargos as readonly string[]).includes(initialCargo)
    ? initialCargo
    : "Governador"
  const [cargo, setCargo] = useState(safeInitialCargo)
  const safeInitialUf = initialUf && (ALERT_COHORT_UFS as readonly string[]).includes(initialUf.toUpperCase())
    ? initialUf.toUpperCase()
    : ""
  const [uf, setUf] = useState(safeInitialUf)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage(null)
    setError(null)
    try {
      const response = await fetch("/api/alerts/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          cohortSubscriptions: [{ cargo, uf: cargo === "Presidente" ? null : uf || null }],
        }),
      })
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(data?.error || "Não foi possível criar o alerta agora.")
      setMessage("Confira seu email ou abra a gestão dos alertas. O recorte será atualizado a cada digest.")
      setEmail("")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível criar o alerta agora.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={(event) => { void submit(event) }} className={className}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">
          Cargo
          <select value={cargo} onChange={(event) => setCargo(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3">
            {cargos.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          UF
          <select value={cargo === "Presidente" ? "" : uf} onChange={(event) => setUf(event.target.value)} disabled={cargo === "Presidente"} className="h-10 rounded-md border border-input bg-background px-3">
            <option value="">Todos os estados</option>
            {ALERT_COHORT_UFS.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Email
          <Input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" autoComplete="email" />
        </label>
      </div>
      <Button type="submit" disabled={loading} className="mt-3">
        {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Mail className="size-4" />}
        Receber atualizações deste recorte
      </Button>
      {message && <Alert className="mt-3"><AlertTitle>Pedido recebido</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>}
      {error && <Alert variant="destructive" className="mt-3"><AlertTitle>Não foi possível assinar</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    </form>
  )
}
