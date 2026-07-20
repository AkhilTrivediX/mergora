import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import { AnnouncerProvider } from "mergora-ui/sr-announcer";
import { SiteLink as Link } from "./site-link";
import type { ReactNode } from "react";

import "mergora-tokens/tokens.css";
import { SiteControls } from "./site-controls";
import { SiteNavigation } from "./site-navigation";
import { SITE_ORIGIN } from "./site-origin";
import { sitePreferenceBootstrap } from "./site-preferences";
import { SiteRouteAnnouncer } from "./site-route-announcer";
import { SiteRuntimeProvider } from "./site-runtime-provider";
import { SiteSearch } from "./site-search";
import { siteSearchIndexDigest } from "./site-search-index";
import "./styles.css";

const primaryTypeface = localFont({
  src: "../../../../assets/fonts/schibsted-grotesk-site-basic-wght.woff2",
  display: "optional",
  fallback: ["Arial", "sans-serif"],
  preload: true,
  style: "normal",
  variable: "--mrg-site-primary-typeface",
  weight: "400 900",
});

const extendedTypeface = localFont({
  src: "../../../../assets/fonts/schibsted-grotesk-latin-ext-wght.woff2",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  preload: false,
  style: "normal",
  variable: "--mrg-site-extended-typeface",
  weight: "400 900",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  description: "Production React components with safe source updates and visible quality evidence.",
  title: {
    default: "Mergora — own the source, keep the upgrades",
    template: "%s — Mergora",
  },
};

const primaryNavigation = [
  ["Components", "/components"],
  ["Systems", "/systems"],
  ["Kits", "/kits"],
  ["Studio", "/studio"],
  ["Docs", "/docs"],
] as const;

const preferenceBootstrap = sitePreferenceBootstrap();

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      data-density="comfortable"
      data-density-preference="comfortable"
      data-direction="ltr"
      data-direction-preference="ltr"
      data-motion-preference="system"
      data-theme-preference="system"
      dir="ltr"
      lang="en"
      suppressHydrationWarning
    >
      <Script
        dangerouslySetInnerHTML={{ __html: preferenceBootstrap }}
        id="mergora-site-preferences"
        strategy="beforeInteractive"
      />
      <body className={`${primaryTypeface.variable} ${extendedTypeface.variable}`}>
        <AnnouncerProvider>
          <div id="site-application-root">
            <a className="site-skip-link" href="#main-content">
              Skip to content
            </a>
            <header className="site-header">
              <div className="site-header__inner">
                <Link className="site-wordmark" href="/">
                  <span aria-hidden="true" className="site-wordmark__mark">
                    M
                  </span>
                  <span>Mergora</span>
                </Link>
                <SiteNavigation navigation={primaryNavigation} />
                <SiteControls navigation={primaryNavigation} />
              </div>
            </header>
            <SiteRuntimeProvider>
              <SiteSearch indexDigest={siteSearchIndexDigest} />
            </SiteRuntimeProvider>
            <SiteRouteAnnouncer />
            {children}
            <footer className="site-footer">
              <div className="site-footer__inner">
                <div>
                  <strong>Mergora</strong>
                  <p>Open components that remain safe to evolve.</p>
                </div>
                <nav aria-label="Footer">
                  <Link href="/quality">Quality evidence</Link>
                  <Link href="/support">Support</Link>
                  <Link href="/community">Community</Link>
                  <a href="https://github.com/AkhilTrivediX/mergora">GitHub repository</a>
                </nav>
              </div>
            </footer>
          </div>
        </AnnouncerProvider>
      </body>
    </html>
  );
}
