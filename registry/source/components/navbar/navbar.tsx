"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import "./navbar.css";

export interface NavbarItem {
  /** Renders a non-interactive aria-disabled item while preserving its visible label. */
  readonly disabled?: boolean;
  /** Safe destination used by enabled anchors after prohibited protocols are rejected. */
  readonly href: string;
  /** Non-empty unique identity used by currentId to expose aria-current="page". */
  readonly id: string;
  /** Visible navigation copy shared by the desktop and mobile presentations. */
  readonly label: ReactNode;
}

export interface NavbarRouteStatus {
  /** Drives the route-state marker, loading busy state, and live-region priority. */
  readonly state: "error" | "idle" | "loading";
  /** Visible router-owned status announced politely, or assertively for errors. */
  readonly text: ReactNode;
}

export interface NavbarSkipLink {
  /** Same-document hash destination reached by the keyboard-first skip link. */
  readonly href: `#${string}`;
  /** Visible and accessible text for the focus-revealed skip-link anchor. */
  readonly label: ReactNode;
}

export function isSafeNavbarHref(href: string): boolean {
  const normalized = href.trim();
  const protocolProbe = normalized.replace(/[\p{Cc}\s]/gu, "").toLowerCase();
  return normalized.length > 0 && !/^(?:data|javascript|vbscript):/u.test(protocolProbe);
}

export interface NavbarProps extends Omit<React.ComponentPropsWithoutRef<"header">, "children"> {
  /** Visible product or site identity rendered once in the shared navigation bar. */
  readonly brand: ReactNode;
  /** Localized toggle text shown while the responsive mobile navigation is open. */
  readonly closeLabel?: string;
  /** Item identity exposed as aria-current="page" in both responsive presentations. */
  readonly currentId?: string;
  /** Initial mobile-menu state for uncontrolled use; later changes remain internal. */
  readonly defaultOpen?: boolean;
  /** Non-empty model rendered in the same logical order across desktop and narrow mobile lists. */
  readonly items: readonly NavbarItem[];
  /** Accessible name for desktop navigation; the mobile name adds a mobile qualifier. */
  readonly label?: string;
  /** Localized toggle text shown while the responsive mobile navigation is closed. */
  readonly menuLabel?: string;
  /** Receives enabled anchor activation before mobile auto-close; preventDefault keeps it open. */
  readonly onNavigate?: (event: MouseEvent<HTMLAnchorElement>, item: NavbarItem) => void;
  /** Reports every proposed mobile-menu state in controlled and uncontrolled modes. */
  readonly onOpenChange?: (open: boolean) => void;
  /** Controlled mobile-menu state; pair with onOpenChange to accept proposed changes. */
  readonly open?: boolean;
  /** Optional router-owned status; omission removes its output, live region, and busy state. */
  readonly routeStatus?: NavbarRouteStatus;
  /** Configures the keyboard skip link, or false to remove its anchor and focus target. */
  readonly skipLink?: false | NavbarSkipLink;
}

export const Navbar = forwardRef<HTMLElement, NavbarProps>(function Navbar(
  {
    brand,
    className,
    closeLabel = "Close navigation",
    currentId,
    defaultOpen = false,
    items,
    label = "Primary navigation",
    menuLabel = "Open navigation",
    onNavigate,
    onOpenChange,
    open,
    routeStatus,
    skipLink = { href: "#main-content", label: "Skip to main content" },
    ...props
  },
  ref,
) {
  if (items.length === 0) throw new Error("Mergora Navbar requires at least one item.");
  const ids = new Set<string>();
  for (const item of items) {
    if (item.id.trim().length === 0 || ids.has(item.id)) {
      throw new Error("Mergora Navbar item ids must be non-empty and unique.");
    }
    ids.add(item.id);
    if (!isSafeNavbarHref(item.href)) {
      throw new Error("Mergora Navbar item href uses a prohibited protocol.");
    }
  }
  if (currentId !== undefined && !ids.has(currentId)) {
    throw new Error("Mergora Navbar currentId must identify an item.");
  }
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const resolvedOpen = open ?? uncontrolledOpen;
  const panelId = `mrg-navbar-panel-${useId().replaceAll(":", "")}`;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const previousOpenRef = useRef(resolvedOpen);
  const returnFocusOnCloseRef = useRef(false);
  const setOpen = (next: boolean, returnFocus = false) => {
    returnFocusOnCloseRef.current = !next && returnFocus;
    if (open === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  useEffect(() => {
    if (previousOpenRef.current && !resolvedOpen && returnFocusOnCloseRef.current) {
      queueMicrotask(() => toggleRef.current?.focus());
    }
    if (!previousOpenRef.current && resolvedOpen) returnFocusOnCloseRef.current = false;
    previousOpenRef.current = resolvedOpen;
  }, [resolvedOpen]);
  const handlePanelKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    setOpen(false, true);
  };
  const links = (mobile: boolean) => (
    <ul data-slot={mobile ? "navbar-mobile-list" : "navbar-list"}>
      {items.map((item) => (
        <li key={item.id}>
          {item.disabled ? (
            <span
              aria-current={item.id === currentId ? "page" : undefined}
              aria-disabled="true"
              className="mrg-navbar__link"
              data-disabled=""
            >
              {item.label}
            </span>
          ) : (
            <a
              aria-current={item.id === currentId ? "page" : undefined}
              className="mrg-navbar__link"
              href={item.href}
              onClick={(event) => {
                onNavigate?.(event, item);
                if (!event.defaultPrevented && mobile) setOpen(false);
              }}
            >
              {item.label}
            </a>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <header
      {...props}
      aria-busy={routeStatus?.state === "loading" ? true : undefined}
      className={["mrg-navbar", className].filter(Boolean).join(" ")}
      data-route-state={routeStatus?.state}
      data-slot="navbar"
      ref={ref}
    >
      {skipLink === false ? null : (
        <a className="mrg-navbar__skip" data-slot="navbar-skip-link" href={skipLink.href}>
          {skipLink.label}
        </a>
      )}
      <div className="mrg-navbar__bar">
        <div className="mrg-navbar__brand" data-slot="navbar-brand">
          {brand}
        </div>
        <nav aria-label={label} className="mrg-navbar__desktop" data-slot="navbar-desktop">
          {links(false)}
        </nav>
        <button
          aria-controls={panelId}
          aria-expanded={resolvedOpen}
          className="mrg-navbar__toggle"
          data-slot="navbar-toggle"
          onClick={() => setOpen(!resolvedOpen, resolvedOpen)}
          ref={toggleRef}
          type="button"
        >
          {resolvedOpen ? closeLabel : menuLabel}
        </button>
      </div>
      <nav
        aria-label={`${label} mobile`}
        className="mrg-navbar__mobile"
        data-slot="navbar-mobile"
        hidden={!resolvedOpen}
        id={panelId}
        onKeyDown={handlePanelKeyDown}
      >
        {links(true)}
      </nav>
      {routeStatus === undefined ? null : (
        <output
          aria-live={routeStatus.state === "error" ? "assertive" : "polite"}
          className="mrg-navbar__route-status"
          data-slot="navbar-route-status"
        >
          {routeStatus.text}
        </output>
      )}
    </header>
  );
});

Navbar.displayName = "Navbar";
