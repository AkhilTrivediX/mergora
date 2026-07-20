export const dynamic = "force-static";

const nonEmptyString = { type: "string", minLength: 1 } as const;
const nullableNavigationItem = {
  type: ["object", "null"],
  required: ["id", "title", "url"],
  properties: {
    id: nonEmptyString,
    title: nonEmptyString,
    url: { type: "string", format: "uri" },
  },
  additionalProperties: false,
} as const;

export function GET() {
  return Response.json({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://akhiltrivedix.github.io/mergora/m/v1/schemas/docs-page.schema.json",
    title: "Mergora machine documentation page",
    type: "object",
    additionalProperties: false,
    required: [
      "schemaVersion",
      "kind",
      "id",
      "title",
      "summary",
      "canonicalUrl",
      "immutableVersionUrl",
      "contentVersion",
      "sourceCommit",
      "publicationStatus",
      "sections",
      "navigation",
      "related",
      "reviewNotice",
      "generatedDigest",
    ],
    properties: {
      schemaVersion: { const: 1 },
      kind: { const: "docs-page" },
      id: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
      title: nonEmptyString,
      summary: nonEmptyString,
      canonicalUrl: { type: "string", format: "uri" },
      immutableVersionUrl: { type: ["string", "null"] },
      contentVersion: nonEmptyString,
      sourceCommit: nonEmptyString,
      publicationStatus: { const: "blocked-unreleased" },
      sections: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "heading", "paragraphs", "command"],
          properties: {
            id: nonEmptyString,
            heading: nonEmptyString,
            paragraphs: { type: "array", minItems: 1, items: nonEmptyString },
            command: { type: ["string", "null"] },
          },
        },
      },
      navigation: {
        type: "object",
        additionalProperties: false,
        required: ["global", "documentation", "previous", "next", "footer"],
        properties: {
          global: { type: "array", minItems: 1, items: { type: "object" } },
          documentation: { type: "string", format: "uri" },
          previous: nullableNavigationItem,
          next: nullableNavigationItem,
          footer: { type: "array", minItems: 1, items: { type: "object" } },
        },
      },
      related: {
        type: "object",
        additionalProperties: false,
        required: ["documentationIndex", "quality", "machineJson", "machineMarkdown"],
        properties: {
          documentationIndex: { type: "string", format: "uri" },
          quality: { type: "string", format: "uri" },
          machineJson: { type: "string", format: "uri" },
          machineMarkdown: { type: "string", format: "uri" },
        },
      },
      reviewNotice: nonEmptyString,
      generatedDigest: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
    },
  });
}
