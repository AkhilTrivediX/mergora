import type { Metadata } from "next";

const DEFAULT_SITE_ORIGIN = "https://akhiltrivedix.github.io/mergora";

function validateOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("MERGORA_SITE_ORIGIN must be an absolute HTTPS URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    (url.pathname !== "/" && url.pathname.endsWith("/"))
  ) {
    throw new Error(
      "MERGORA_SITE_ORIGIN must be an HTTPS origin/base path without credentials, query, fragment, or trailing slash.",
    );
  }
  return url.toString().replace(/\/$/u, "");
}

export const SITE_ORIGIN = validateOrigin(process.env.MERGORA_SITE_ORIGIN ?? DEFAULT_SITE_ORIGIN);
export const SITE_BASE_PATH = new URL(SITE_ORIGIN).pathname.replace(/\/$/u, "");

export function absoluteSiteUrl(pathname: string): string {
  if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("..")) {
    throw new Error(`Site path must be root-relative and traversal-free: ${pathname}`);
  }
  return `${SITE_ORIGIN}${pathname}`;
}

export function pageMetadata({
  description,
  pathname,
  title,
}: {
  readonly description: string;
  readonly pathname: string;
  readonly title: string;
}): Metadata {
  const canonical = absoluteSiteUrl(pathname);
  return {
    alternates: { canonical },
    description,
    openGraph: {
      description,
      siteName: "Mergora",
      title,
      type: "website",
      url: canonical,
    },
    title,
    twitter: {
      card: "summary",
      description,
      title,
    },
  };
}
