import { once } from "node:events";
import { createServer } from "node:net";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { resetConfigForTests } from "../src/config.js";
import { ClamAvScanner } from "../src/files/scanner.js";

describe("ClamAV stream protocol", () => {
  const originalHost = process.env.CLAMAV_HOST;
  const originalPort = process.env.CLAMAV_PORT;

  afterEach(() => {
    if (originalHost === undefined) delete process.env.CLAMAV_HOST;
    else process.env.CLAMAV_HOST = originalHost;
    if (originalPort === undefined) delete process.env.CLAMAV_PORT;
    else process.env.CLAMAV_PORT = originalPort;
    resetConfigForTests();
  });

  it("finishes on the NUL-framed reply without waiting for the daemon to close", async () => {
    const server = createServer((socket) => {
      let received = Buffer.alloc(0);
      socket.on("data", (chunk: Buffer) => {
        received = Buffer.concat([received, chunk]);
        if (received.length >= 18 && received.subarray(-4).equals(Buffer.alloc(4))) {
          socket.write(Buffer.from("stream: OK\0"));
        }
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
    process.env.CLAMAV_HOST = "127.0.0.1";
    process.env.CLAMAV_PORT = String(address.port);
    resetConfigForTests();
    try {
      await expect(Promise.race([
        new ClamAvScanner().scan(Readable.from([Buffer.from("clean test content")])),
        new Promise((_, reject) => setTimeout(() => reject(new Error("scan did not finish")), 1_000)),
      ])).resolves.toEqual({ clean: true });
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
