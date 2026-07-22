const requestedBasePath = process.env.MERGORA_BASE_PATH ?? "";
if (
  requestedBasePath !== "" &&
  (!requestedBasePath.startsWith("/") ||
    requestedBasePath.endsWith("/") ||
    requestedBasePath.includes(".."))
) {
  throw new Error(
    "MERGORA_BASE_PATH must be empty or a root-relative path without a trailing slash or traversal.",
  );
}

/** @type {import("next").NextConfig} */
const nextConfig = {
  basePath: requestedBasePath,
  env: { NEXT_PUBLIC_MERGORA_BASE_PATH: requestedBasePath },
  images: { unoptimized: true },
  output: "export",
  reactStrictMode: true,
  trailingSlash: true,
};

export default nextConfig;
