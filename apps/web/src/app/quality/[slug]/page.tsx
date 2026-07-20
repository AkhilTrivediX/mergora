import type { Metadata } from "next";
import { notFound } from "next/navigation";

import implementationMatrix from "../../../../../../registry/generated/implementation-matrix.v1.json";
import { passportMachineDocument } from "../../machine-documents";
import { SiteLink as Link } from "../../site-link";
import { pageMetadata } from "../../site-origin";

export const dynamicParams = false;

export function generateStaticParams() {
  return implementationMatrix.items.map((item) => ({ slug: item.id }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const passport = passportMachineDocument(slug);
  if (passport === null) return {};
  return pageMetadata({
    description: `Blocked, unreleased Quality Passport skeleton and missing evidence for ${passport.displayName}.`,
    pathname: `/quality/${passport.id}`,
    title: `${passport.displayName} Quality Passport — blocked and unreleased`,
  });
}

function humanize(value: string): string {
  return value.replaceAll("-", " ");
}

export default async function QualityPassportPage({
  params,
}: {
  readonly params: Promise<{ readonly slug: string }>;
}) {
  const { slug } = await params;
  const passport = passportMachineDocument(slug);
  const matrix = implementationMatrix.items.find((candidate) => candidate.id === slug);
  if (passport === null || matrix === undefined) notFound();
  const canonicalRoute = `/${matrix.layer === "kit" ? "kits" : matrix.layer === "system" ? "systems" : "components"}/${slug}`;

  return (
    <main
      className="passport-page"
      data-passport-digest={passport.generatedDigest}
      data-passport-id={passport.id}
      data-passport-profile={passport.documentProfile}
      data-passport-publication-status={passport.publicationStatus}
      id="main-content"
    >
      <header className="passport-page__header">
        <nav aria-label="Breadcrumb">
          <Link href="/quality">Quality evidence</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{passport.displayName}</span>
        </nav>
        <p className="passport-page__document-type">Quality Passport skeleton</p>
        <h1>{passport.displayName}</h1>
        <p>
          This inspection sheet exposes what is missing from the current unreleased checkpoint. It
          is not a Quality Passport, certification, release record, or accessibility claim.
        </p>

        <section className="passport-page__gate" aria-labelledby="passport-overall-status">
          <span
            data-passport-overall={passport.overall.releaseGateResult}
            id="passport-overall-status"
          >
            {passport.overall.releaseGateResult}
          </span>
          <div>
            <strong>Release evidence: {passport.overall.evidenceState}</strong>
            <p>{passport.overall.explanation}</p>
          </div>
        </section>

        <dl className="passport-page__identity">
          <div>
            <dt>Stable ID</dt>
            <dd>
              <code>{passport.id}</code>
            </dd>
          </div>
          <div>
            <dt>Maturity</dt>
            <dd>
              {passport.item.publishedMaturity === null
                ? `None published · ${passport.item.targetMaturity} is target only`
                : passport.item.publishedMaturity}
            </dd>
          </div>
          <div>
            <dt>Trust tier</dt>
            <dd>{passport.item.trust}</dd>
          </div>
          <div>
            <dt>Risk class</dt>
            <dd>{passport.item.riskClass}</dd>
          </div>
          <div>
            <dt>Version / status</dt>
            <dd>Unreleased · no item or UI version</dd>
          </div>
          <div>
            <dt>Manual review</dt>
            <dd>No review or review date supplied</dd>
          </div>
          {passport.releaseIdentity.sourceCommit === null ? null : (
            <div>
              <dt>Source commit</dt>
              <dd>
                <code>{passport.releaseIdentity.sourceCommit}</code>
              </dd>
            </div>
          )}
          {passport.releaseIdentity.sourceDigest === null ? null : (
            <div>
              <dt>Source digest</dt>
              <dd>
                <code>{passport.releaseIdentity.sourceDigest}</code>
              </dd>
            </div>
          )}
        </dl>

        <div className="passport-page__actions" aria-label="Passport resources">
          <a
            className="site-button site-button--primary"
            data-passport-machine={passport.links.machineJson}
            download={`${passport.id}-quality-passport.json`}
            href={passport.links.machineJson}
          >
            Download current JSON
          </a>
          <span className="passport-page__unavailable" aria-disabled="true">
            Immutable JSON unavailable until a release passes its gates
          </span>
          {passport.links.contract === null ? null : (
            <a className="site-button site-button--secondary" href={passport.links.contract.url}>
              {passport.links.contract.status === "draft-unavailable"
                ? "View draft contract source"
                : "View source contract"}
            </a>
          )}
          <a className="site-button site-button--secondary" href={passport.links.source.url}>
            View canonical source
          </a>
        </div>
      </header>

      <div className="passport-page__body">
        <section aria-labelledby="passport-scope">
          <h2 id="passport-scope">Scope and interpretation</h2>
          <p>{passport.claimScope}</p>
          <p>
            The JSON route and this page use the same model and document digest. The digest verifies
            this current skeleton document; it does not substitute for the missing source or
            evidence digests.
          </p>
          <Link href={canonicalRoute}>Return to the canonical item documentation</Link>
        </section>

        <section aria-labelledby="passport-vocabulary">
          <h2 id="passport-vocabulary">Evidence vocabulary</h2>
          <p>
            These states are intentionally distinct. Only <strong>Not tested</strong> applies to
            this skeleton; the remaining labels define how a release-bound Passport will report
            evidence without collapsing unknown, conditional, failed, or stale results.
          </p>
          <dl className="passport-page__vocabulary">
            {passport.evidenceVocabulary.map(({ meaning, state }) => (
              <div key={state}>
                <dt data-passport-vocabulary-state={state}>{state}</dt>
                <dd>{meaning}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="passport-register">
          <h2 id="passport-register">Evidence register</h2>
          <p>
            Every required section is present. Empty evidence is shown as missing evidence, never as
            a blank cell or inferred pass.
          </p>
          <div className="passport-page__register">
            {passport.sections.map((section, index) => (
              <article
                data-passport-section={section.id}
                id={`passport-section-${section.id}`}
                key={section.id}
              >
                <header>
                  <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  <h3>{section.title}</h3>
                </header>
                <div
                  aria-label={`${section.title} inspection table`}
                  className="passport-page__table-wrap"
                  role="region"
                  tabIndex={0}
                >
                  <table>
                    <caption className="site-visually-hidden">
                      {section.title} evidence results
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Result</th>
                        <th scope="col">Current scope</th>
                        <th scope="col">Evidence reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.rows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <strong data-passport-state={row.state}>{row.state}</strong>
                            <span>{row.aggregateState}</span>
                          </td>
                          <td>
                            <p>{row.summary}</p>
                            <ul>
                              {row.details.map((detail) => (
                                <li key={detail}>{detail}</li>
                              ))}
                            </ul>
                          </td>
                          <td>
                            <p>{row.missingEvidenceExplanation}</p>
                            {row.contextReferences.length === 0 ? (
                              <span>No context reference is needed for this missing result.</span>
                            ) : (
                              <ul>
                                {row.contextReferences.map((reference) => (
                                  <li key={reference.url}>
                                    <a href={reference.url}>{reference.label}</a>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {section.id === "known-limitations" ? (
                  <div className="passport-page__limitations">
                    <h4>Unreviewed source declarations</h4>
                    {passport.limitations.declarations.length === 0 ? (
                      <p>
                        No source declaration is available. This is not evidence that the item has
                        no limitations.
                      </p>
                    ) : (
                      <ul>
                        {passport.limitations.declarations.map((limitation) => (
                          <li key={limitation.id}>
                            <strong>{limitation.state}:</strong> {limitation.summary}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="passport-blockers">
          <h2 id="passport-blockers">Missing inputs and blockers</h2>
          <div className="passport-page__blockers">
            <div>
              <h3>Required inputs not supplied</h3>
              <ul>
                {passport.missingInputs.map((input) => (
                  <li key={input}>
                    <code>{input}</code>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Implementation-matrix blockers</h3>
              {passport.blockers.length === 0 ? (
                <p>No matrix blocker is recorded; release inputs are still missing.</p>
              ) : (
                <ul>
                  {passport.blockers.map((blocker) => (
                    <li key={blocker.code}>
                      <strong>{humanize(blocker.code)}:</strong> {blocker.summary}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section aria-labelledby="passport-provenance">
          <h2 id="passport-provenance">Provenance and verification</h2>
          <dl className="passport-page__provenance">
            <div>
              <dt>Current machine document</dt>
              <dd>
                <a href={passport.links.machineJson}>{passport.links.machineJson}</a>
              </dd>
            </div>
            <div>
              <dt>Immutable release document</dt>
              <dd>Unavailable until release identity and gates are complete.</dd>
            </div>
            <div>
              <dt>Current document digest</dt>
              <dd>
                <code>{passport.generatedDigest}</code>
              </dd>
            </div>
            <div>
              <dt>Issue tracker</dt>
              <dd>
                <a href={passport.links.issues}>Open item-related issues</a>
              </dd>
            </div>
          </dl>
          <h3>Verify the current JSON document digest</h3>
          <p>{passport.verification.scope}</p>
          <pre className="passport-page__command">
            <code>{passport.verification.command}</code>
          </pre>
        </section>
      </div>
    </main>
  );
}
