import { start, stop } from "../natmap.js";
import { publicIp } from "../ip.js";
import { Handler } from "./handler-base.js";
import { Protocol } from "../constants.js";

const VERSION = 0;

enum OpCode {
  PUBLIC_ADDRESS = 0,
  NEW_UDP_PORT_MAPPING = 1,
  NEW_TCP_PORT_MAPPING = 2,
}

enum ResultCode {
  SUCCESS = 0,
  UNSUPPORTED_VERSION = 1,
  UNAUTHORIZED = 2,
  NETWORK_FAILURE = 3,
  OUT_OF_RESOURCES = 4,
  UNSUPPORTED_OPCODE = 5,
}

function allocResponse(
  startTime: number,
  opCode: OpCode,
  resultCode = ResultCode.SUCCESS,
  payloadSize = 8
): Buffer {
  const buf = Buffer.alloc(payloadSize);
  buf[0] = 0;
  buf[1] = opCode + 128;
  buf.writeUInt16BE(resultCode, 2);
  buf.writeUInt32BE(Math.floor((Date.now() - startTime) / 1000), 4);
  return buf;
}

export function allocPublicAddressResponse(
  startTime: number,
  ip: readonly number[]
): Buffer {
  const buf = allocResponse(
    startTime,
    OpCode.PUBLIC_ADDRESS,
    ResultCode.SUCCESS,
    12
  );
  buf[8] = ip[0];
  buf[9] = ip[1];
  buf[10] = ip[2];
  buf[11] = ip[3];
  return buf;
}

export class NatPmpHandler extends Handler {
  static readonly version = VERSION;
  async handle(): Promise<void> {
    if (this.version !== VERSION) {
      this.send(this.allocResponse(8, ResultCode.UNSUPPORTED_VERSION));
      this.logger.warn(
        {
          payload: this.message.toString("hex"),
        },
        `Unsupported pmp version ${this.version}`
      );
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
        this.logger.warn(
          {
            payload: this.message.toString("hex"),
          },
          `Unsupported pmp op code ${this.opCode}`
        );
        return;
      }
    }
  }

  private async sendPublicIp(): Promise<void> {
    try {
      this.logger.info(`Request public ip`);
      const ip = publicIp.ip;
      const buf = allocPublicAddressResponse(this.server.startTime, ip);
      this.send(buf);
      this.logger.info(`Respond with ${ip.join(".")}`);
    } catch (ex) {
      this.send(this.allocResponse(12, ResultCode.NETWORK_FAILURE));
      this.logger.warn(ex);
    }
  }

  private async handlePortMapping(): Promise<void> {
    try {
      const sourcePort = this.message.readUInt16BE(4);
      const externalPort = this.message.readUInt16BE(6);
      const lifetime = this.message.readUint32BE(8);
      const protocol =
        this.opCode === OpCode.NEW_UDP_PORT_MAPPING
          ? Protocol.UDP
          : Protocol.TCP;
      if (lifetime) {
        this.logger.info(
          `Request new ${Protocol[protocol]} port mapping: ${this.remote.address}:${sourcePort} => ${externalPort}, lifetime ${lifetime}s`
        );
        const info = start(
          this.remote.address,
          sourcePort,
          protocol,
          lifetime
        );
        await info.ready;
        const buf = this.allocResponse(16);
        buf.writeUInt16BE(sourcePort, 8);
        buf.writeUInt16BE(info.publicPort, 10);
        buf.writeUInt32BE(lifetime, 12);
        this.logger.info(
          `Added new mapping ${info.sourceAddr}:${info.sourcePort} => ${info.publicPort}`
        );
        this.send(buf);
      } else {
        this.logger.info(
          `Request remove ${Protocol[protocol]} port mapping: ${this.remote.address}:${sourcePort} => ${externalPort}`
        );
        const info = stop(this.remote.address, sourcePort, protocol);
        if (info) {
          this.logger.info(
            `Removed mapping ${info.sourceAddr}:${info.sourcePort} => ${info.publicPort}`
          );
        } else {
          this.logger.warn(`Mapping not found`);
        }
        const buf = this.allocResponse(16);
        buf.writeUInt16BE(sourcePort, 8);
        buf.writeUInt16BE(externalPort, 10);
        buf.writeUInt32BE(lifetime, 12);
        this.send(buf);
      }
    } catch (ex) {
      this.logger.warn(ex);
      this.send(this.allocResponse(16, ResultCode.NETWORK_FAILURE));
    }
  }

  private allocResponse(
    payloadSize = 8,
    resultCode = ResultCode.SUCCESS,
    opCode = this.opCode
  ): Buffer {
    return allocResponse(
      this.server.startTime,
      opCode,
      resultCode,
      payloadSize
    );
  }
}
