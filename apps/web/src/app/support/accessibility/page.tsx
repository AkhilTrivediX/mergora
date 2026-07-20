import { ProgramPage } from "../../program-page";
import { pageMetadata } from "../../site-origin";

export const metadata = pageMetadata({
  description: "Report a Mergora accessibility problem with reproducible interaction context.",
  pathname: "/support/accessibility",
  title: "Accessibility reporting",
});

export default function AccessibilitySupportPage() {
  return (
    <ProgramPage
      description="A useful report identifies the item, story or route, browser, operating system, assistive technology, input method, state, expected behavior, and observed result."
      eyebrow="Accessibility reporting"
      sections={[
        {
          heading: "Record the interaction",
          paragraphs: [
            "Include the exact keyboard, touch, speech, switch, or screen-reader sequence and whether forced colors, reduced motion, zoom, locale, or RTL was active.",
          ],
        },
        {
          heading: "Protect private content",
          paragraphs: [
            "Use domain-neutral sample content and remove names, credentials, private URLs, customer data, and machine paths from logs or recordings.",
          ],
        },
        {
          heading: "Triage language",
          paragraphs: [
            "Severity follows user impact and loss of access, not the presence or absence of an automated rule. A passing axe result never closes a reproducible access barrier by itself.",
          ],
        },
      ]}
      title="Describe the barrier, not just the rule."
    />
  );
}
