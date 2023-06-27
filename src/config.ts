export const config = {
  host: "0.0.0.0",
  port: 5351,
  exec: "natmap",

  bindPort: Object.defineProperty(
    [9000, 9999] as readonly [number, number],
    "toJSON",
    {
      value() {
        return `${this[0]}-${this[1]}`;
      },
    }
  ),
  stunServer: "stunserver.stunprotocol.org",
  holdServer: "qq.com",

  tcpArgs: "",
  udpArgs: "-u",
};
