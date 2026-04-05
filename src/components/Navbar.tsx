"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import Link from "next/link"

const NAV_ITEMS = [
  { href: "/", label: "Presidencia" },
  { href: "/governadores", label: "Governadores" },
  { href: "/comparar", label: "Comparar" },
  { href: "/quiz", label: "Quiz" },
  { href: "/sobre", label: "Sobre" },
]

export function Navbar() {
  const containerRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const navLinkRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const hasOpened = useRef(false)
  const shouldRestoreFocusRef = useRef(false)
  const tlRef = useRef<ReturnType<typeof import("gsap")["gsap"]["timeline"]> | null>(null)

  const getFocusableElements = useCallback(() => {
    if (!panelRef.current) return []
    return Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    )
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches)

    updatePreference()
    mediaQuery.addEventListener("change", updatePreference)

    return () => mediaQuery.removeEventListener("change", updatePreference)
  }, [])

  // Scroll detection for header transparency
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // GSAP loaded on demand (zero cost until first menu open)
  useEffect(() => {
    if (!containerRef.current) return
    if (!isMenuOpen && !hasOpened.current) return
    if (isMenuOpen) hasOpened.current = true

    const container = containerRef.current
    const navWrap = container.querySelector(".nav-overlay-wrapper") as HTMLElement | null
    const overlay = container.querySelector(".overlay") as HTMLElement | null
    const bgPanels = container.querySelectorAll(".backdrop-layer")
    const navLinks = container.querySelectorAll(".nav-link")
    const fadeTargets = container.querySelectorAll("[data-menu-fade]")
    const menuBtn = container.querySelector(".menu-btn")
    const menuTexts = menuBtn ? menuBtn.querySelectorAll("p") : []
    const menuIcon = menuBtn ? menuBtn.querySelector(".menu-button-icon") : null

    if (!navWrap || !overlay) return

    if (prefersReducedMotion) {
      tlRef.current?.kill()
      navWrap.style.display = isMenuOpen ? "block" : "none"
      overlay.style.visibility = isMenuOpen ? "visible" : "hidden"
      overlay.style.opacity = isMenuOpen ? "1" : "0"

      bgPanels.forEach((panel) => {
        ;(panel as HTMLElement).style.transform = isMenuOpen
          ? "translateX(0%)"
          : "translateX(101%)"
      })

      navLinks.forEach((link) => {
        ;(link as HTMLElement).style.opacity = isMenuOpen ? "1" : "0"
        ;(link as HTMLElement).style.transform = "none"
      })

      fadeTargets.forEach((target) => {
        ;(target as HTMLElement).style.opacity = isMenuOpen ? "1" : "0"
        ;(target as HTMLElement).style.transform = "none"
      })

      menuTexts.forEach((text) => {
        ;(text as HTMLElement).style.transform = isMenuOpen
          ? "translateY(-100%)"
          : "translateY(0%)"
      })

      if (menuIcon) {
        ;(menuIcon as HTMLElement).style.transform = isMenuOpen
          ? "rotate(315deg)"
          : "rotate(0deg)"
      }

      return
    }

    let cancelled = false

    import("gsap").then(({ gsap }) => {
      if (cancelled || !containerRef.current) return

      tlRef.current?.kill()
      const tl = gsap.timeline({ defaults: { ease: "power3.inOut", duration: 0.7 } })
      tlRef.current = tl

      if (isMenuOpen) {
        tl.set(navWrap, { display: "block" })
        if (menuTexts.length) {
          tl.fromTo(menuTexts, { yPercent: 0 }, { yPercent: -100, stagger: 0.2, duration: 0.5 })
        }
        if (menuIcon) tl.fromTo(menuIcon, { rotate: 0 }, { rotate: 315, duration: 0.5 }, "<")
        tl.fromTo(overlay, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, "<")
          .fromTo(bgPanels, { xPercent: 101 }, { xPercent: 0, stagger: 0.12, duration: 0.575, ease: "power2.out" }, "<")
        if (navLinks.length) {
          tl.fromTo(
            navLinks,
            { yPercent: 140, rotate: 10 },
            { yPercent: 0, rotate: 0, stagger: 0.05, duration: 0.7, ease: "power3.out" },
            "<+=0.35"
          )
        }
        if (fadeTargets.length) {
          tl.fromTo(
            fadeTargets,
            { autoAlpha: 0, yPercent: 50 },
            { autoAlpha: 1, yPercent: 0, stagger: 0.04, duration: 0.4, clearProps: "all" },
            "<+=0.2"
          )
        }
      } else {
        tl.to(overlay, { autoAlpha: 0, duration: 0.3 })
        if (navLinks.length) {
          tl.to(navLinks, { yPercent: -40, opacity: 0, stagger: 0.03, duration: 0.25, ease: "power2.in" }, "<")
        }
        tl.to(bgPanels, { xPercent: 101, stagger: 0.06, duration: 0.4, ease: "power2.in" }, "<+=0.1")
        if (menuTexts.length) tl.to(menuTexts, { yPercent: 0, duration: 0.4 }, "<")
        if (menuIcon) tl.to(menuIcon, { rotate: 0, duration: 0.4 }, "<")
        tl.set(navWrap, { display: "none" })
        if (navLinks.length) tl.set(navLinks, { clearProps: "all" })
      }
    })

    return () => {
      cancelled = true
      tlRef.current?.kill()
    }
  }, [isMenuOpen, prefersReducedMotion])

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [isMenuOpen])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (!isMenuOpen) return

      if (e.key === "Escape") {
        shouldRestoreFocusRef.current = true
        setIsMenuOpen(false)
        return
      }

      if (e.key !== "Tab") return

      const focusable = getFocusableElements()
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (!active || !panelRef.current?.contains(active)) {
        e.preventDefault()
        first.focus()
        return
      }

      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener("keydown", handleEsc)
    return () => window.removeEventListener("keydown", handleEsc)
  }, [getFocusableElements, isMenuOpen])

  useEffect(() => {
    if (!isMenuOpen) {
      if (shouldRestoreFocusRef.current) {
        menuButtonRef.current?.focus()
        shouldRestoreFocusRef.current = false
      }
      return
    }

    const frame = window.requestAnimationFrame(() => {
      const firstLink = navLinkRefs.current.find(Boolean)
      firstLink?.focus()
      if (!firstLink) {
        closeButtonRef.current?.focus()
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [isMenuOpen])

  const toggleMenu = useCallback(() => {
    setIsMenuOpen((prev) => {
      shouldRestoreFocusRef.current = prev
      return !prev
    })
  }, [])

  const closeMenu = useCallback(() => {
    shouldRestoreFocusRef.current = true
    setIsMenuOpen(false)
  }, [])

  // Text should be dark (black) when scrolled OR when menu is open (white bg panel)
  const useDarkText = scrolled || isMenuOpen

  return (
    <div ref={containerRef}>
      {/* Header: transparent -> glass on scroll */}
      <header
        className={`fixed top-0 z-[60] w-full transition-all duration-300 ${
          scrolled
            ? "glass-nav"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-12">
          <Link
            href="/"
            className={`flex items-center gap-2 font-heading text-[18px] uppercase tracking-[-0.01em] transition-colors duration-300 ${
              useDarkText ? "text-black" : "text-white"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/logo-icon-sm.png"
              alt="Puxa Ficha logo"
              className={`size-7 transition-all duration-300 ${useDarkText ? "" : "invert"}`}
            />
            Puxa Ficha
          </Link>

          {/* Menu button */}
          <button
            ref={menuButtonRef}
            type="button"
            className="menu-btn relative z-[70] flex items-center gap-3 overflow-hidden max-sm:min-h-11 max-sm:min-w-11 max-sm:justify-center"
            onClick={toggleMenu}
            aria-label={isMenuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={isMenuOpen}
            aria-controls="primary-navigation-panel"
            aria-haspopup="dialog"
          >
            <div className="h-[20px] overflow-hidden">
              <p className={`font-heading text-[13px] uppercase tracking-[0.05em] leading-[20px] transition-colors duration-300 ${useDarkText ? "text-black" : "text-white"}`}>Menu</p>
              <p className={`font-heading text-[13px] uppercase tracking-[0.05em] leading-[20px] transition-colors duration-300 ${useDarkText ? "text-black" : "text-white"}`}>Fechar</p>
            </div>
            <div className={`flex size-8 items-center justify-center rounded-full border transition-colors duration-300 ${useDarkText ? "border-black/15" : "border-white/20"}`}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                className={`menu-button-icon transition-colors duration-300 ${useDarkText ? "text-black" : "text-white"}`}
              >
                <path d="M7.33333 16L7.33333 -3.2055e-07L8.66667 -3.78832e-07L8.66667 16L7.33333 16Z" fill="currentColor" />
                <path d="M16 8.66667L-2.62269e-07 8.66667L-3.78832e-07 7.33333L16 7.33333L16 8.66667Z" fill="currentColor" />
                <path d="M6 7.33333L7.33333 7.33333L7.33333 6C7.33333 6.73637 6.73638 7.33333 6 7.33333Z" fill="currentColor" />
                <path d="M10 7.33333L8.66667 7.33333L8.66667 6C8.66667 6.73638 9.26362 7.33333 10 7.33333Z" fill="currentColor" />
                <path d="M6 8.66667L7.33333 8.66667L7.33333 10C7.33333 9.26362 6.73638 8.66667 6 8.66667Z" fill="currentColor" />
                <path d="M10 8.66667L8.66667 8.66667L8.66667 10C8.66667 9.26362 9.26362 8.66667 10 8.66667Z" fill="currentColor" />
              </svg>
            </div>
          </button>
        </div>
      </header>

      {/* Fullscreen menu overlay — z-65 so it covers the header (z-60) */}
      <div className="nav-overlay-wrapper fixed inset-0 z-[65]" style={{ display: "none" }}>
        <button
          type="button"
          className="overlay absolute inset-0 bg-black/40"
          onClick={closeMenu}
          aria-label="Fechar menu"
          style={{ visibility: "hidden", opacity: 0 }}
        />

        <nav
          id="primary-navigation-panel"
          ref={panelRef}
          className="menu-content absolute inset-y-0 right-0 w-full sm:w-[560px]"
          role="dialog"
          aria-modal="true"
          aria-label="Menu principal"
        >
          <div className="absolute inset-0">
            <div className="backdrop-layer absolute inset-0 bg-muted/50" />
            <div className="backdrop-layer absolute inset-0 bg-muted/80" />
            <div className="backdrop-layer absolute inset-0 bg-card" />
          </div>

          <div className="relative flex h-full flex-col px-8 pt-20 pb-10 sm:px-12 md:px-16">
            {/* Close button inside menu panel */}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeMenu}
              className="absolute right-8 top-5 z-10 flex items-center gap-3 sm:right-12 md:right-16"
              aria-label="Fechar menu"
            >
              <span className="font-heading text-[13px] uppercase tracking-[0.05em] text-black">
                Fechar
              </span>
              <div className="flex size-8 items-center justify-center rounded-full border border-black/15">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-black">
                  <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
            </button>

            {/* Nav links */}
            <ul className="mt-auto mb-auto flex flex-col gap-1">
              {NAV_ITEMS.map((item, index) => (
                <li key={item.href} className="overflow-hidden">
                  <Link
                    href={item.href}
                    onClick={closeMenu}
                    className="nav-link menu-nav-link"
                    ref={(element) => {
                      navLinkRefs.current[index] = element
                    }}
                  >
                    <div className="link-stripe" />
                    <span className="link-text font-heading text-[clamp(2.2rem,7vw,3.5rem)]">
                      {item.label}
                    </span>
                    <svg
                      className="link-arrow size-6"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M7 17L17 7M17 7H7M17 7V17" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Footer */}
            <div className="flex items-end justify-between border-t border-black/8 pt-6" data-menu-fade>
              <div>
                <p className="font-heading text-[14px] uppercase tracking-[0.02em] text-black">
                  Puxa Ficha
                </p>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.1em] text-black">
                  Eleicoes 2026
                </p>
              </div>
              <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-black">
                TSE &middot; Camara &middot; Senado
              </p>
            </div>
          </div>
        </nav>
      </div>
    </div>
  )
}
