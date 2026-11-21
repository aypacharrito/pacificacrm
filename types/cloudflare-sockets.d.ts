declare module "cloudflare:sockets" {
  export function connect(address: {hostname: string; port: number}, options: {secureTransport: "on"}): {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    close(): Promise<void>;
  };
}
