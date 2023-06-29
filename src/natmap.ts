import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { publicIp } from "./ip.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { Protocol } from "./constants.js";

const l = logger.child({}, { msgPrefix: "[natmap] " });

interface MappingKey {
  readonly sourceAddr: string;
  readonly sourcePort: number;
  readonly protocol: Protocol;
}

export class Mapping extends EventEmitter implements MappingKey {
  private static readonly currentPort: Record<string, number | undefined> = {
    TCP: -1,
    UDP: -1,
  };
  private static getPort(protocol: Protocol) {
    let current = Mapping.currentPort[Protocol[protocol]];
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
    Mapping.currentPort[Protocol[protocol]] = current;
    return current;
  }

  private static readonly mappings = new Map<
    `${Protocol}/${string}/${number}`,
    Mapping
  >();

  private static keyOf(key: MappingKey) {
    return `${key.protocol}/${key.sourceAddr}/${key.sourcePort}` as const;
  }

  static find(key: MappingKey): Mapping | undefined {
    return Mapping.mappings.get(Mapping.keyOf(key));
  }

  static start(key: MappingKey, lifetime: number): Mapping {
    const mapping =
      Mapping.find(key) ??
      new Mapping(key.sourceAddr, key.sourcePort, key.protocol);
    mapping.setTimeout(lifetime);
    return mapping;
  }

  static stop(key: MappingKey, reason: string): Mapping | undefined {
    const mapping = Mapping.find(key);
    if (!mapping) return undefined;
    mapping.stop(reason);
    return mapping;
  }

  constructor(
    readonly sourceAddr: string,
    readonly sourcePort: number,
    readonly protocol: Protocol
  ) {
    super();
    this.bindPort = Mapping.getPort(protocol);
    Mapping.mappings.set(Mapping.keyOf(this), this);

    const commonArgs = `-s ${config.stunServer} -h ${config.holdServer} -b ${this.bindPort} -t ${sourceAddr} -p ${sourcePort}`;
    const protocolArgs =
      protocol === Protocol.UDP ? config.udpArgs : config.tcpArgs;
    const command = `${config.exec} ${commonArgs} ${protocolArgs}`;

    l.debug(`${this}> ${command}`);

    this.service = spawn(command, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.service.on("exit", (code, signal) => {
      l.debug(`${this}: Process exited with code ${code}, signal ${signal}`);
      this.emit("exit", code, signal);
    });
    this.service.stdout.on("data", (ch: Buffer) => {
      const str = String(ch);
      l.debug(`${this}< ${str}`);
      const [publicAddr, publicPortStr, ip4p, bindPort, protocol] =
        str.split(" ");
      if (protocol.trim().toUpperCase() !== Protocol[this.protocol]) {
        l.warn(
          `${this}: Protocol mismatch: got ${protocol} from ${config.exec}`
        );
        return;
      }
      const fields = publicAddr.split(".").map((s) => Number.parseInt(s));
      if (fields.length !== 4) {
        l.warn(
          `${this}: Invalid public ip: got ${publicAddr} from ${config.exec}`
        );
        return;
      }
      const publicPort = Number.parseInt(publicPortStr);
      if (Number.isNaN(publicPort)) {
        l.warn(
          `${this}: Invalid public port: got ${publicPortStr} from ${config.exec}`
        );
        return;
      }
      if (Number(bindPort) !== this.bindPort) {
        l.warn(
          `${this}: Bind port mismatch: got ${bindPort} from ${config.exec}`
        );
        return;
      }
      this.publicAddr = publicAddr;
      this.publicPort = publicPort;
      publicIp.ip = fields;
      l.info(`${this}: Mapping updated`);
      this.emit("change", publicAddr, publicPort);
    });
    this.service.stderr.on("data", (ch: Buffer) => {
      l.warn(`${this}! ${ch}`);
    });
    l.info(`${this}: Mapping created`);
  }
  readonly bindPort;
  private readonly service;
  publicAddr?: string;
  publicPort?: number;
  private timeout?: NodeJS.Timer;
  private timeoutTime?: number;
  /** lifetime in seconds */
  get lifetime(): number {
    if (!this.timeoutTime) return 0;
    return Math.floor((this.timeoutTime - Date.now()) / 1000);
  }

  setTimeout(lifetime: number) {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
      this.timeoutTime = undefined;
    }
    if (lifetime <= 0) return;

    this.timeout = setTimeout(() => {
      this.stop("timeout");
    }, lifetime * 1000);
    l.info(`${this}: Mapping lifetime updated to ${lifetime} seconds`);
    this.timeoutTime = Date.now() + lifetime * 1000;
    this.emit("timeout", lifetime);
  }

  stop(reason: string) {
    if (this.service.killed) return;
    this.service.kill("SIGINT");
    this.setTimeout(0);
    l.info(`${this}: Mapping removed: ${reason}`);
    this.emit("stop", reason);
    Mapping.mappings.delete(Mapping.keyOf(this));
    this.removeAllListeners();
  }

  override toString() {
    const p = Protocol[this.protocol];
    const source = `${this.sourceAddr}:${this.sourcePort}`;
    const bind = `${this.bindPort}`;
    const pub = `${this.publicAddr || "?"}:${this.publicPort || "?"}`;
    return `[${p} ${source} => ${bind} => ${pub}]`;
  }
}
