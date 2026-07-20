import { SiteLink as Link } from "../site-link";

import { ProgramPage } from "../program-page";
import { pageMetadata } from "../site-origin";

export const metadata = pageMetadata({
  description: "Diagnose Mergora safely and route accessibility, security, or product reports.",
  pathname: "/support",
  title: "Support",
});

export default function SupportPage() {
  return (
    <>
      <ProgramPage
        description="Collect version, command, stable error code, plan digest, and a minimized reproduction. Remove credentials, private registry tokens, and machine paths before sharing."
        eyebrow="Troubleshooting and reporting"
        sections={[
          {
            heading: "Diagnose without mutation",
            paragraphs: [
              "Use configuration discovery, search, view, status, diff, and plan output before retrying a write. Preserve the transaction journal and failure code when recovery is involved.",
            ],
          },
          {
            heading: "Minimize safely",
            paragraphs: [
              "Reproduce in a clean consumer with packed artifacts when possible. Never attach credentials, npm tokens, private registry archives, local absolute paths, or the private planning directory.",
            ],
          },
          {
            heading: "Choose the right report",
            paragraphs: [
              "Accessibility reports need assistive technology, browser, input method, component state, and expected outcome. Security reports use a private path and avoid public exploit detail.",
            ],
          },
        ]}
        title="Preserve the evidence before retrying."
      />
      <nav aria-label="Report an issue" className="program-page__record-link">
        <Link href="/support/accessibility">Accessibility reporting</Link>{" "}
        <Link href="/support/security">Security reporting</Link>
      </nav>
    </>
  );
}
