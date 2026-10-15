import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Documents are encrypted at rest with AES-256-GCM. File layout: [12-byte IV][16-byte tag][ciphertext].
// Swap this module for S3/GCS (with SSE) in production; callers only use saveFile/readFile.

function dir() {
  return path.resolve(process.env.UPLOAD_DIR || "./storage");
}

function key() {
  const hex = process.env.FILE_ENCRYPTION_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("FILE_ENCRYPTION_KEY must be 64 hex chars");
  return Buffer.from(hex, "hex");
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export async function saveFile(tenantId: string, data: Buffer): Promise<string> {
  const storedName = `${tenantId}/${crypto.randomUUID()}.bin`;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const full = path.join(dir(), storedName);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, Buffer.concat([iv, cipher.getAuthTag(), enc]));
  return storedName;
}

export async function readFile(storedName: string): Promise<Buffer> {
  const full = path.join(dir(), storedName);
  if (!full.startsWith(dir() + path.sep)) throw new Error("bad path");
  const buf = await fs.readFile(full);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
}
