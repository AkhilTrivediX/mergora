import {
  docsMachineMarkdown,
  docsMachineSlugs,
  itemMachineIds,
  itemMachineMarkdown,
  kitMachineIds,
} from "../machine-documents";

export const dynamic = "force-static";

export function GET() {
  const lines = [
    "# Mergora full unreleased documentation corpus",
    "",
    "Status: unreleased. Generated code must be reviewed and tested in the consumer's context.",
    "",
    "This file contains the same contract-backed documents served by the per-page machine Markdown endpoints. Missing evidence remains labeled; no summary upgrades an unreleased maturity claim.",
    "",
    ...docsMachineSlugs.flatMap((slug) => {
      const markdown = docsMachineMarkdown(slug);
      return markdown === null ? [] : [markdown, ""];
    }),
    ...[...itemMachineIds, ...kitMachineIds].flatMap((id) => {
      const markdown = itemMachineMarkdown(id);
      return markdown === null ? [] : [markdown, ""];
    }),
  ];
  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
