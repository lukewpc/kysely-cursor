import { defineConfig } from 'tsup'

export default defineConfig({
  tsconfig: 'tsconfig.build.json',
  entry: ['src/index.ts'],
  format: ['esm'],
  // tsup's DTS rollup still injects baseUrl (deprecated in TS 6, removed in TS 7).
  // Keep the silence here so workspace tsconfig stays valid under native TS 7 / VS Code.
  dts: {
    compilerOptions: {
      ignoreDeprecations: '6.0',
    },
  },
  sourcemap: true,
  clean: true,
  treeshake: true,
  outDir: 'dist',
})
