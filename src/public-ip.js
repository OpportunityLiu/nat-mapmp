import fetch from "node-fetch";

const PUBLIC_IP = [];

export async function getPublicIp() {
  if (!PUBLIC_IP.length) {
    const res = await fetch("http://4.ipw.cn");
    const ip = await res.text();
    const fields = ip.split(".").map((s) => Number.parseInt(s));
    updatePublicIp(fields);
  }
  return PUBLIC_IP;
}

export function updatePublicIp(fields) {
  if (fields.length !== 4) {
    throw new Error(`Bad response`);
  }
  PUBLIC_IP.length = 0;
  PUBLIC_IP.push(...fields);
}
