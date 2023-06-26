import { createSocket, RemoteInfo, Socket } from "node:dgram";
import { config } from "./config.js";
import { VERSION, ResultCode, OpCode } from "./constants.js";
import { start, stop } from "./natmap.js";
import { getPublicIp } from "./public-ip.js";

export async function createServer(): Promise<Socket> {
  const socket = createSocket("udp4");
  socket.on("message", (msg, rinfo) =>
    new Handler(socket, startTime, msg, rinfo).handle()
  );
  socket.on("error", console.error.bind(console));
  await new Promise<void>((res) => {
    socket.bind(config.port, config.host, res);
  });
  const startTime = Date.now();
  const { address, port } = socket.address();
  console.log(`Server listening at ${address}:${port}`);
  return socket;
}

class Handler {
  static reqId = 1;
  constructor(
    readonly socket: Socket,
    readonly startTime: number,
    readonly message: Buffer,
    readonly remote: RemoteInfo
  ) {
    this.version = message[0];
    this.opCode = message[1] as OpCode;
    this.reqId = Handler.reqId++;
    this.logger = console.log.bind(
      console,
      `[${this.reqId} (${remote.address}:${remote.port})]`
    );
  }
  readonly reqId;
  readonly version;
  readonly opCode;
  readonly logger;

  async handle(): Promise<void> {
    if (this.version !== VERSION) {
      this.send(this.allocResponse(8, ResultCode.UNSUPPORTED_VERSION));
      this.logger(`Unsupported pmp version ${this.version}`);
      console.debug(this.message.toString("hex"));
      return;
    }
    switch (this.opCode) {
      case OpCode.PUBLIC_ADDRESS: {
        return await this.sendPublicIp();
      }
      case OpCode.NEW_UDP_PORT_MAPPING:
      case OpCode.NEW_TCP_PORT_MAPPING: {
        return await this.handlePortMapping();
      }
      default: {
        this.send(this.allocResponse(8, ResultCode.UNSUPPORTED_OPCODE));
        this.logger(`Unsupported pmp op code ${this.opCode}`);
        console.debug(this.message.toString("hex"));
        return;
      }
    }
  }

  private send(payload: Buffer): void {
    this.socket.send(payload, this.remote.port, this.remote.address);
  }

  private async sendPublicIp(): Promise<void> {
    try {
      this.logger(`Request public ip`);
      const ip = await getPublicIp();
      const buf = this.allocResponse(12);
      buf[8] = ip[0];
      buf[9] = ip[1];
      buf[10] = ip[2];
      buf[11] = ip[3];
      this.send(buf);
      this.logger(`Respond with ${ip.join(".")}`);
    } catch (ex) {
      this.send(this.allocResponse(12, ResultCode.NETWORK_FAILURE));
      this.logger(ex);
    }
  }

  private async handlePortMapping(): Promise<void> {
    try {
      const privatePort = this.message.readUInt16BE(4);
      const publicPort = this.message.readUInt16BE(6);
      const lifetime = this.message.readUint32BE(8);
      const udpMode = this.opCode === OpCode.NEW_UDP_PORT_MAPPING;
      if (lifetime) {
        this.logger(
          `Request new ${udpMode ? "udp" : "tcp"} port mapping: ${
            this.remote.address
          }:${privatePort} => ${publicPort}, lifetime ${lifetime}s`
        );
        const info = start(this.remote.address, privatePort, udpMode, lifetime);
        await info.ready;
        const buf = this.allocResponse(16);
        buf.writeUInt16BE(privatePort, 8);
        buf.writeUInt16BE(info.publicPort, 10);
        buf.writeUInt32BE(lifetime, 12);
        this.logger(
          `Added new mapping ${info.sourceAddr}:${info.sourcePort} => ${info.publicPort}`
        );
        this.send(buf);
      } else {
        this.logger(
          `Request remove ${udpMode ? "udp" : "tcp"} port mapping: ${
            this.remote.address
          }:${privatePort} => ${publicPort}`
        );
        const info = stop(this.remote.address, privatePort, udpMode);
        if (info) {
          this.logger(
            `Removed mapping ${info.sourceAddr}:${info.sourcePort} => ${info.publicPort}`
          );
        } else {
          this.logger(`Mapping not found`);
        }
        const buf = this.allocResponse(16);
        buf.writeUInt16BE(privatePort, 8);
        buf.writeUInt16BE(publicPort, 10);
        buf.writeUInt32BE(lifetime, 12);
        this.send(buf);
      }
    } catch (ex) {
      this.logger(ex);
      this.send(this.allocResponse(16, ResultCode.NETWORK_FAILURE));
    }
  }

  private allocResponse(
    payloadSize = 8,
    resultCode = ResultCode.SUCCESS,
    opCode = this.opCode
  ): Buffer {
    const buf = Buffer.alloc(payloadSize);
    buf[0] = 0;
    buf[1] = opCode + 128;
    buf.writeUInt16BE(resultCode, 2);
    buf.writeUInt32BE(Math.floor((Date.now() - this.startTime) / 1000), 4);
    return buf;
  }
}
