import { createSocket } from "node:dgram";
import fetch from "node-fetch";

const VERSION = 0;
const SERVE_PORT = 5351;

const OP_CODE = {
  PUBLIC_ADDRESS: 0,
  NEW_UDP_PORT_MAPPING: 1,
  NEW_TCP_PORT_MAPPING: 2,
};

const RESULT_CODE = {
  SUCCESS: 0,
  UNSUPPORTED_VERSION: 1,
  UNAUTHORIZED: 2,
  NETWORK_FAILURE: 3,
  OUT_OF_RESOURCES: 4,
  UNSUPPORTED_OPCODE: 5,
};

const STARTED_AT = Date.now();

const socket = createSocket("udp4", async (message, remote) => {
  const version = message[0];
  const opCode = message[1];
  const logger = console.log.bind(
    console,
    `[${remote.address}:${remote.port}]`
  );
  if (version !== VERSION) {
    logger(`Unsupported pmp version ${version}`);
    send(remote, allocResponse(opCode, RESULT_CODE.UNSUPPORTED_VERSION));
    return;
  }
  switch (opCode) {
    case OP_CODE.PUBLIC_ADDRESS: {
      try {
        logger(`Request public ip`);
        const buf = allocResponse(opCode, RESULT_CODE.SUCCESS, 12);
        const ip = await getPublicIp();
        buf[8] = ip[0];
        buf[9] = ip[1];
        buf[10] = ip[2];
        buf[11] = ip[3];
        send(remote, buf);
      } catch (ex) {
        logger(ex);
        send(remote, allocResponse(opCode, RESULT_CODE.NETWORK_FAILURE, 12));
      }
      return;
    }
    case OP_CODE.NEW_UDP_PORT_MAPPING:
    case OP_CODE.NEW_TCP_PORT_MAPPING: {
      try {
        const privatePort = message.readUInt16BE(4);
        const publicPort = message.readUInt16BE(6);
        const lifetime = message.readUint32BE(8);
        logger(
          `Request new ${
            opCode === OP_CODE.NEW_UDP_PORT_MAPPING ? "udp" : "tcp"
          } port mapping: ${privatePort} => ${publicPort}, lifetime=${lifetime}`
        );
        const buf = allocResponse(opCode, RESULT_CODE.SUCCESS, 16);
        buf.writeUInt16BE(privatePort, 8);
        buf.writeUInt16BE(publicPort, 10);
        buf.writeUInt32BE(lifetime, 12);
        send(remote, buf);
      } catch (ex) {
        console.error(ex);
        send(remote, allocResponse(opCode, RESULT_CODE.NETWORK_FAILURE, 16));
      }
      return;
    }
    default: {
      console.log(`Unsupported pmp op code ${opCode}`);
      send(remote, allocResponse(opCode, RESULT_CODE.UNSUPPORTED_OPCODE));
      return;
    }
  }
});

socket.bind(SERVE_PORT);

function allocResponse(opCode, resultCode, payloadSize = 8) {
  const buf = Buffer.alloc(payloadSize);
  buf[0] = 0;
  buf[1] = opCode + 128;
  buf.writeUInt16BE(resultCode, 2);
  buf.writeUInt32BE((Date.now() - STARTED_AT) / 1000, 4);
  return buf;
}

function send(remote, payload) {
  socket.send(payload, remote.port, remote.address);
}

const PUBLIC_IP = [];
async function getPublicIp() {
  if (!PUBLIC_IP.length) {
    const res = await fetch("http://4.ipw.cn");
    const ip = await res.text();
    const fields = ip.split(".").map((s) => Number.parseInt(s));
    if (fields.length !== 4) {
      throw new Error(`Bad response`);
    }
    PUBLIC_IP.push(...fields);
  }
  return PUBLIC_IP;
}

console.log(await getPublicIp());
