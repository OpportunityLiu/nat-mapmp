import { ChildProcess, spawn } from "node:child_process";
import { publicIp } from "./ip.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { Protocol } from "./constants.js";

const l = logger.child({}, { msgPrefix: "[natmap] " });

const holder: Mapping[] = [];

interface Mapping {
  sourceAddr: string;
  sourcePort: number;
  bindPort: number;
  publicAddr: string;
  publicPort: number;
  protocol: Protocol;
  lifetime: number;
  service: ChildProcess;
  ready: Promise<void>;
  timeout?: NodeJS.Timer;
}

function stringify({
  protocol,
  sourceAddr,
  sourcePort,
  publicAddr,
  publicPort,
  bindPort,
}: Mapping) {
  const p = Protocol[protocol];
  return `[${p}]${sourceAddr}:${sourcePort} => ${bindPort} => ${
    publicAddr || "?"
  }:${publicPort > 0 ? publicPort : "?"}`;
}

const currentPort: Record<string, number | undefined> = { TCP: -1, UDP: -1 };
function getPort(protocol: Protocol) {
  let current = currentPort[Protocol[protocol]];
  if (current === undefined) throw new Error(`Invalid protocol ${protocol}`);

  if (current < 0) {
    // start from random port
    current =
      config.bindPort[0] +
      Math.floor(Math.random() * (config.bindPort[1] - config.bindPort[0]));
  }

  if (current < config.bindPort[0] || current >= config.bindPort[1]) {
    // cycle
    current = config.bindPort[0];
  } else {
    // next
    current++;
  }
  currentPort[Protocol[protocol]] = current;
  return current;
}

function createTimeout(info: Mapping, lifetime: number) {
  clearTimeout(info.timeout);
  info.timeout = setTimeout(() => {
    if (stop(info.sourceAddr, info.sourcePort, info.protocol)) {
      l.info(`${stringify(info)}: Mapping removed due to timeout`);
    }
  }, lifetime * 1000);
}

export function start(
  sourceAddr: string,
  sourcePort: number,
  protocol: Protocol,
  lifetime: number
): Mapping {
  const exist = findIndex(sourceAddr, sourcePort, protocol);
  if (exist >= 0) {
    const info = holder[exist];
    createTimeout(info, lifetime);
    l.info(
      `${stringify(info)}: Mapping lifetime updated to ${lifetime} seconds`
    );
    return info;
  }

  const bindPort = getPort(protocol);
  const commonArgs = `-s ${config.stunServer} -h ${config.holdServer} -b ${bindPort} -t ${sourceAddr} -p ${sourcePort}`;
  const protocolArgs =
    protocol === Protocol.UDP ? config.udpArgs : config.tcpArgs;
  const command = `${config.exec} ${commonArgs} ${protocolArgs}`;

  l.debug(`> ${command}`);

  const service = spawn(command, {
    shell: true,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const info: Mapping = {
    service,
    sourceAddr,
    sourcePort,
    bindPort,
    lifetime,
    protocol,
    publicAddr: "",
    publicPort: -1,
    ready: new Promise<void>((resolve, reject) => {
      service.stdout.on("data", (ch: Buffer) => {
        const [publicAddr, publicPortStr, ip4p, bindPort, protocol] =
          String(ch).split(" ");
        if (protocol.trim().toUpperCase() !== Protocol[info.protocol]) {
          l.warn(
            `${stringify(info)}: Protocol mismatch: get ${protocol} from ${
              config.exec
            }`
          );
          return;
        }
        const fields = publicAddr.split(".").map((s) => Number.parseInt(s));
        if (fields.length !== 4) {
          l.warn(
            `${stringify(info)}: Invalid public ip: got ${publicAddr} from ${
              config.exec
            }`
          );
          return;
        }
        const publicPort = Number.parseInt(publicPortStr);
        if (Number.isNaN(publicPort)) {
          l.warn(
            `${stringify(
              info
            )}: Invalid public port: got ${publicPortStr} from ${config.exec}`
          );
          return;
        }
        if (Number(bindPort) !== info.bindPort) {
          l.warn(
            `${stringify(info)}: Bind port mismatch: got ${bindPort} from ${
              config.exec
            }`
          );
          return;
        }
        info.publicAddr = publicAddr;
        info.publicPort = publicPort;
        publicIp.ip = fields;
        l.info(`${stringify(info)}: Mapping updated`);
        resolve();
      });
      service.on("exit", (code, signal) => {
        l.debug(`Process exited with code ${code}, signal ${signal}`);
        reject(new Error(`Process exited`));
      });
    }),
  };
  holder.push(info);
  createTimeout(info, lifetime);
  l.info(`${stringify(info)}: Mapping created`);
  return info;
}

export function stop(
  sourceAddr: string,
  sourcePort: number,
  protocol: Protocol
): Mapping | undefined {
  const infoIndex = findIndex(sourceAddr, sourcePort, protocol);
  if (infoIndex < 0) return undefined;
  const info = holder[infoIndex];
  info.service.kill("SIGINT");
  clearTimeout(info.timeout);
  info.timeout = undefined;
  holder.splice(infoIndex, 1);
  l.info(
    `Mapping removed [${Protocol[protocol]}]${sourceAddr}:${sourcePort} => ${info.bindPort} => ${info.publicPort}`
  );
  return info;
}

function findIndex(
  sourceAddr: string,
  sourcePort: number,
  protocol: Protocol
): number {
  return holder.findIndex(
    (i) =>
      i &&
      i.sourceAddr === sourceAddr &&
      i.sourcePort === sourcePort &&
      i.protocol === protocol
  );
}
