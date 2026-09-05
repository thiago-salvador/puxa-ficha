"use client"

import { useEffect } from "react"

export function OfflineFallback() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return
    void navigator.serviceWorker.register("/offline-worker.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Unsupported/private browsing must not prevent access to the online site.
    })
  }, [])
  return null
}
