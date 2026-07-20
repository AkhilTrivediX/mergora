import type { MetadataRoute } from "next";

import { SITE_BASE_PATH } from "./site-origin";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#ffffff",
    description:
      "Unreleased React component documentation with source ownership and visible evidence gaps.",
    display: "standalone",
    id: `${SITE_BASE_PATH}/`,
    name: "Mergora",
    scope: `${SITE_BASE_PATH}/`,
    short_name: "Mergora",
    start_url: `${SITE_BASE_PATH}/`,
    theme_color: "#ffffff",
  };
}
