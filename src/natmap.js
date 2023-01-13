import { spawn } from "node:child_process";

export function start(sourceIp, sourcePort, udpMode) {
  let natmap;
  if (udpMode) {
    natmap = spawn(
      `natmap -u -s stun.stunprotocol.org -b 0 -t ${sourceIp} -p ${sourcePort}`,
      { stdio: "pipe" }
    );
  } else {
    natmap = spawn(
      `natmap -s stun.stunprotocol.org -h qq.com -b 0 -t ${sourceIp} -p ${sourcePort}`,
      { stdio: "pipe" }
    );
  }
  natmap.stdout.on("data", (ch) => console.log(ch));
}
