import type { DiagnosticCode } from "./codes.ts";

/**
 * Structured errors carrying stable diagnostic codes (spec/14).
 */

export type DiagnosticLocation = {
  /** Repo-relative source path when the diagnostic is about an authored file. */
  path?: string;
  line?: number;
  column?: number;
  /** JSON Pointer into the parsed document. */
  pointer?: string;
};

export class GroundingError extends Error {
  readonly code: DiagnosticCode;
  readonly details?: Record<string, unknown>;
  readonly location?: DiagnosticLocation;

  constructor(
    code: DiagnosticCode,
    message: string,
    options?: { details?: Record<string, unknown>; location?: DiagnosticLocation; cause?: unknown },
  ) {
    super(message);
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
    this.name = "GroundingError";
    this.code = code;
    if (options?.details !== undefined) this.details = options.details;
    if (options?.location !== undefined) this.location = options.location;
  }
}

/** One machine-readable diagnostic emitted by the validator/compiler or runtime. */
export type Diagnostic = {
  severity: "error" | "warning";
  code: DiagnosticCode;
  message: string;
  location?: DiagnosticLocation;
  /** Deterministic suggestion text; never auto-applied. */
  suggestion?: string;
  details?: Record<string, unknown>;
};
