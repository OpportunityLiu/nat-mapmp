export const VERSION = 0;
export const SERVE_PORT = 5351;

export const OP_CODE = {
  PUBLIC_ADDRESS: 0,
  NEW_UDP_PORT_MAPPING: 1,
  NEW_TCP_PORT_MAPPING: 2,
};

export const RESULT_CODE = {
  SUCCESS: 0,
  UNSUPPORTED_VERSION: 1,
  UNAUTHORIZED: 2,
  NETWORK_FAILURE: 3,
  OUT_OF_RESOURCES: 4,
  UNSUPPORTED_OPCODE: 5,
};

const STARTED_AT = Date.now();
export function initialized() {
  return Math.floor((Date.now() - STARTED_AT) / 1000);
}
