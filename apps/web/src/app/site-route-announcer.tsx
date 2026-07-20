"use client";

import { useAnnouncer } from "mergora-ui/sr-announcer";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { routeAnnouncementMessage } from "./site-shell-model";

function currentRouteLabel(): string | null {
  const heading = document.querySelector<HTMLElement>("main h1")?.textContent?.trim();
  if (heading) return heading;
  const title = document.title.split("—", 1)[0]?.trim();
  return title === "" ? null : (title ?? null);
}

export function SiteRouteAnnouncer() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const { announce } = useAnnouncer();

  useEffect(() => {
    if (pathname === previousPathname.current) return;
    previousPathname.current = pathname;
    const frame = window.requestAnimationFrame(() => {
      announce(routeAnnouncementMessage(currentRouteLabel()), {
        dedupeKey: `site-route:${pathname}`,
        priority: "polite",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [announce, pathname]);

  return null;
}
