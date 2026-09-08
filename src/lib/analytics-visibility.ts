/** Report a visible result once. Observation is disconnected by React cleanup. */
export function observeAnalyticsResult(target: Element, onViewed: () => void): () => void {
  if (typeof IntersectionObserver === "undefined") return () => {}
  let reported = false
  const observer = new IntersectionObserver((entries) => {
    if (reported || !entries.some((entry) => entry.isIntersecting)) return
    reported = true
    observer.disconnect()
    onViewed()
  }, { threshold: 0 })
  observer.observe(target)
  return () => {
    reported = true
    observer.disconnect()
  }
}
