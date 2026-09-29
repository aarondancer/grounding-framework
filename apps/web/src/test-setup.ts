import { GlobalRegistrator } from "@happy-dom/global-registrator";

/**
 * DOM globals for Testing Library component tests (docs/testing layer 1:
 * unit — no services). Import this file FIRST in every *.test.tsx so
 * document/window exist before RTL renders.
 */
GlobalRegistrator.register();
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
