import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../../node_modules/@playwright/test/index.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const portalRoot = path.resolve(scriptDirectory, "..");
const distRoot = path.join(portalRoot, "apps", "web", "dist");
const outputRoot = path.resolve(portalRoot, "..", "public", "secure-portal");
const host = "127.0.0.1";
const port = 4178;
const demoSpaceId = "11111111-1111-4111-8111-111111111111";

const adminUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "portal-admin@example.test",
  displayName: "Bitwise Administrator",
  role: "ADMIN",
};
const clientUser = {
  id: "33333333-3333-4333-8333-333333333333",
  email: "security@northstar.example",
  displayName: "Northstar Security Team",
  role: "CLIENT",
};

const demoFiles = [
  { id: "f1", direction: "CLIENT_TO_ADMIN", display_name: "assessment-scope.pdf", plaintext_size: "284991", status: "AVAILABLE", expires_at: null, created_at: "2026-08-08T09:15:00.000Z", uploaded_by_me: false },
  { id: "f2", direction: "CLIENT_TO_ADMIN", display_name: "network-overview.xlsx", plaintext_size: "98122", status: "AVAILABLE", expires_at: "2026-09-08T09:15:00.000Z", created_at: "2026-08-09T13:40:00.000Z", uploaded_by_me: false },
  { id: "f3", direction: "ADMIN_TO_CLIENT", display_name: "northstar-security-review.pdf", plaintext_size: "4862112", status: "AVAILABLE", expires_at: "2026-09-11T15:30:00.000Z", created_at: "2026-08-11T15:30:00.000Z", uploaded_by_me: true },
  { id: "f4", direction: "ADMIN_TO_CLIENT", display_name: "remediation-priorities.csv", plaintext_size: "44217", status: "AVAILABLE", expires_at: "2026-09-11T15:35:00.000Z", created_at: "2026-08-11T15:35:00.000Z", uploaded_by_me: true },
];

const transfers = [
  { id: "t1", status: "ACTIVE", expires_at: "2026-08-18T14:00:00.000Z", download_count: 0, display_name: "executive-summary.pdf" },
  { id: "t2", status: "ACTIVE", expires_at: "2026-08-17T09:30:00.000Z", download_count: 1, display_name: "technical-evidence.zip" },
  { id: "t3", status: "REVOKED", expires_at: "2026-08-15T11:00:00.000Z", download_count: 1, display_name: "draft-report.pdf" },
];

const auditEvents = [
  ["a1", "AUTH_LOGIN", "SUCCESS", "Bitwise Administrator", "2026-08-12T12:45:00.000Z", "203.0.113.10"],
  ["a2", "SECURE_TRANSFER_CREATED", "SUCCESS", "Bitwise Administrator", "2026-08-12T12:31:00.000Z", "203.0.113.10"],
  ["a3", "FILE_DOWNLOAD", "SUCCESS", "Northstar Security Team", "2026-08-12T10:18:00.000Z", "198.51.100.24"],
  ["a4", "FILE_UPLOAD", "SUCCESS", "Bitwise Administrator", "2026-08-11T15:35:00.000Z", "203.0.113.10"],
  ["a5", "CLIENT_INVITED", "SUCCESS", "Bitwise Administrator", "2026-08-10T09:10:00.000Z", "203.0.113.10"],
].map(([id, action, outcome, actor_name, created_at, ip_address]) => ({ id, action, outcome, actor_name, actor_email: null, target_type: null, created_at, ip_address }));

function json(response, payload, statusCode = 200) {
  response.writeHead(statusCode, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

function previewRole(request) {
  const cookie = request.headers.cookie ?? "";
  return cookie.match(/(?:^|;\s*)portal_preview_role=([^;]+)/u)?.[1] ?? "none";
}

function mockApi(request, response, pathname) {
  const role = previewRole(request);
  if (pathname === "/api/v1/auth/session") {
    if (role === "admin") return json(response, { csrfToken: "sterile-demo-token", user: adminUser });
    if (role === "client") return json(response, { csrfToken: "sterile-demo-token", user: clientUser });
    return json(response, { error: "Authentication required" }, 401);
  }
  if (pathname === "/api/v1/spaces") return json(response, { spaces: [{ id: demoSpaceId, name: "Northstar Demo — 2026 Review" }] });
  if (pathname === "/api/v1/admin/clients") {
    return json(response, { clients: [
      { id: "c1", email: "security@northstar.example", display_name: "Northstar Security Team", status: "ACTIVE", last_login_at: "2026-08-12T10:18:00.000Z", space_name: "Northstar Demo — 2026 Review", space_id: demoSpaceId },
      { id: "c2", email: "it@bluepeak.example", display_name: "BluePeak IT", status: "ACTIVE", last_login_at: "2026-08-11T08:20:00.000Z", space_name: "BluePeak External Assessment", space_id: "s2" },
      { id: "c3", email: "risk@harbor.example", display_name: "Harbor Risk", status: "INVITED", last_login_at: null, space_name: "Harbor Web Review", space_id: "s3" },
    ] });
  }
  if (pathname.endsWith("/files")) return json(response, { files: demoFiles });
  if (pathname.endsWith("/secure-transfers")) return json(response, { transfers, pagination: { page: 1, pageSize: 10, total: transfers.length, totalPages: 1 } });
  if (pathname === "/api/v1/admin/audit-events") return json(response, { events: auditEvents, pagination: { page: 1, pageSize: 10, total: auditEvents.length, totalPages: 1 } });
  return json(response, { error: "Preview endpoint not found" }, 404);
}

const mimeTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  if (url.pathname.startsWith("/api/")) return mockApi(request, response, url.pathname);
  const requested = url.pathname.startsWith("/assets/") ? path.join(distRoot, url.pathname) : path.join(distRoot, "index.html");
  try {
    const details = await stat(requested);
    if (!details.isFile()) throw new Error("Not a file");
    const extension = path.extname(requested);
    response.writeHead(200, { "Content-Type": mimeTypes[extension] ?? "application/octet-stream" });
    response.end(await readFile(requested));
  } catch {
    response.writeHead(404);
    response.end();
  }
});

await new Promise((resolve) => server.listen(port, host, resolve));
const browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" });

try {
  const loginContext = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const loginPage = await loginContext.newPage();
  await loginPage.goto(`http://${host}:${port}/login`, { waitUntil: "networkidle" });
  await loginPage.screenshot({ path: path.join(outputRoot, "secure-login.png"), fullPage: true });
  await loginContext.close();

  const adminContext = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await adminContext.addCookies([{ name: "portal_preview_role", value: "admin", domain: host, path: "/" }]);
  const adminPage = await adminContext.newPage();
  await adminPage.goto(`http://${host}:${port}/`, { waitUntil: "networkidle" });
  await adminPage.locator("#workspace").screenshot({ path: path.join(outputRoot, "admin-workspace.png") });
  await adminPage.getByRole("button", { name: "Password-protected link" }).click();
  await adminPage.locator(".featured-card").screenshot({ path: path.join(outputRoot, "protected-delivery.png") });
  await adminContext.close();

  const clientContext = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  await clientContext.addCookies([{ name: "portal_preview_role", value: "client", domain: host, path: "/" }]);
  const clientPage = await clientContext.newPage();
  await clientPage.goto(`http://${host}:${port}/`, { waitUntil: "networkidle" });
  await clientPage.locator("#workspace").screenshot({ path: path.join(outputRoot, "client-workspace.png") });
  await clientContext.close();
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

process.stdout.write("Captured four sterile portal product screenshots.\n");
