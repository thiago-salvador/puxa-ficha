import { permanentRedirect } from "next/navigation"

// O resultado do 1º turno virou a home em 05/10/2026; /1o-turno/{uf} continua sendo a página de cada estado.
export default function PrimeiroTurnoPage() {
  permanentRedirect("/")
}
