export const VERSION = 0;

export enum OpCode {
  PUBLIC_ADDRESS = 0,
  NEW_UDP_PORT_MAPPING = 1,
  NEW_TCP_PORT_MAPPING = 2,
}

export enum ResultCode {
  SUCCESS = 0,
  UNSUPPORTED_VERSION = 1,
  UNAUTHORIZED = 2,
  NETWORK_FAILURE = 3,
  OUT_OF_RESOURCES = 4,
  UNSUPPORTED_OPCODE = 5,
}