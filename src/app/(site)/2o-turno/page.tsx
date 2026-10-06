import { redirect } from "next/navigation"

// O 2º turno virou parte da home única em 05/10/2026: duelo, pesquisas e governadores ficam em /.
// Redirect temporário: /2o-turno pode voltar como página própria depois de 25/10.
export default function SegundoTurnoPage() {
  redirect("/")
}
