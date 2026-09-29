#!/usr/bin/env bun
import { Command } from "commander";

/**
 * grounding CLI — v1 commands: validate, build, dev (spec/07).
 * Implementations land in M1 (validate) and M2 (build/dev).
 */
export function createCli(): Command {
  const program = new Command();
  program.name("grounding").description("Grounding platform source tooling").version("0.0.0");

  program
    .command("validate")
    .description("Validate grounding source files")
    .argument("[paths...]", "specific files to validate")
    .option("--changed", "validate git-changed files plus affected dependents")
    .option("--strict", "promote configured warnings to errors")
    .option("--format <format>", "output format: human|json", "human")
    .action(() => {
      console.error("validate is not implemented yet (M1)");
      process.exitCode = 1;
    });

  program
    .command("build")
    .description("Compile source and materialize to PostgreSQL")
    .option("--clean", "ignore cached state and rebuild")
    .option("--dry-run", "produce the materialization plan without applying")
    .action(() => {
      console.error("build is not implemented yet (M2)");
      process.exitCode = 1;
    });

  program
    .command("dev")
    .description("Watch source and rebuild incrementally")
    .action(() => {
      console.error("dev is not implemented yet (M2)");
      process.exitCode = 1;
    });

  return program;
}

if (import.meta.main) {
  await createCli().parseAsync(process.argv);
}
