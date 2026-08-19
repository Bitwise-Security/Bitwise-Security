import { createConnection } from "node:net";

const socket = createConnection({ host: "127.0.0.1", port: 3310 });
const payload = Buffer.from("clean local scanner diagnostic", "utf8");
const length = Buffer.alloc(4);
length.writeUInt32BE(payload.length);
const response = [];

socket.setTimeout(10_000, () => socket.destroy(new Error("ClamAV smoke test timed out")));
socket.once("connect", () => {
  socket.write(Buffer.concat([
    Buffer.from("zINSTREAM\0"),
    length,
    payload,
    Buffer.alloc(4),
  ]));
});
socket.on("data", (chunk) => response.push(chunk));
socket.once("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
socket.once("end", () => {
  const result = Buffer.concat(response).toString("utf8").replace(/\0$/u, "").trim();
  if (!result.endsWith("OK")) {
    console.error(`Unexpected ClamAV response: ${result}`);
    process.exitCode = 1;
    return;
  }
  console.log(result);
});
