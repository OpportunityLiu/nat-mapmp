import type { RemoteInfo } from "node:dgram";
import type { Server } from "./index.js";
import { logger } from "../logger.js";

export class Handler {
  static reqId = 1;
  constructor(
    readonly server: Server,
    readonly message: Buffer,
    readonly remote: RemoteInfo
  ) {
    this.version = message[0];
    this.opCode = message[1];
    this.reqId = Handler.reqId++;
    this.logger = logger.child(
      {},
      {
        msgPrefix: `[req-${this.reqId.toString(36).padStart(3, "0")} ${
          remote.address
        }:${remote.port} V${this.version}] `,
      }
    );
  }
  readonly reqId;
  readonly version;
  readonly opCode;
  readonly logger;

  handle(): Promise<void> {
    throw new Error("Not implemented");
  }
  protected send(payload: Buffer): void {
    this.server.socket.send(payload, this.remote.port, this.remote.address);
  }
}
