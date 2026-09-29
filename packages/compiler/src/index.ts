export type { BuildOptions, BuildResult } from "./build.ts";
export { build } from "./build.ts";
export type { ChildRows, CompiledEntity, CompileResult, DepKind } from "./ir.ts";
export { compileTree } from "./ir.ts";
export type { Manifest, ManifestEntity } from "./manifest.ts";
export {
  COMPILER_VERSION,
  manifestPath,
  readManifest,
  SCHEMA_VERSION,
  saveManifest,
  writeManifest,
} from "./manifest.ts";
export type { BuildProvenance } from "./materialize.ts";
export { applyPlan, checkEmbeddingDimension } from "./materialize.ts";
export type { MaterializationPlan } from "./plan.ts";
export { planMaterialization } from "./plan.ts";
