import { defineConfig } from "rollup";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import commonjs from "@rollup/plugin-commonjs";

export default defineConfig({
  input: "./src/index.ts",
  output: {
    file: "./dist/nat-mapmp.mjs",
    banner: "#!/usr/bin/env node\n",
    sourcemap: true,
    format: "esm",
  },
  plugins: [typescript(), nodeResolve({ preferBuiltins: false }), commonjs()],
});
