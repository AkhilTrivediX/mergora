import { SiteLink as Link } from "../site-link";

import { ProgramPage } from "../program-page";
import { pageMetadata } from "../site-origin";

export const metadata = pageMetadata({
  description: "Mergora release records, artifact identity, migrations, and known issues.",
  pathname: "/releases",
  title: "Releases",
});

export default function ReleasesPage() {
  return (
    <>
      <ProgramPage
        description="There is no public Mergora release yet. Package publication, immutable registry assets, deployment proof, and the full quality matrix remain gated."
        eyebrow="Release records"
        sections={[
          {
            heading: "No release yet",
            paragraphs: [
              "Repository version 0.0.0 is a development marker. It is not a package, registry, compatibility, or support promise.",
            ],
          },
          {
            heading: "What a record will contain",
            paragraphs: [
              "A release record binds package versions, registry manifests, source output, artifact digests, migrations, browser and assistive-technology evidence, known limitations, and deployment URLs to one commit.",
            ],
          },
          {
            heading: "Publication boundary",
            paragraphs: [
              "npm and public deployment happen only after local, CI, packed-consumer, lifecycle, accessibility, visual, compatibility, and security gates pass from the release commit.",
            ],
          },
        ]}
        title="Release evidence starts at zero."
      />
      <p className="program-page__record-link">
        <Link href="/releases/unreleased">Inspect the unreleased checkpoint boundary</Link>
      </p>
    </>
  );
}
