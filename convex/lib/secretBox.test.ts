import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fingerprint, open, seal } from "./secretBox";

/**
 * A key we can throw away, generated the way the README tells an operator to.
 */
const TEST_KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
const OTHER_KEY = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

const SECRET = "sk-ant-api03-not-a-real-key-0123456789abcdef";

describe("secretBox", () => {
    beforeEach(() => {
        process.env.AI_CREDENTIAL_KEY = TEST_KEY;
    });
    afterEach(() => {
        delete process.env.AI_CREDENTIAL_KEY;
    });

    it("returns a sealed secret to its plaintext", async () => {
        const sealed = await seal(SECRET);
        expect(await open(sealed)).toBe(SECRET);
    });

    it("never stores the plaintext in the ciphertext", async () => {
        const sealed = await seal(SECRET);
        expect(sealed.ciphertext).not.toContain(SECRET);
        expect(sealed.ciphertext).not.toContain("sk-ant");
    });

    /**
     * Reusing an IV under one key breaks GCM completely, so this is not a
     * stylistic check — two encryptions of the same secret must differ.
     */
    it("draws a fresh IV every time", async () => {
        const a = await seal(SECRET);
        const b = await seal(SECRET);
        expect(a.iv).not.toBe(b.iv);
        expect(a.ciphertext).not.toBe(b.ciphertext);
        expect(await open(a)).toBe(await open(b));
    });

    /**
     * GCM is authenticated: a tampered row fails to decrypt rather than
     * producing plausible rubbish that would then be sent to a vendor as
     * somebody's key.
     */
    it("refuses a tampered ciphertext instead of returning rubbish", async () => {
        const sealed = await seal(SECRET);
        const flipped = sealed.ciphertext.slice(0, -4) + (sealed.ciphertext.endsWith("A") ? "B" : "A") + sealed.ciphertext.slice(-3);
        await expect(open({ ...sealed, ciphertext: flipped })).rejects.toThrow(
            /could not be decrypted/i,
        );
    });

    it("refuses to decrypt under a different deployment key", async () => {
        const sealed = await seal(SECRET);
        process.env.AI_CREDENTIAL_KEY = OTHER_KEY;
        await expect(open(sealed)).rejects.toThrow(/could not be decrypted/i);
    });

    /**
     * The failure has to be loud at the moment somebody tries to save a key.
     * The alternative is a system that silently downgrades its own storage
     * guarantee to plaintext and tells nobody.
     */
    it("refuses to seal at all when the deployment has no key", async () => {
        delete process.env.AI_CREDENTIAL_KEY;
        await expect(seal(SECRET)).rejects.toThrow(/AI_CREDENTIAL_KEY is not set/);
    });

    it("refuses a key of the wrong length, naming the fix", async () => {
        process.env.AI_CREDENTIAL_KEY = btoa("too short");
        await expect(seal(SECRET)).rejects.toThrow(/must be 32 bytes/);
    });
});

describe("fingerprint", () => {
    it("shows the last four characters and nothing else", () => {
        expect(fingerprint(SECRET)).toBe("…cdef");
        expect(fingerprint(SECRET)).not.toContain("sk-ant");
    });

    it("gives away nothing for a string too short to have a tail", () => {
        expect(fingerprint("abc")).toBe("…");
    });
});
