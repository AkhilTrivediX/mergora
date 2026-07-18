export class RuntimeCapabilityError extends Error {
  readonly capability: string;

  constructor(capability: string, detail?: string) {
    super(
      detail === undefined
        ? `Runtime capability "${capability}" is unavailable.`
        : `Runtime capability "${capability}" is unavailable: ${detail}`,
    );
    this.name = "RuntimeCapabilityError";
    this.capability = capability;
  }
}

export class HarnessConfigurationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HarnessConfigurationError";
    this.code = code;
  }
}

export function requireRuntimeAdapter<T>(adapter: T | undefined, capability: string): T {
  if (adapter === undefined) {
    throw new RuntimeCapabilityError(capability);
  }

  return adapter;
}
