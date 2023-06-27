import { defineConfig } from "rollup";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import esbuild from "rollup-plugin-esbuild";

export default defineConfig((args) => {
  const watch = !!args.watch;
  return {
    input: "./src/index.ts",
    output: {
      compact: !watch,
      file: "./dist/nat-mapmp.mjs",
      banner: "#!/usr/bin/env node\n",
      sourcemap: true,
      format: "esm",
    },
    plugins: [
      typescript(),
      nodeResolve({ preferBuiltins: true }),
      commonjs(),
      json({ preferConst: true }),
      esbuild({
        minify: !watch,
        target: "es2020",
        sourceMap: true,
      }),
    ],
  };
});
