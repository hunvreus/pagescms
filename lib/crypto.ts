/**
 * Utility functions to encrypt and decrypt text using AES-GCM. Used to secure
 * info in the DB (e.g. GitHub tokens).
 * 
 * Requires a CRYPTO_KEY environment variable to be set.
 */

// Import the key from the CRYPTO_KEY environment variable
const importKey = async (base64Key: string) => {
  const rawKey = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
};

const encrypt = async (text: string) => {
  if (process.env.CRYPTO_KEY === undefined) throw new Error('Crypto key is not set.');
  const key = await importKey(process.env.CRYPTO_KEY);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encodedText = new TextEncoder().encode(text);

  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedText
  );

  return {
    ciphertext: btoa(String.fromCharCode(...Array.from(new Uint8Array(encryptedData)))),
    iv: btoa(String.fromCharCode(...Array.from(iv)))
  };
};

const decrypt = async (ciphertext: string, iv: string) => {
  if (process.env.CRYPTO_KEY === undefined) throw new Error('Crypto key is not set.');
  const key = await importKey(process.env.CRYPTO_KEY);
  const ivArray = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
  const encryptedDataArray = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));

  const decryptedData = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivArray },
    key,
    encryptedDataArray
  );

  return new TextDecoder().decode(decryptedData);
};

export { encrypt, decrypt };