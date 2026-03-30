"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const NAV_ITEMS = [
  { href: "/", label: "Presidencia" },
  { href: "/governadores", label: "Governadores" },
  { href: "/sobre", label: "Sobre" },
]

export function Navbar() {
  const pathname = usePathname()
  const containerRef = useRef<HTMLDivElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const hasOpened = useRef(false)
  const tlRef = useRef<ReturnType<typeof import("gsap")["gsap"]["timeline"]> | null>(null)

  function isActive(href: string) {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

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

    let cancelled = false

    import("gsap").then(({ gsap }) => {
      if (cancelled || !containerRef.current) return

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
  }, [isMenuOpen])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMenuOpen) setIsMenuOpen(false)
    }
    window.addEventListener("keydown", handleEsc)
    return () => window.removeEventListener("keydown", handleEsc)
  }, [isMenuOpen])

  const toggleMenu = useCallback(() => setIsMenuOpen((prev) => !prev), [])
  const closeMenu = useCallback(() => setIsMenuOpen(false), [])

  return (
    <div ref={containerRef}>
      {/* Header: transparent -> glass on scroll */}
      <header
        className={`fixed top-0 z-[60] w-full transition-all duration-300 ${
          scrolled
            ? "border-b border-black/5 bg-white/80 backdrop-blur-md"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-12">
          <Link
            href="/"
            className="font-heading text-[18px] uppercase tracking-[-0.01em] text-black"
          >
            Puxa Ficha
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden items-center gap-8 md:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-[12px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                  isActive(item.href) ? "text-black" : "text-black/40 hover:text-black"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Menu button */}
          <button
            className="menu-btn relative z-[60] flex items-center gap-3 overflow-hidden"
            onClick={toggleMenu}
            aria-label={isMenuOpen ? "Fechar menu" : "Abrir menu"}
          >
            <div className="h-[20px] overflow-hidden">
              <p className="text-[12px] font-bold uppercase tracking-[0.08em] leading-[20px] text-black">Menu</p>
              <p className="text-[12px] font-bold uppercase tracking-[0.08em] leading-[20px] text-black">Fechar</p>
            </div>
            <div className="flex size-8 items-center justify-center rounded-full border border-black/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                className="menu-button-icon text-black"
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

      {/* Fullscreen menu overlay */}
      <div className="nav-overlay-wrapper fixed inset-0 z-[55]" style={{ display: "none" }}>
        <div
          className="overlay absolute inset-0 bg-black/40"
          onClick={closeMenu}
          style={{ visibility: "hidden", opacity: 0 }}
        />

        <nav className="menu-content absolute inset-y-0 right-0 w-full sm:w-[560px]">
          <div className="absolute inset-0">
            <div className="backdrop-layer absolute inset-0 bg-muted/50" />
            <div className="backdrop-layer absolute inset-0 bg-muted/80" />
            <div className="backdrop-layer absolute inset-0 bg-card" />
          </div>

          <div className="relative flex h-full flex-col justify-center px-6 md:px-12">
            <ul className="flex flex-col">
              {NAV_ITEMS.map((item) => (
                <li key={item.href} className="overflow-hidden">
                  <Link
                    href={item.href}
                    onClick={closeMenu}
                    className="nav-link menu-nav-link"
                  >
                    <div className="link-stripe" />
                    <span className="link-text font-heading text-[clamp(2rem,6vw,3.2rem)]">
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

            <div className="mt-16 flex items-center justify-between" data-menu-fade>
              <p className="text-xs text-muted-foreground">
                Puxa Ficha 2026
                <br />
                Dados publicos oficiais
              </p>
              <p className="text-xs text-muted-foreground">
                TSE &middot; Camara &middot; Senado
              </p>
            </div>
          </div>
        </nav>
      </div>
    </div>
  )
}
