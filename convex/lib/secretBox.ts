/**
 * Encrypting a secret that has to be replayed.
 *
 * Ported from CodeOS (`convex/lib/secretBox.ts`).
 *
 * Every other secret in this schema is stored as a HASH — a check-in token is
 * verified by hashing the presented one, an invitation likewise — because none
 * of them is ever needed again in its original form. A hash cannot leak a
 * credential because it cannot produce one.
 *
 * An AI provider key is different in kind. It has to be sent to the provider on
 * every call, so it must be recoverable, and hashing is not available. Rather
 * than store it in the clear, it is encrypted. The difference matters because
 * of where these rows go: a plaintext key in a table is readable by anyone with
 * dashboard access, and it travels into every backup and export. Encryption at
 * rest means a leaked snapshot is not a leaked credential.
 *
 * ## What this is, precisely
 *
 * AES-256-GCM with a random 96-bit IV per encryption, under one key held in the
 * `AI_CREDENTIAL_KEY` environment variable. GCM is authenticated, so a tampered
 * ciphertext fails to decrypt rather than producing plausible rubbish that
 * would then be sent to a vendor as somebody's key.
 *
 * ## What it is not
 *
 * It is not protection from someone who has the deployment's environment.
 * `AI_CREDENTIAL_KEY` lives beside the ciphertext's reader, so an attacker with
 * both the database and the environment has the key — that is the nature of a
 * symmetric secret an application must use unattended, and pretending otherwise
 * would be worse than saying it. What it protects against is the realistic
 * case: a snapshot, a support export, a dashboard read, a mis-shared backup.
 *
 * Raising that bar means a KMS holding the key material, which is a deployment
 * decision rather than a code one — the seam is this file, one function pair
 * wide.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** 96 bits, which is what GCM is specified for and fastest at. */
const IV_BYTES = 12;

export interface SealedSecret {
    /** Base64 ciphertext, including GCM's authentication tag. */
    ciphertext: string;
    /** Base64 IV. Unique per encryption; reusing one under the same key breaks GCM completely. */
    iv: string;
}

function toBase64(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/**
 * The deployment's encryption key, or a refusal.
 *
 * Throws rather than falling back to storing plaintext. A deployment that has
 * not been given a key cannot hold organization credentials, and the failure
 * has to be loud at the moment somebody tries to save one — the alternative is
 * a system that silently downgrades its own storage guarantee and tells nobody.
 */
async function deploymentKey(): Promise<CryptoKey> {
    const configured = process.env.AI_CREDENTIAL_KEY;
    if (!configured) {
        throw new Error(
            "AI_CREDENTIAL_KEY is not set on this deployment, so provider keys cannot be stored. " +
                "Generate one with: openssl rand -base64 32",
        );
    }

    const raw = fromBase64(configured.trim());
    if (raw.length !== 32) {
        throw new Error(
            `AI_CREDENTIAL_KEY must be 32 bytes, base64-encoded (got ${raw.length}). ` +
                "Generate one with: openssl rand -base64 32",
        );
    }

    return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, [
        "encrypt",
        "decrypt",
    ]);
}

/**
 * Encrypt. **Actions only** — it draws a random IV, which a mutation may not.
 *
 * Convex retries mutations, so anything non-deterministic inside one is a
 * correctness bug. That is why sealing happens in an action and the mutation is
 * handed a finished ciphertext.
 */
export async function seal(plaintext: string): Promise<SealedSecret> {
    const key = await deploymentKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        encoder.encode(plaintext) as BufferSource,
    );
    return { ciphertext: toBase64(new Uint8Array(ciphertext)), iv: toBase64(iv) };
}

/**
 * Decrypt, or throw.
 *
 * A failure here means the ciphertext was tampered with, or the deployment's
 * key has changed — both of which must stop the call rather than degrade it.
 * Returning null would invite a caller to carry on with an empty key and blame
 * the vendor for the 401.
 */
export async function open(sealed: SealedSecret): Promise<string> {
    const key = await deploymentKey();
    try {
        const plaintext = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: fromBase64(sealed.iv) as BufferSource },
            key,
            fromBase64(sealed.ciphertext) as BufferSource,
        );
        return decoder.decode(plaintext);
    } catch {
        throw new Error(
            "A stored provider key could not be decrypted. Either AI_CREDENTIAL_KEY has changed " +
                "since it was saved, or the row has been altered. Re-enter the key to fix it.",
        );
    }
}

/**
 * The last four characters, for showing WHICH key is stored without showing the
 * key.
 *
 * Four, not eight: enough for an administrator to tell two keys apart on
 * screen, few enough to be useless to anybody else. Computed at save time and
 * stored beside the ciphertext, so rendering the settings page never has to
 * decrypt anything.
 */
export function fingerprint(plaintext: string): string {
    const trimmed = plaintext.trim();
    return trimmed.length <= 4 ? "…" : `…${trimmed.slice(-4)}`;
}
