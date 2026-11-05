import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Sandboxed Electron preloads and Metro assets require CommonJS imports.
  {files:["desktop/*.cjs","mobile/**/*.tsx"],rules:{"@typescript-eslint/no-require-imports":"off"}},
  // Node/Expo config files and build scripts are CommonJS by design (.cjs, Expo config plugins).
  {files:["**/*.cjs","mobile/plugins/**/*.js"],rules:{"@typescript-eslint/no-require-imports":"off"}},
  // React Compiler diagnostics from eslint-plugin-react-hooks v7. The compiler is not enabled
  // here, and these flag long-standing working patterns (latest-value refs, effect-driven
  // state resets), so keep them visible as warnings rather than failing CI.
  {files:["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],rules:{"react-hooks/set-state-in-effect":"warn","react-hooks/refs":"warn","react-hooks/purity":"warn"}},
  {files:["mobile/**/*.tsx"],rules:{"jsx-a11y/alt-text":"off"}},
  {files:["tests/**/*.mjs"],rules:{"@typescript-eslint/no-this-alias":"off"}},
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
