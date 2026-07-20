import { SiteLink as Link } from "./site-link";

export default function NotFoundPage() {
  return (
    <main className="not-found-page" id="main-content">
      <p className="site-eyebrow">404 · route not found</p>
      <h1>This path is outside the current workbench.</h1>
      <p>
        The item may have moved, may still be planned, or may belong to a release that does not
        exist. Search the authoritative catalog rather than guessing a replacement URL.
      </p>
      <nav aria-label="Recovery options">
        <Link href="/components?search=">Search the catalog</Link>
        <Link href="/docs/quick-start">Open quick start</Link>
        <Link href="/">Return home</Link>
      </nav>
    </main>
  );
}
