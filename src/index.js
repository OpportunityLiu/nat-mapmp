import { createSocket } from "node:dgram";
import { getPublicIp } from "./public-ip.js";
import {
  SERVE_PORT,
  VERSION,
  RESULT_CODE,
  OP_CODE,
  initialized,
} from "./constants.js";
import { start } from "./natmap.js";

const socket = createSocket("udp4", handler);
socket.bind(SERVE_PORT);

/**
 * @param {Buffer} message
 * @param {import('node:dgram').RemoteInfo} remote
 */
async function handler(message, remote) {
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
        await sendPublicIp(remote);
      } catch (ex) {
        logger(ex);
      }
      return;
    }
    case OP_CODE.NEW_UDP_PORT_MAPPING:
    case OP_CODE.NEW_TCP_PORT_MAPPING: {
      try {
        const privatePort = message.readUInt16BE(4);
        const publicPort = message.readUInt16BE(6);
        const lifetime = message.readUint32BE(8);
        const udpMode = opCode === OP_CODE.NEW_UDP_PORT_MAPPING;
        logger(
          `Request new ${
            udpMode ? "udp" : "tcp"
          } port mapping: ${privatePort} => ${publicPort}, lifetime=${lifetime}`
        );
        start(remote.address, privatePort, udpMode);
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
}

function allocResponse(opCode, resultCode, payloadSize = 8) {
  const buf = Buffer.alloc(payloadSize);
  buf[0] = 0;
  buf[1] = opCode + 128;
  buf.writeUInt16BE(resultCode, 2);
  buf.writeUInt32BE(initialized(), 4);
  return buf;
}

function send(remote, payload) {
  socket.send(payload, remote.port, remote.address);
}

async function sendPublicIp(remote) {
  try {
    const buf = allocResponse(OP_CODE.PUBLIC_ADDRESS, RESULT_CODE.SUCCESS, 12);
    const ip = await getPublicIp();
    buf[8] = ip[0];
    buf[9] = ip[1];
    buf[10] = ip[2];
    buf[11] = ip[3];
    send(remote, buf);
  } catch (ex) {
    send(
      remote,
      allocResponse(OP_CODE.PUBLIC_ADDRESS, RESULT_CODE.NETWORK_FAILURE, 12)
    );
    throw ex;
  }
}
