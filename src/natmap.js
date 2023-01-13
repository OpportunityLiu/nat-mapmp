import { spawn } from "node:child_process";

const EXEC = "natmap";
const STUN_SERVER = "stun.stunprotocol.org";
const HOLD_SERVER = "qq.com";

let port = 9001;

export function start(sourceIp, sourcePort, udpMode) {
  const natmap = spawn(
    `${EXEC} -s ${STUN_SERVER} -h ${HOLD_SERVER} -b ${port} -t ${sourceIp} -p ${sourcePort} ${
      udpMode ? "-u" : ""
    }`,
    { shell: true }
  );
  natmap.stdout.on("data", (ch) => console.log(ch));
}
