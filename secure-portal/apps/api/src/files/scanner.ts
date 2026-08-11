import type { Readable } from "node:stream";
import { createConnection } from "node:net";
import { once } from "node:events";
import { getConfig } from "../config.js";

export interface ScanResult {
  clean: boolean;
  signature?: string;
}

export interface MalwareScanner {
  scan(stream: Readable): Promise<ScanResult>;
}

class StubScanner implements MalwareScanner {
  public async scan(stream: Readable): Promise<ScanResult> {
    for await (const consumedChunk of stream) {
      // Consume the complete stream to exercise the same backpressure path as a real scanner.
      void consumedChunk;
    }
    return { clean: true };
  }
}

class ClamAvScanner implements MalwareScanner {
  public async scan(stream: Readable): Promise<ScanResult> {
    const config = getConfig();
    const socket = createConnection({ host: config.CLAMAV_HOST, port: config.CLAMAV_PORT });
    socket.setTimeout(120_000, () => socket.destroy(new Error("ClamAV scan timed out")));
    await once(socket, "connect");
    // ClamAV may answer immediately after the terminator. Register before the
    // upload starts so no response bytes can be lost between writes.
    const responseChunks: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => responseChunks.push(chunk));
    socket.write(Buffer.from("zINSTREAM\0"));
    for await (const rawChunk of stream) {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk as Uint8Array);
      const size = Buffer.alloc(4);
      size.writeUInt32BE(chunk.length);
      if (!socket.write(size)) await once(socket, "drain");
      if (!socket.write(chunk)) await once(socket, "drain");
    }
    socket.write(Buffer.alloc(4));
    await once(socket, "end");
    const response = Buffer.concat(responseChunks).toString("utf8").replace(/\0$/u, "").trim();
    if (response.endsWith("OK")) return { clean: true };
    if (response.includes("FOUND")) {
      const match = response.match(/: (.+) FOUND$/u);
      return { clean: false, signature: match?.[1] ?? "MALWARE_DETECTED" };
    }
    throw new Error("ClamAV returned an unexpected response");
  }
}

let scanner: MalwareScanner | undefined;

export function getMalwareScanner(): MalwareScanner {
  scanner ??= getConfig().SCANNER_MODE === "clamav" ? new ClamAvScanner() : new StubScanner();
  return scanner;
}
