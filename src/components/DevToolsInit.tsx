"use client"

import { useEffect } from "react"

export default function DevToolsInit() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      import("agent-react-devtools/connect")
    }
  }, [])
  return null
}
