import { rmSync } from "node:fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      // Vitest 5.0.1 does not delete the temporary directory of its main instance (`/tmp/<nanoid>/ssr`, about 60 MB
      // per run): hundreds of runs filled up `/tmp` on 2026-10-02. It is deleted on close.
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
