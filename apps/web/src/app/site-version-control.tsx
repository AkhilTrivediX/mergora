import { SiteLink as Link } from "./site-link";

export function SiteVersionControl() {
  return (
    <details className="site-version-control">
      <summary aria-describedby="site-version-status">
        <span>Docs</span>
        <strong>0.0.0 · Unreleased</strong>
      </summary>
      <div className="site-version-control__panel">
        <p id="site-version-status">
          <strong>Unreleased checkpoint.</strong> No Stable documentation release exists yet.
        </p>
        <Link href="/releases/unreleased">Checkpoint evidence</Link>
        <Link href="/docs/migrations">Upgrade and migration guidance</Link>
      </div>
    </details>
  );
}
