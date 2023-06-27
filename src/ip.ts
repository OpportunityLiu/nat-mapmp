import { EventEmitter } from "node:events";
import { createSocket } from "node:dgram";
import { randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import assert from "node:assert";
import { config } from "./config.js";
import { logger } from "./logger.js";

const l = logger.child({}, { msgPrefix: "[public-ip] " });

const STUN_MAGIC_COOKIE = 0x2112a442;

async function getPublicIp(timeout = 500): Promise<Ip> {
  // lookup first to avoid timeout caused by dns resolving
  const stunServer = await lookup(config.stunServer, { family: 4 });
  const socket = createSocket("udp4");

  const transactionId = randomBytes(12);
  const req = Buffer.alloc(20);
  req.writeUInt16BE(0x0001, 0); // binding request
  req.writeUInt16BE(0x0000, 2); // message length
  req.writeUInt32BE(STUN_MAGIC_COOKIE, 4); // magic cookie
  transactionId.copy(req, 8); // transaction id
  socket.send(req, 3478, stunServer.address);

  try {
    return await new Promise<Ip>((resolve, reject) => {
      socket.on("message", (msg) => {
        if (msg.length < 20) return;
        if (msg.readUInt16BE(0) !== 0x0101) return;
        if (msg.readUInt16BE(2) !== msg.length - 20) return;
        if (msg.readUInt32BE(4) !== STUN_MAGIC_COOKIE) return;
        if (!msg.subarray(8, 20).equals(transactionId)) return;

        let body = msg.subarray(20);
        const messages = [];
        while (body.length >= 4) {
          const type = body.readUInt16BE(0);
          const length = body.readUInt16BE(2);
          const value = body.subarray(4, 4 + length);
          messages.push({ type, length, value });
          body = body.subarray(4 + length);
        }

        const getXorAddress = messages.find(
          // XOR-MAPPED-ADDRESS Family=0x01 (IPv4)
          (m) => m.type === 0x0020 && m.value.readUInt8(1) === 0x01
        );
        if (getXorAddress) {
          const ip = getXorAddress.value.readUInt32BE(4) ^ 0x2112a442;
          const fields = [
            (ip >> 24) & 0xff,
            (ip >> 16) & 0xff,
            (ip >> 8) & 0xff,
            ip & 0xff,
          ] as const;
          l.trace("Get address from XOR-MAPPED-ADDRESS");
          return resolve(fields);
        }

        const getAddress = messages.find(
          // MAPPED-ADDRESS Family=0x01 (IPv4)
          (m) => m.type === 0x0001 && m.value.readUInt8(1) === 0x01
        );
        if (getAddress) {
          const ip = getAddress.value.readUInt32BE(4);
          const fields = [
            (ip >> 24) & 0xff,
            (ip >> 16) & 0xff,
            (ip >> 8) & 0xff,
            ip & 0xff,
          ] as const;
          l.trace("Get address from MAPPED-ADDRESS");
          return resolve(fields);
        }

        reject(new Error("No address found"));
      });
      socket.on("error", reject);
      setTimeout(() => reject(new Error("Timeout")), timeout);
    }).finally(() => socket.close());
  } catch (ex) {
    if (timeout > 5000) {
      throw ex;
    }
    l.debug(ex, `Failed to get public ip, retrying...`);
    return getPublicIp(timeout * 2);
  }
}

export type Ip = readonly [number, number, number, number];

export function isEqualIp(a: Ip, b: Ip) {
  assertIp(a);
  assertIp(b);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function assertIp(fields: readonly number[]): asserts fields is Ip {
  assert(fields.length === 4, "Bad ip");
  assert(
    fields.every((v) => v >= 0 && v <= 255),
    "Bad ip"
  );
}

export class PublicIp extends EventEmitter {
  private _ip?: Ip;
  get ip(): Ip {
    if (!this._ip) {
      throw new Error(`Public ip not ready`);
    }
    return this._ip;
  }
  set ip(fields: readonly number[]) {
    assertIp(fields);
    const newIp = [...fields] as Ip;
    if (this._ip && isEqualIp(this._ip, newIp)) {
      return;
    }
    const oldIp = this._ip;
    this._ip = newIp;
    this.emit("change", newIp, oldIp);
  }
  readonly ready = getPublicIp().then((ip) => {
    l.info(`Got public ip from stun server: ${ip.join(".")}`);
    this.ip = ip;
  });
  constructor() {
    super();
    this.ready.catch((e) =>
      l.error(e, "Failed to get public ip from stun server")
    );
  }
}

export const publicIp = new PublicIp();
