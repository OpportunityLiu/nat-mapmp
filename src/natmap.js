import { spawn } from "node:child_process";
import { updatePublicIp } from "./public-ip.js";

const EXEC = "natmap";
const STUN_SERVER = "stun.stunprotocol.org";
const HOLD_SERVER = "qq.com";

const PORT_START = 9000;

const udpHolder = [];
const tcpHolder = [];

export function start(sourceAddr, sourcePort, udpMode) {
  const holder = udpMode ? udpHolder : tcpHolder;
  const port = PORT_START + holder.length;
  const natmap = spawn(
    `${EXEC} -s ${STUN_SERVER} -h ${HOLD_SERVER} -b ${port} -t ${sourceAddr} -p ${sourcePort} ${
      udpMode ? "-u" : ""
    }`,
    { shell: true }
  );
  const info = { natmap, sourceAddr, sourcePort };
  holder.push(info);
  return new Promise((resolve) => {
    natmap.stdout.on("data", (ch) => {
      const [publicAddr, publicPort, ip4p, privatePort, protocol] =
        String(ch).split(" ");
      if (protocol !== (udpMode ? "udp" : "tcp")) return;
      const fields = publicAddr.split(".").map((s) => Number.parseInt(s));
      if (fields.length !== 4) return;
      info.publicAddr = publicAddr;
      info.publicPort = publicPort;
      updatePublicIp(fields);
      resolve(Number.parseInt(publicPort));
    });
  });
}

export function stop(sourceAddr, sourcePort, udpMode) {
  const holder = udpMode ? udpHolder : tcpHolder;
  const infoIndex = holder.findIndex(
    (i) => i && i.sourceAddr === sourceAddr && i.sourcePort === sourcePort
  );
  if (infoIndex < 0) return false;
  const info = holder[infoIndex];
  info.natmap.kill();
  holder[infoIndex] = undefined;
  return true;
}
