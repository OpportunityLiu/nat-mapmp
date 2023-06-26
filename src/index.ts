import assert from "node:assert";
import { InvalidArgumentError, program } from "commander";
import { createServer } from "./server.js";
import { config } from "./config.js";
import { version } from "../package.json" assert { type: "json" };

program.version(version);

program
  .option(
    "-h, --hold-server <hold-url>",
    "set url of tcp holder",
    config.holdServer
  )
  .option(
    "-s, --stun-server <stun-url>",
    "set url of stun server",
    config.stunServer
  )
  .option(
    "    --host <address>",
    "NAT-PMP serve host address",
    (v) => {
      assert(
        /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v),
        new InvalidArgumentError("Invalid address")
      );
      return v;
    },
    config.host
  )
  .option(
    "-p, --port <port>",
    "NAT-PMP serve port",
    (v) => {
      const p = Number.parseInt(v);
      assert(p > 0 && p < 65536, new InvalidArgumentError("Invalid port"));
      return p;
    },
    config.port
  )
  .option(
    "-b, --bind <port-range>",
    "ports used for natmap binding, you must allow inbound connections to these ports",
    (v) => {
      const r = v.split("-").map((p) => Number.parseInt(p)) as [number, number];
      assert(r.length === 2, new InvalidArgumentError("Invalid port range"));
      const [s, e] = r;
      assert(
        s > 0 && s < 65536,
        new InvalidArgumentError("Invalid port range start")
      );
      assert(
        e > 0 && e < 65536,
        new InvalidArgumentError("Invalid port range end")
      );
      assert(s < e, new InvalidArgumentError("Invalid port range"));
      return [s, e] as const;
    },
    config.bindPort
  )
  .option("--exec <path>", "path to natmap executable", config.exec)
  .option(
    "--tcp-args <args>",
    "additional args forwarded to natmap when establishing TCP port mappings",
    config.tcpArgs
  )
  .option(
    "--udp-args <args>",
    "additional args forwarded to natmap when establishing UDP port mappings",
    config.udpArgs
  )
  .action(async () => {
    const opts = program.opts<typeof config>();
    Object.assign(config, opts);
    await createServer();
  });

program.parseAsync();
