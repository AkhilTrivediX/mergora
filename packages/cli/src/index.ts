export const CLI_NODE_RANGE = ">=22.14.0" as const;

export {
  installP1Source,
  planP1SourceInstall,
  P1_SOURCE_ITEM_IDS,
  type P1SourceInstallPlan,
  type P1SourceInstallOptions,
  type P1SourceInstallResult,
  type P1SourceItemId,
} from "./p1-installer.js";

export {
  applyInit,
  CONFIG_SCHEMA,
  createMergoraConfig,
  MANIFEST_SCHEMA,
  mergoraConfigAliasPrefix,
  planInit,
  readMergoraConfig,
  validateMergoraConfig,
  type InitOptions,
  type InitPlan,
  type MergoraConfig,
  type PlannedEdit,
} from "./configuration.js";

export {
  doctorProject,
  projectInfo,
  projectStatus,
  resolveDocumentation,
  searchRegistry,
  viewRegistryItems,
  type DoctorCheck,
  type DoctorResult,
  type DocumentationResult,
  type ItemStatus,
  type ItemView,
  type ProjectInfo,
  type ProjectStatus,
  type SearchOptions,
  type SearchResult,
  type StatusItem,
  type ViewOptions,
} from "./discovery.js";

export {
  inspectProject,
  type Framework,
  type PackageManager,
  type ProjectInspection,
  type ProjectInspectionOptions,
} from "./project-inspector.js";

export {
  DOCUMENTATION_ORIGIN,
  itemDocsUrl,
  listSourceItemIds,
  loadAllSourceItems,
  loadCatalog,
  loadSourceItem,
  OFFICIAL_REGISTRY_ORIGIN,
  registryAliases,
  resolveItemAlias,
  resolveSourceDependencyClosure,
  type CatalogRecord,
  type RegistryDataOptions,
  type SourceFileRecord,
  type SourceItemRecord,
} from "./registry-data.js";

export {
  applySourceAdd,
  applySourceAdopt,
  applySourceRemove,
  planSourceAdd,
  planSourceAdopt,
  planSourceRemove,
  type SourceOperationOptions,
  type SourceOperationPlan,
  type SourceOperationResult,
  type SourceRemoveOptions,
} from "./source-operations.js";

export {
  executeTransaction,
  finalizeOperationPlan,
  listIncompleteTransactions,
  planRecovery,
  recoverTransaction,
  TransactionInterruption,
  type ExecuteTransactionOptions,
  type OperationPlan,
  type OperationPlanDependencyChange,
  type OperationPlanFile,
  type OperationPlanItem,
  type PackageManagerInvocation,
  type PackageManagerRunner,
  type RecoveryOptions,
  type RecoveryPlan,
  type RecoveryResult,
  type TransactionFaultInjector,
  type TransactionFaultPoint,
  type TransactionMutation,
  type TransactionRegistryPayload,
  type TransactionResult,
  type TransactionState,
} from "./transaction-engine.js";

export {
  compatibleDependencyRange,
  planPackageDependencies,
  readPackageDependencies,
  type DependencyRequirement,
  type PackageDependencyChange,
  type PackageDependencyPlan,
} from "./package-editor.js";

export {
  CLI_VERSION,
  CliError,
  canonicalJson,
  errorEnvelope,
  JSON_SCHEMA_VERSION,
  redactMessage,
  sha256,
  successEnvelope,
  type JsonEnvelope,
  type JsonError,
  type StableExitCode,
} from "./contracts.js";
