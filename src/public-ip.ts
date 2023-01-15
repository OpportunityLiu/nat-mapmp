import { request } from "stun";
import { config } from "./config.js";

const PUBLIC_IP: number[] = [];

export async function getPublicIp(stunServer = config.stunServer) {
  if (!PUBLIC_IP.length) {
    const res = await request(stunServer);
    const ip = res.getXorAddress()?.address;
    const fields = ip.split(".").map((s) => Number.parseInt(s));
    updatePublicIp(fields);
  }
  return PUBLIC_IP;
}

export function updatePublicIp(fields: number[]) {
  if (fields.length !== 4) {
    throw new Error(`Bad response`);
  }
  PUBLIC_IP.length = 0;
  PUBLIC_IP.push(...fields);
}
