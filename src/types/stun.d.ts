declare module "stun" {
  interface Address {
    address: string;
    port: number;
    family: "IPv4" | "IPv6";
  }

  class StunAttribute {
    readonly type: number;
    readonly value: unknown;
  }
  class StunMessage implements Iterable<StunAttribute> {
    readonly type: number;
    readonly transactionId: Buffer;
    isLegacy(): boolean;
    readonly count: number;
    getAttribute(type: number): StunAttribute | undefined;
    hasAttribute(type: number): boolean;
    [Symbol.iterator](): Generator<StunAttribute>;
  }
  class StunResponse extends StunMessage {
    getAddress(): Address;
    getXorAddress(): Address;
    getAlternateServer(): Address;
  }
  function request(
    url: string,
    options?: RequestOptions
  ): Promise<StunResponse>;
}
