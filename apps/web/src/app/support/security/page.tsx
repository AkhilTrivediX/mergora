import { ProgramPage } from "../../program-page";
import { pageMetadata } from "../../site-origin";

export const metadata = pageMetadata({
  description:
    "Report a Mergora security issue without exposing users, credentials, or exploit details.",
  pathname: "/support/security",
  title: "Security reporting",
});

export default function SecuritySupportPage() {
  return (
    <ProgramPage
      description="Do not open a public issue containing active exploit steps, credentials, private registry material, or user data. Preserve hashes and stable error codes without sharing secrets."
      eyebrow="Private security reporting"
      sections={[
        {
          heading: "Scope the affected boundary",
          paragraphs: [
            "Identify CLI version, command, registry trust, distribution mode, artifact identity, and whether the issue affects read, plan, transaction, recovery, generation, or publication behavior.",
          ],
        },
        {
          heading: "Keep evidence recoverable",
          paragraphs: [
            "Retain the original transaction journal and artifact digests. Work from a copy and avoid rerunning a mutation that could destroy the precondition evidence.",
          ],
        },
        {
          heading: "Current contact boundary",
          paragraphs: [
            "A dedicated production security mailbox is not published yet. Until release readiness establishes it, use the repository owner’s private GitHub security-advisory channel rather than a public issue.",
          ],
        },
      ]}
      title="Report privately. Preserve the original state."
    />
  );
}
