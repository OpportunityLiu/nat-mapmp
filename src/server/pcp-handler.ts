import { Protocol } from "../constants.js";
import { Mapping } from "../natmap.js";
import { type Ip, isEqualIp } from "../ip.js";
import { Handler } from "./handler-base.js";

const VERSION = 2;

enum OpCode {
  ANNOUNCE = 0,
  MAP = 1,
  PEER = 2,
}

// https://datatracker.ietf.org/doc/html/rfc6887#section-7.4
enum ResultCode {
  SUCCESS = 0,
  UNSUPPORTED_VERSION = 1,
  UNAUTHORIZED = 2,
  MALFORMED_REQUEST = 3,
  UNSUPPORTED_OPCODE = 4,
  UNSUPPORTED_OPTION = 5,
  MALFORMED_OPTION = 6,
  NETWORK_FAILURE = 7,
  OUT_OF_RESOURCES = 8,
  UNSUPPORTED_PROTOCOL = 9,
  USER_EX_QUOTA = 10,
  CANNOT_PROVIDE_EXTERNAL = 11,
  ADDRESS_MISMATCH = 12,
  EXCESSIVE_REMOTE_PEERS = 13,
}

// ::ffff:0:0/96
function readIpv4MappedAddress(buf: Buffer): Ip | undefined {
  if (buf.length !== 16) return undefined;
  for (let i = 0; i < 10; i++) {
    if (buf[i] !== 0) return undefined;
  }
  if (buf[10] !== 0xff || buf[11] !== 0xff) return undefined;
  return [buf[12], buf[13], buf[14], buf[15]];
}

export class PcpHandler extends Handler {
  static readonly version = VERSION;
  async handle(): Promise<void> {
    if (this.version !== VERSION) {
      this.sendError(ResultCode.UNSUPPORTED_VERSION, true);
      this.logger.warn(
        {
          payload: this.message.toString("hex"),
        },
        `Unsupported pcp version ${this.version}`
      );
      return;
    }
    if (this.opCode !== OpCode.MAP) {
      this.sendError(ResultCode.UNSUPPORTED_OPCODE, true);
      this.logger.warn(
        {
          payload: this.message.toString("hex"),
        },
        `Unsupported pcp op code ${this.opCode}`
      );
      return;
    }
    if (this.message.length < 60) {
      this.sendError(ResultCode.MALFORMED_REQUEST, true);
      this.logger.warn(
        {
          payload: this.message.toString("hex"),
        },
        `Malformed pcp request`
      );
      return;
    }
    if (this.message.length > 60) {
      this.sendError(ResultCode.UNSUPPORTED_OPTION, true);
      this.logger.warn(
        {
          payload: this.message.toString("hex"),
        },
        `Pcp request with unsupported option (Currently no options are supported)`
      );
      return;
    }
    const lifetime = this.message.readUInt32BE(4);
    const sourceIp = readIpv4MappedAddress(this.message.subarray(8, 24));
    const nonce = this.message.subarray(24, 36);
    const protocol = this.message.readUInt8(36);
    const sourcePort = this.message.readUInt16BE(40);
    const externalPort = this.message.readUInt16BE(42);
    const externalIp = readIpv4MappedAddress(this.message.subarray(44, 60));

    if (protocol !== Protocol.TCP && protocol !== Protocol.UDP) {
      this.sendError(ResultCode.UNSUPPORTED_PROTOCOL, true);
      this.logger.warn({ protocol }, `Unsupported protocol`);
      return;
    }
    if (!sourcePort) {
      this.sendError(ResultCode.UNSUPPORTED_PROTOCOL, true);
      this.logger.warn({ sourcePort }, `Unsupported wildcard port`);
      return;
    }
    if (!sourceIp || !externalIp) {
      this.sendError(ResultCode.MALFORMED_REQUEST, true);
      this.logger.warn(
        {
          payload: this.message.toString("hex"),
        },
        `Malformed pcp request, source ip or external ip is not ipv4 mapped`
      );
      return;
    }
    if (
      !isEqualIp(
        sourceIp,
        this.remote.address.split(".").map(Number) as unknown as Ip
      )
    ) {
      this.sendError(ResultCode.ADDRESS_MISMATCH, true);
      this.logger.warn(
        {
          sourceIp,
          remote: this.remote,
        },
        `Address mismatch`
      );
      return;
    }

    try {
      const key = { sourceAddr: this.remote.address, sourcePort, protocol };
      const resp = Buffer.copyBytesFrom(this.message);
      // resp[0] // version
      resp[1] += 128;
      resp[2] = 0; // reserved
      resp[3] = ResultCode.SUCCESS;
      resp.fill(0, 12, 24); // reserved

      if (lifetime) {
        this.logger.info(
          `Request new ${Protocol[protocol]} port mapping: ${this.remote.address}:${sourcePort} => ${externalPort}, lifetime ${lifetime}s`
        );
        const info = Mapping.start(key, lifetime);
        info.on("change", () => {
          if (!info.publicPort || !info.publicAddr) return;
          resp.writeUint32BE(info.lifetime, 4);
          resp.writeUInt32BE(this.server.epochTime, 8);
          resp.writeUInt16BE(info.publicPort, 42);
          const publicIp = info.publicAddr
            .split(".")
            .map(Number) as unknown as Ip;
          resp[56] = publicIp[0];
          resp[57] = publicIp[1];
          resp[58] = publicIp[2];
          resp[59] = publicIp[3];
          this.send(resp);
          this.logger.info(
            `Response new ${Protocol[protocol]} port mapping: ${this.remote.address}:${sourcePort} => ${info.publicPort}`
          );
        });
      } else {
        this.logger.info(
          `Request remove ${Protocol[protocol]} port mapping: ${this.remote.address}:${sourcePort} => ${externalPort}`
        );
        const info = Mapping.stop(key, "pcp client request");
        if (!info) {
          this.logger.warn(`Mapping not found`);
        }
        resp.writeUint32BE(0, 4);
        resp.writeUInt32BE(this.server.epochTime, 8);
        resp.writeUInt16BE(0, 42);
        resp[56] = 0;
        resp[57] = 0;
        resp[58] = 0;
        resp[59] = 0;
        this.send(resp);
      }
    } catch (ex) {
      this.logger.warn(ex);
      this.sendError(ResultCode.NETWORK_FAILURE, false);
    }
  }

  private sendError(resultCode: ResultCode, longLifetime: boolean): void {
    // Copying the entire UDP payload, or 1100 octets, whichever is less,
    //  and zero-padding the response to a multiple of 4 octets if
    //  necessary
    let respLen = Math.min(this.message.length, 1100);
    if (respLen % 4 !== 0) {
      respLen += 4 - (respLen % 4);
    }

    const resp = Buffer.alloc(respLen);
    this.message.copy(resp, 0, 0, respLen);

    resp[1] = this.opCode + 128;
    resp[3] = resultCode;
    resp.writeUInt32BE(longLifetime ? 1800 : 30, 4);
    resp.writeUInt32BE(this.server.epochTime, 8);
    resp.fill(0, 12, 24); // reserved

    this.send(resp);
  }
}
