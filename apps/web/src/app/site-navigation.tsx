"use client";

import { SiteLink as Link } from "./site-link";
import { usePathname } from "next/navigation";

import { navigationIsCurrent, type NavigationItem } from "./site-shell-model";

export function SiteNavigation({ navigation }: { navigation: readonly NavigationItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="site-navigation">
      {navigation.map(([label, href]) => (
        <Link
          aria-current={navigationIsCurrent(pathname, href) ? "page" : undefined}
          href={href}
          key={href}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
