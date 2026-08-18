const PUBLIC_TIME_ZONE = "America/Sao_Paulo"
const publicYearFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PUBLIC_TIME_ZONE,
  year: "numeric",
})

export function getCurrentPublicYear(): number {
  return Number(publicYearFormatter.format(new Date()))
}
