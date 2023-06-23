import { ChildProcess, spawn } from "node:child_process";
import { updatePublicIp } from "./public-ip.js";
import { config } from "./config.js";

const holder: Mapping[] = [];

interface Mapping {
  sourceAddr: string;
  sourcePort: number;
  publicAddr: string;
  publicPort: number;
  udpMode: boolean;
  lifetime: number;
  service: ChildProcess;
  ready: Promise<void>;
  timeout?: NodeJS.Timer;
}

const currentPort = { tcp: -1, udp: -1 };
function getPort(udpMode: boolean) {
  let current = currentPort[udpMode ? "udp" : "tcp"];
  if (current < config.bindPort[0] || current >= config.bindPort[1])
    current = config.bindPort[0];
  else current++;
  currentPort[udpMode ? "udp" : "tcp"] = current;
  return current;
}

function createTimeout(info: Mapping, lifetime: number) {
  clearTimeout(info.timeout);
  info.timeout = setTimeout(() => {
    if (stop(info.sourceAddr, info.sourcePort, info.udpMode)) {
      console.log(
        `Removed mapping ${info.sourceAddr}:${info.sourcePort} => ${info.publicPort} due to timeout`
      );
    }
  }, lifetime * 1000);
}

export function start(
  sourceAddr: string,
  sourcePort: number,
  udpMode: boolean,
  lifetime: number
): Mapping {
  const exist = findIndex(sourceAddr, sourcePort, udpMode);
  if (exist >= 0) {
    const info = holder[exist];
    createTimeout(info, lifetime);
    return info;
  }

  const port = getPort(udpMode);
  const command = `${config.natmapExec} -s ${config.stunServer} -h ${
    config.holdServer
  } -b ${port} -t ${sourceAddr} -p ${sourcePort} ${udpMode ? "-u" : ""} -k 5`;
  console.debug(`Starting ${command}`);
  const service = spawn(command, {
    shell: true,
    stdio: ["ignore", "pipe", "inherit"],
  });
  const info: Mapping = {
    service,
    sourceAddr,
    sourcePort,
    lifetime,
    udpMode,
    publicAddr: "",
    publicPort: -1,
    ready: new Promise<void>((resolve, reject) => {
      service.stdout.on("data", (ch: Buffer) => {
        const [publicAddr, publicPortStr, ip4p, bindPort, protocol] =
          String(ch).split(" ");
        if (protocol.trim() !== (udpMode ? "udp" : "tcp")) return;
        const fields = publicAddr.split(".").map((s) => Number.parseInt(s));
        if (fields.length !== 4) return;
        const publicPort = Number.parseInt(publicPortStr);
        if (Number.isNaN(publicPort)) return;
        info.publicAddr = publicAddr;
        info.publicPort = publicPort;
        updatePublicIp(fields);
        resolve();
      });
      service.on("exit", () => reject(new Error(`Process exited`)));
    }),
  };
  holder.push(info);
  createTimeout(info, lifetime);
  return info;
}

export function stop(
  sourceAddr: string,
  sourcePort: number,
  udpMode: boolean
): Mapping | undefined {
  const infoIndex = findIndex(sourceAddr, sourcePort, udpMode);
  if (infoIndex < 0) return undefined;
  const info = holder[infoIndex];
  info.service.kill();
  clearTimeout(info.timeout);
  info.timeout = undefined;
  holder.splice(infoIndex, 1);
  return info;
}

function findIndex(
  sourceAddr: string,
  sourcePort: number,
  udpMode: boolean
): number {
  return holder.findIndex(
    (i) =>
      i &&
      i.sourceAddr === sourceAddr &&
      i.sourcePort === sourcePort &&
      i.udpMode === udpMode
  );
}
