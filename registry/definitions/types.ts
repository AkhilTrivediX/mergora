export type CatalogLayer = "foundation" | "component" | "system" | "kit";

export type RouteKind = "component" | "system" | "kit";

export type CatalogTrust = "core" | "labs" | "community";

export type TargetMaturity = "experimental" | "beta" | "stable" | "deprecated";

export type ImplementationStatus = "unimplemented";

export type AvailabilityIntent = "planned" | "not-planned";

export type RiskClass = 1 | 2 | 3;

export type CatalogDefinitionKind = "catalog-item" | "kit";

export type CatalogCategory =
  | "foundation-utilities"
  | "layout-structure"
  | "typography-content"
  | "actions-selection"
  | "fields-forms"
  | "collections"
  | "date-time"
  | "files-uploads"
  | "overlays"
  | "navigation-disclosure"
  | "feedback-status"
  | "data-display"
  | "advanced-data"
  | "media-editing"
  | "ai-collaboration"
  | "authentication"
  | "onboarding"
  | "settings"
  | "crud-data"
  | "file-management"
  | "command-search"
  | "ai-chat"
  | "admin-dashboard"
  | "billing"
  | "scheduler";

export type EvidenceFamily =
  | "schema-and-types"
  | "unit-state"
  | "role-name-query"
  | "keyboard-interaction"
  | "browser-aria"
  | "axe"
  | "visual-modes"
  | "responsive-reflow"
  | "locale-direction"
  | "packed-consumer"
  | "manual-desktop-at"
  | "manual-mobile-at"
  | "speech"
  | "switch"
  | "performance-scale"
  | "drag-alternatives"
  | "semantic-sync"
  | "package-source-parity"
  | "quality-passport"
  | "workflow-e2e";

export type StateGroup =
  | "base"
  | "interaction"
  | "selection"
  | "form-validation"
  | "async"
  | "empty-error"
  | "offline-recovery"
  | "destructive"
  | "overlay-focus"
  | "responsive-reflow"
  | "locale-direction"
  | "user-preferences"
  | "long-content"
  | "large-data-virtualization"
  | "drag-reorder"
  | "temporal-boundaries"
  | "media"
  | "streaming"
  | "permissions"
  | "workflow";

export interface CatalogDefinition {
  readonly kind: CatalogDefinitionKind;
  readonly id: string;
  readonly displayName: string;
  readonly layer: CatalogLayer;
  readonly category: CatalogCategory;
  readonly routeKind: RouteKind;
  readonly riskClass: RiskClass;
  readonly trust: CatalogTrust;
  readonly implementationStatus: ImplementationStatus;
  readonly targetMaturity: TargetMaturity;
  readonly availabilityIntent: {
    readonly package: AvailabilityIntent;
    readonly source: AvailabilityIntent;
  };
  readonly normativeBehavior: string;
  readonly requiredEvidenceFamilies: readonly EvidenceFamily[];
  readonly requiredStateGroups: readonly StateGroup[];
}
