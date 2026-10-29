const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** A random alphanumeric id; 16 characters matches Foundry document ids. */
export function randomId(length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) id += ALPHABET.charAt(byte % ALPHABET.length);
  return id;
}

/** Whether a value has the shape of a Foundry document id (and thus a blueprint id). */
export function isValidId(value: unknown): value is string {
  return (typeof value === "string") && /^[A-Za-z0-9]{16}$/.test(value);
}
