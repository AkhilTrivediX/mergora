/**
 * The versioned schema directory is canonical. Compiling it as part of this
 * package keeps npm, CLI, registry, and documentation consumers on one source.
 */
export * from "../../../registry/schemas/index.ts";
