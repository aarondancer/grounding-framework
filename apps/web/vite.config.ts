import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Native bindings + drivers stay external to the server bundle.
const serverExternals = ["@valkey/valkey-glide", "pg"];

export default defineConfig({
  environments: {
    ssr: {
      resolve: { external: serverExternals },
    },
  },
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart(),
    nitro({
      preset: "bun",
      // Native/driver deps stay external; nitro traces them into .output.
      traceDeps: serverExternals,
    }),
    viteReact(),
  ],
});
