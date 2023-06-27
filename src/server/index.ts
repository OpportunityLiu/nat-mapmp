import { createSocket, type RemoteInfo } from "node:dgram";
import { setTimeout } from "node:timers/promises";
import { config } from "../config.js";
import { publicIp } from "../ip.js";
import { logger } from "../logger.js";
import type { Handler } from "./handler-base.js";
import {
  allocPublicAddressResponse,
  NatPmpHandler,
} from "./nat-pmp-handler.js";
import { PcpHandler } from "./pcp-handler.js";

const l = logger.child({}, { msgPrefix: "[server] " });

export class Server {
  constructor() {}
  readonly socket = createSocket("udp4", this.onMessage.bind(this));

  startTime = 0;
  listen(): Promise<void> {
    if (this.startTime) {
      return Promise.resolve();
    }
    return new Promise<void>((res, rej) => {
      this.socket.on("error", rej);
      this.socket.bind(config.port, config.host, () => {
        res();
        this.socket.off("error", rej);
      });
    }).then(async () => {
      this.socket.on("error", console.error);
      await publicIp.ready;
      this.announceAddressChanges();
      publicIp.on("change", () => {
        this.announceAddressChanges();
      });
    });
  }

  // https://datatracker.ietf.org/doc/html/rfc6886#section-3.2.1
  protected async announceAddressChanges(): Promise<void> {
    this.startTime = Date.now();
    let delay = 250;
    for (let index = 0; index < 10; index++) {
      const buf = allocPublicAddressResponse(this.startTime, publicIp.ip);
      l.trace(
        `Announcing address changes [${String(index + 1).padStart(
          2
        )}/10]: ${publicIp.ip.join(".")}`
      );
      this.socket.send(buf, config.port - 1, "224.0.0.1");
      await setTimeout(delay);
      delay *= 2;
    }
  }

  protected onMessage(msg: Buffer, rinfo: RemoteInfo): void {
    const version = msg[0];
    let handler: typeof Handler;
    switch (version) {
      case PcpHandler.version:
        handler = PcpHandler;
        break;
      case NatPmpHandler.version:
      default:
        handler = NatPmpHandler;
        break;
    }
    new handler(this, msg, rinfo).handle().catch(console.error);
  }
}
