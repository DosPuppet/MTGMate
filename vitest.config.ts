import { rmSync } from "node:fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      // Vitest 5.0.1 ne supprime pas le dossier temporaire de son instance principale (`/tmp/<nanoid>/ssr`, environ
      // 60 Mo par exécution) : des centaines d'exécutions ont saturé `/tmp` le 02/10/2026. On le supprime à la fermeture.
      name: "mtgx-clear-vitest-tmp",
      configureVitest({ vitest }) {
        const dir = (vitest as unknown as { _tmpDir?: string })._tmpDir;
        if (!dir) return;
        const clear = () => rmSync(dir, { recursive: true, force: true });
        vitest.onClose(clear);
        process.once("exit", clear);
      },
    },
  ],
  test: {
    include: ["packages/*/test/**/*.test.ts"],
  },
});
