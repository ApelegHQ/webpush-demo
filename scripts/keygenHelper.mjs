async function generateAndExportECDSAKey() {
  // Generate a new ECDSA key pair
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256", // Use P-256 curve
    },
    true, // Whether the key is extractable
    ["sign", "verify"], // Usages
  );

  // Export the private key
  const privateKey = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const publicKey = await crypto.subtle.exportKey("raw", keyPair.publicKey);

  // Convert ArrayBuffer to Buffer for easier handling
  const publicKeyBuffer = Buffer.from(publicKey);

  console.log(JSON.stringify(
    {
      "VAPID_EMAIL": "mailto:support@example.com",
      "VAPID_PUBLIC_KEY": publicKeyBuffer.toString("base64url"),
      "VAPID_PRIVATE_KEY": privateKey,
    },
    undefined,
    4,
  ));
}

generateAndExportECDSAKey();
