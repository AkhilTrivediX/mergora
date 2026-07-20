import assert from "node:assert/strict";
import test from "node:test";

import {
  catalogDefinitions,
  catalogItemDefinitions,
  EXPECTED_INVENTORY,
  kitDefinitions,
} from "./catalog.ts";
import type { CatalogDefinition } from "./types.ts";
import { normalizeCatalogId, validateCatalogDefinitions } from "./validate.ts";

test("the canonical seed passes validation", () => {
  assert.deepEqual(validateCatalogDefinitions(), []);
});

test("the inventory is 168 catalog items plus 10 kits", () => {
  assert.equal(catalogItemDefinitions.length, EXPECTED_INVENTORY.catalogItems);
  assert.equal(kitDefinitions.length, EXPECTED_INVENTORY.kits);
  assert.equal(catalogDefinitions.length, EXPECTED_INVENTORY.definitions);

  const layerCounts = Object.fromEntries(
    Object.keys(EXPECTED_INVENTORY.layers).map((layer) => [
      layer,
      catalogDefinitions.filter((definition) => definition.layer === layer).length,
    ]),
  );
  assert.deepEqual(layerCounts, EXPECTED_INVENTORY.layers);
});

test("foundation and collaboration presence remain distinct contracts", () => {
  const foundationPresence = catalogDefinitions.find((definition) => definition.id === "presence");
  const collaborationPresence = catalogDefinitions.find(
    (definition) => definition.id === "collaboration-presence",
  );

  assert.equal(foundationPresence?.category, "foundation-utilities");
  assert.match(foundationPresence?.normativeBehavior ?? "", /enter and exit lifecycle/i);
  assert.equal(collaborationPresence?.category, "ai-collaboration");
  assert.match(collaborationPresence?.normativeBehavior ?? "", /avatar.*presence status/i);
});

test("every seed record is honestly unimplemented with only target maturity", () => {
  for (const definition of catalogDefinitions) {
    assert.equal(definition.implementationStatus, "unimplemented");
    assert.ok(definition.requiredEvidenceFamilies.length > 0);
    assert.ok(definition.requiredStateGroups.length > 0);
    assert.equal("releaseCommit" in definition, false);
    assert.equal("sourceDigest" in definition, false);
    assert.equal("manualEvidence" in definition, false);
  }

  assert.equal(
    catalogDefinitions.find((definition) => definition.id === "kanban")?.targetMaturity,
    "beta",
  );
  assert.equal(
    catalogDefinitions.find((definition) => definition.id === "scheduler-kit")?.targetMaturity,
    "beta",
  );
  assert.equal(
    catalogDefinitions.find((definition) => definition.id === "rich-text-editor")?.targetMaturity,
    "experimental",
  );
  assert.equal(
    catalogDefinitions.find((definition) => definition.id === "rich-text-editor")?.trust,
    "labs",
  );
});

test("case-equivalent IDs are rejected", () => {
  const button = catalogDefinitions.find((definition) => definition.id === "button");
  assert.ok(button);

  const collision = { ...button, id: "BUTTON" } satisfies CatalogDefinition;
  const issues = validateCatalogDefinitions([...catalogDefinitions, collision], {
    enforceExpectedInventory: false,
  });

  assert.ok(issues.some((issue) => issue.code === "duplicate-normalized-id"));
});

test("Unicode compatibility-equivalent IDs are rejected", () => {
  const button = catalogDefinitions.find((definition) => definition.id === "button");
  assert.ok(button);

  const fullWidthButton = "ｂｕｔｔｏｎ";
  assert.equal(normalizeCatalogId(fullWidthButton), "button");

  const collision = { ...button, id: fullWidthButton } satisfies CatalogDefinition;
  const issues = validateCatalogDefinitions([...catalogDefinitions, collision], {
    enforceExpectedInventory: false,
  });

  assert.ok(issues.some((issue) => issue.code === "duplicate-normalized-id"));
  assert.ok(issues.some((issue) => issue.code === "invalid-id"));
});

test("the definitions serialize as machine-readable data", () => {
  const roundTrip = JSON.parse(JSON.stringify(catalogDefinitions)) as unknown[];
  assert.equal(roundTrip.length, EXPECTED_INVENTORY.definitions);
});
