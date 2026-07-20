import { SiteLink as Link } from "../site-link";
import { pageMetadata } from "../site-origin";

import implementationMatrix from "../../../../../registry/generated/implementation-matrix.v1.json";

export const metadata = pageMetadata({
  description:
    "Inspect Mergora implementation, accessibility, interaction, parity, and maturity evidence without certification shortcuts.",
  pathname: "/quality",
  title: "Quality evidence",
});

export default function QualityPage() {
  const profiled = implementationMatrix.items.filter(
    (item) => item.profileStatus !== "audit-pending",
  ).length;
  const interactionVerified = implementationMatrix.items.filter(
    (item) => item.interactionEvidence.status === "verified",
  ).length;
  const parityVerified = implementationMatrix.items.filter(
    (item) => item.packageSourceShadcnParity.assessment.status === "verified",
  ).length;

  return (
    <main className="quality-page" id="main-content">
      <header className="quality-page__header">
        <p className="site-eyebrow">Quality program</p>
        <h1>Evidence before maturity.</h1>
        <p>
          Automated checks, manual assistive-technology records, browser matrices, generated parity,
          packed consumers, and release provenance remain separate evidence families. A missing
          record is shown as missing—not converted into a green badge.
        </p>
        <dl>
          <div>
            <dt>Catalog records</dt>
            <dd>{implementationMatrix.items.length}</dd>
          </div>
          <div>
            <dt>Profiled checkpoints</dt>
            <dd>{profiled}</dd>
          </div>
          <div>
            <dt>Interaction verified</dt>
            <dd>{interactionVerified}</dd>
          </div>
          <div>
            <dt>Parity verified</dt>
            <dd>{parityVerified}</dd>
          </div>
        </dl>
      </header>
      <section className="quality-page__methods">
        <p className="site-eyebrow">Interpretation</p>
        <h2>Automation is necessary and incomplete.</h2>
        <div>
          <article>
            <h3>Implementation</h3>
            <p>
              Canonical source, public API, baseline comparison, advantage, and opt-out behavior.
            </p>
          </article>
          <article>
            <h3>Interaction</h3>
            <p>
              Keyboard, pointer, touch, responsive reflow, RTL, reduced motion, and forced colors.
            </p>
          </article>
          <article>
            <h3>Assistive technology</h3>
            <p>
              Manual screen-reader, mobile AT, speech, switch, and real-device records where
              relevant.
            </p>
          </article>
          <article>
            <h3>Distribution</h3>
            <p>Canonical source, package, native registry, Shadcn output, and packed consumers.</p>
          </article>
        </div>
      </section>
      <section className="quality-page__records">
        <header>
          <p className="site-eyebrow">Current generated checkpoint</p>
          <h2>Item evidence records</h2>
        </header>
        <div className="site-table-wrap" tabIndex={0}>
          <table>
            <caption>Mergora item quality evidence status</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Profile</th>
                <th scope="col">Interaction</th>
                <th scope="col">Accessibility</th>
                <th scope="col">Maturity</th>
              </tr>
            </thead>
            <tbody>
              {implementationMatrix.items.map((item) => (
                <tr key={item.id}>
                  <th scope="row">
                    <Link href={`/quality/${item.id}`}>{item.displayName}</Link>
                  </th>
                  <td>{item.profileStatus.replaceAll("-", " ")}</td>
                  <td>{item.interactionEvidence.status.replaceAll("-", " ")}</td>
                  <td>{item.accessibilityEvidence.status.replaceAll("-", " ")}</td>
                  <td>{item.maturity.assessment.status.replaceAll("-", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
