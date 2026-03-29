/**
 * Token Encryption Utility
 *
 * AES-256-GCM encryption for sensitive data like access tokens.
 * Requires TOKEN_ENCRYPTION_KEY environment variable (32 bytes hex = 64 hex chars).
 *
 * If no key is configured, tokens are stored in plaintext (with a warning).
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer | null {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key) return null;

  try {
    const buffer = Buffer.from(key, "hex");
    if (buffer.length !== 32) {
      console.error("[Encryption] TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex characters)");
      return null;
    }
    return buffer;
  } catch {
    console.error("[Encryption] Invalid TOKEN_ENCRYPTION_KEY format");
    return null;
  }
}

/**
 * Encrypt a plaintext string
 * Returns format: iv:authTag:ciphertext (all base64)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) return plaintext; // Fallback to plaintext if no key

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  return `enc:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypt an encrypted string
 * Accepts format: enc:iv:authTag:ciphertext (all base64)
 * Also accepts plaintext strings (for backwards compatibility)
 */
export function decrypt(encrypted: string): string {
  // If not encrypted (no enc: prefix), return as-is
  if (!encrypted.startsWith("enc:")) return encrypted;

  const key = getEncryptionKey();
  if (!key) {
    console.warn("[Encryption] Cannot decrypt: TOKEN_ENCRYPTION_KEY not configured");
    // Return the raw encrypted text - this will fail auth but prevents crashes
    return encrypted;
  }

  try {
    const parts = encrypted.split(":");
    if (parts.length !== 4) {
      console.error("[Encryption] Invalid encrypted format");
      return encrypted;
    }

    const [, ivB64, authTagB64, ciphertext] = parts;
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("[Encryption] Decryption failed:", error);
    return encrypted;
  }
}

/**
 * Check if encryption is available
 */
export function isEncryptionEnabled(): boolean {
  return getEncryptionKey() !== null;
}
