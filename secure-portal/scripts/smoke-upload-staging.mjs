import { createCipheriv, createDecipheriv, createHmac } from "node:crypto";

const ACCOUNT_ID = "6931a6facc4105d469f43215d2c3fb23";
const DATABASE_ID = "2751c532-68f9-4ffc-988e-bb7e3afaf935";
const PORTAL_ORIGIN = "https://portal-test.bitwise-security.nl";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function decryptMfaSecret(envelope, encodedKey) {
  const [version, nonce, ciphertext, tag, ...rest] = envelope.split(".");
  if (version !== "v1" || !nonce || !ciphertext || !tag || rest.length) {
    throw new Error("Unsupported MFA secret envelope");
  }
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(encodedKey, "base64"), Buffer.from(nonce, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

function decodeBase32(input) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const output = [];
  for (const character of input.toUpperCase().replace(/=+$/u, "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid MFA secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function totp(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = (digest.at(-1) ?? 0) & 15;
  const binary =
    ((digest[offset] ?? 0) & 127) * 0x1000000 +
    (digest[offset + 1] ?? 0) * 0x10000 +
    (digest[offset + 2] ?? 0) * 0x100 +
    (digest[offset + 3] ?? 0);
  return String(binary % 1_000_000).padStart(6, "0");
}

async function jsonRequest(url, init = {}) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof payload.code === "string" ? ` (${payload.code})` : "";
    throw new Error(`${init.method ?? "GET"} ${new URL(url).pathname} failed with HTTP ${response.status}${code}`);
  }
  return { response, payload };
}

async function main() {
  const cloudflareToken = required("CLOUDFLARE_API_TOKEN");
  const adminEmail = required("PORTAL_STAGING_ADMIN_EMAIL").toLowerCase();
  const adminPassword = required("PORTAL_STAGING_ADMIN_PASSWORD");
  const mfaKey = required("PORTAL_STAGING_MFA_ENCRYPTION_KEY");

  const d1 = await jsonRequest(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${cloudflareToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        sql: `SELECT m.encrypted_secret, m.last_used_step
              FROM mfa_credentials m JOIN users u ON u.id = m.user_id
              WHERE u.email = ?`,
        params: [adminEmail],
      }),
    },
  );
  const credential = d1.payload.result?.[0]?.results?.[0];
  if (!credential?.encrypted_secret) throw new Error("Staging admin MFA credential was not found");
  const secret = decryptMfaSecret(credential.encrypted_secret, mfaKey);
  let step = Math.floor(Date.now() / 30_000);
  const lastUsedStep = credential.last_used_step == null ? -1 : Number(credential.last_used_step);
  if (step <= lastUsedStep) {
    await new Promise((resolve) => setTimeout(resolve, (lastUsedStep + 1) * 30_000 - Date.now() + 250));
    step = Math.floor(Date.now() / 30_000);
  }

  const login = await jsonRequest(`${PORTAL_ORIGIN}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: PORTAL_ORIGIN },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  const verification = await jsonRequest(`${PORTAL_ORIGIN}/api/v1/auth/mfa/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: PORTAL_ORIGIN },
    body: JSON.stringify({ challengeToken: login.payload.challengeToken, code: totp(secret, step) }),
  });
  const cookie = verification.response.headers.get("set-cookie")?.split(";", 1)[0];
  const csrf = verification.payload.csrfToken;
  if (!cookie || typeof csrf !== "string") throw new Error("Staging login did not create a session");

  const authHeaders = { Cookie: cookie };
  const mutationHeaders = { Cookie: cookie, Origin: PORTAL_ORIGIN, "X-CSRF-Token": csrf };
  const spaces = await jsonRequest(`${PORTAL_ORIGIN}/api/v1/spaces`, { headers: authHeaders });
  const spaceId = spaces.payload.spaces?.[0]?.id;
  if (typeof spaceId !== "string") throw new Error("No staging client space is available for the upload smoke test");

  const plaintext = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n", "utf8");
  let fileId;
  try {
    const created = await jsonRequest(`${PORTAL_ORIGIN}/api/v1/spaces/${spaceId}/uploads`, {
      method: "POST",
      headers: { ...mutationHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "portal-upload-smoke-test.pdf",
        contentType: "application/pdf",
        size: plaintext.length,
        expiresInDays: 7,
        deliveryMode: "PASSWORD_LINK",
      }),
    });
    fileId = created.payload.fileId;
    const key = Buffer.from(created.payload.plaintextKey, "base64");
    const nonce = Buffer.alloc(12);
    Buffer.from(created.payload.noncePrefix, "base64").copy(nonce);
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    cipher.setAAD(Buffer.from(`bitwise-file-v1:${fileId}:1:${plaintext.length}`, "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
    key.fill(0);

    const target = await jsonRequest(`${PORTAL_ORIGIN}/api/v1/uploads/${created.payload.id}/parts/1/url`, {
      method: "POST",
      headers: { ...mutationHeaders, "Content-Type": "application/json" },
      body: "{}",
    });
    const partResponse = await fetch(new URL(target.payload.url, PORTAL_ORIGIN), {
      method: "PUT",
      headers: { ...mutationHeaders, "Content-Type": "application/octet-stream" },
      body: ciphertext,
    });
    if (!partResponse.ok) throw new Error(`Encrypted part upload failed with HTTP ${partResponse.status}`);
    await jsonRequest(`${PORTAL_ORIGIN}/api/v1/uploads/${created.payload.id}/complete`, {
      method: "POST",
      headers: { ...mutationHeaders, "Content-Type": "application/json" },
      body: "{}",
    });
    const credentials = created.payload.secureTransfer;
    if (!credentials?.url || !credentials?.password) throw new Error("Secure-transfer credentials were not returned");
    let available = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const listing = await jsonRequest(`${PORTAL_ORIGIN}/api/v1/spaces/${spaceId}/files`, { headers: authHeaders });
      const file = listing.payload.files?.find((candidate) => candidate.id === fileId);
      if (file?.status === "AVAILABLE") { available = true; break; }
      if (file?.status === "REJECTED") throw new Error("The harmless smoke-test PDF was rejected by validation");
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    if (!available) throw new Error("The staging malware scan did not finish within two minutes");

    const publicHeaders = { Origin: PORTAL_ORIGIN, "Content-Type": "application/json" };
    const wrong = await fetch(`${PORTAL_ORIGIN}/api/v1/public/secure-transfers/unlock`, {
      method: "POST",
      headers: publicHeaders,
      body: JSON.stringify({ token: new URL(credentials.url).hash.slice("#token=".length), password: "0000-0000-0000-0000-0000-0000" }),
    });
    if (wrong.status !== 404) throw new Error(`Wrong secure-transfer password was not denied (HTTP ${wrong.status})`);
    const token = new URLSearchParams(new URL(credentials.url).hash.slice(1)).get("token");
    const unlocked = await jsonRequest(`${PORTAL_ORIGIN}/api/v1/public/secure-transfers/unlock`, {
      method: "POST",
      headers: publicHeaders,
      body: JSON.stringify({ token, password: credentials.password }),
    });
    const firstDownload = await fetch(new URL(unlocked.payload.downloadUrl, PORTAL_ORIGIN));
    if (!firstDownload.ok || !Buffer.from(await firstDownload.arrayBuffer()).equals(plaintext)) {
      throw new Error("The unlocked staging download did not match the uploaded plaintext");
    }
    const replay = await fetch(new URL(unlocked.payload.downloadUrl, PORTAL_ORIGIN));
    if (replay.status !== 404) throw new Error(`A one-use download ticket was replayable (HTTP ${replay.status})`);
    console.log("Staging encrypted upload, scan, password unlock, download, and replay denial all succeeded.");
  } finally {
    if (fileId) {
      await jsonRequest(`${PORTAL_ORIGIN}/api/v1/files/${fileId}`, {
        method: "DELETE",
        headers: mutationHeaders,
      }).catch((error) => console.warn(`Smoke-test cleanup warning: ${error.message}`));
    }
  }
}

main().catch((error) => {
  console.error(`Staging upload smoke test failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
});
