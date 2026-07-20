import { notFound } from "next/navigation";

import { ProgramPage } from "../../program-page";
import { pageMetadata } from "../../site-origin";

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ version: "unreleased" }];
}

export const metadata = pageMetadata({
  description: "The current unreleased Mergora checkpoint and its open publication gates.",
  pathname: "/releases/unreleased",
  title: "Unreleased checkpoint [prerelease]",
});

export default async function ReleaseRecordPage({
  params,
}: {
  readonly params: Promise<{ readonly version: string }>;
}) {
  const { version } = await params;
  if (version !== "unreleased") notFound();
  return (
    <ProgramPage
      description="This mutable development checkpoint is provided for transparency only. It has no immutable package, registry, signature, production URL, or support term."
      eyebrow="Mutable checkpoint"
      sections={[
        {
          heading: "Identity",
          paragraphs: [
            "Version marker 0.0.0 and the current feature branch identify development work, not a distributable release. Consumers must use locally packed artifacts for evaluation.",
          ],
        },
        {
          heading: "Evidence",
          paragraphs: [
            "Focused family and CLI checks exist, while full generated parity, cross-browser, manual assistive-technology, packed consumer, lifecycle, deployment, and CI evidence is still being assembled.",
          ],
        },
        {
          heading: "Known limitations",
          paragraphs: [
            "Catalog work, online/mirror registry paths, migrations, site signature tools, manual evidence, and publication credentials remain incomplete. No Stable component claim is made.",
          ],
        },
      ]}
      title="Unreleased means changeable."
    />
  );
}
