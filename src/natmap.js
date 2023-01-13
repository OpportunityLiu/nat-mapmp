import { spawn } from "node:child_process";

export function start(sourceIp, sourcePort, udpMode) {
  let process;
  if (udpMode) {
    process = spawn(
      `natmap -u -s stun.stunprotocol.org -b 0 -t ${sourceIp} -p ${sourcePort} -e echo`,
      { stdio: "inherit" }
    );
  } else {
    process = spawn(
      `natmap -s stun.stunprotocol.org -h qq.com -b 0 -t ${sourceIp} -p ${sourcePort} -e echo`,
      { stdio: "inherit" }
    );
  }
}
