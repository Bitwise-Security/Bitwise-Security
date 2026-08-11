import path from "node:path";
import { fileTypeFromBuffer } from "file-type";

const ALLOWED_TYPES: Readonly<Record<string, readonly string[]>> = {
  ".pdf": ["application/pdf"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".csv": ["text/csv", "text/plain"],
  ".txt": ["text/plain"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
} as const;

const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".dll", ".com", ".scr", ".msi", ".bat", ".cmd", ".ps1", ".js", ".mjs",
  ".vbs", ".jar", ".apk", ".app", ".dmg", ".iso", ".html", ".htm", ".svg", ".zip",
  ".rar", ".7z", ".tar", ".gz", ".docm", ".xlsm",
]);

export function sanitizeDisplayName(input: string): string {
  const normalized = input.normalize("NFC").replace(/[\u0000-\u001f\u007f]/gu, "").trim();
  const basename = path.basename(normalized.replaceAll("\\", "/"));
  if (!basename || basename === "." || basename === ".." || basename.length > 255) {
    throw new Error("Invalid filename");
  }
  return basename;
}

export function declaredFileAllowed(displayName: string, declaredContentType: string): boolean {
  const extension = path.extname(displayName).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(extension)) return false;
  const expected = ALLOWED_TYPES[extension];
  return expected?.includes(declaredContentType.toLowerCase()) ?? false;
}

function appearsToBeUtf8Text(content: Buffer): boolean {
  if (content.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(content);
    return true;
  } catch {
    return false;
  }
}

export async function verifyDetectedType(
  displayName: string,
  firstBytes: Buffer,
): Promise<{ allowed: boolean; detectedType: string | null; reason?: string }> {
  const extension = path.extname(displayName).toLowerCase();
  const expected = ALLOWED_TYPES[extension];
  if (!expected || BLOCKED_EXTENSIONS.has(extension)) {
    return { allowed: false, detectedType: null, reason: "FILE_TYPE_BLOCKED" };
  }
  const detected = await fileTypeFromBuffer(firstBytes);
  if (extension === ".txt" || extension === ".csv") {
    if (detected || !appearsToBeUtf8Text(firstBytes)) {
      return { allowed: false, detectedType: detected?.mime ?? null, reason: "CONTENT_TYPE_MISMATCH" };
    }
    return { allowed: true, detectedType: extension === ".csv" ? "text/csv" : "text/plain" };
  }
  if (!detected || !expected.includes(detected.mime)) {
    return { allowed: false, detectedType: detected?.mime ?? null, reason: "CONTENT_TYPE_MISMATCH" };
  }
  return { allowed: true, detectedType: detected.mime };
}

export const clientFilePolicy = {
  allowedExtensions: Object.keys(ALLOWED_TYPES),
  blockedArchives: true,
};

