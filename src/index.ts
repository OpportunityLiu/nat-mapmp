import { createServer } from "./server.js";
import { program } from "commander";
import { config } from "./config.js";

program
  .option("-h, --hold <hold-url>", "set url of tcp holder", config.holdServer)
  .option("-s, --stun <stun-url>", "set url of stun server", config.stunServer)
  .option(
    "-p, --port <port>",
    "NAT-PMP serve port",
    config.listenPort.toString()
  )
  .option(
    "-b, --bind <port-range>",
    "Nat map port range, you must allow inbound connections to these ports",
    config.bindPort.join("-")
  )
  .option("--exec <path>", "path to natmap executable", config.natmapExec)
  .action(async () => {
    const opts = program.opts<{
      hold: string;
      stun: string;
      port: string;
      bind: string;
      exec: string;
    }>();
    config.listenPort = Number.parseInt(opts.port);
    config.bindPort = opts.bind.split("-").map((p) => Number.parseInt(p)) as [
      number,
      number
    ];
    config.stunServer = opts.stun;
    config.holdServer = opts.hold;
    config.natmapExec = opts.exec;
    await createServer();
  });

program.parseAsync();
