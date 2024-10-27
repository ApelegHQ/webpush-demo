// Key derivation as per RFC 8291
export default async (uaPublic, salt) => {
  const [[asPrivateKey, asPublic], uaPublicKey] = await Promise.all([
    crypto.subtle.generateKey(
      {
        name: "ECDH",
        namedCurve: "P-256",
      },
      false,
      ["deriveKey"],
    ).then(async (asKeyPair) => {
      const asPublic = await crypto.subtle.exportKey(
        "raw",
        asKeyPair.publicKey,
      );

      return [asKeyPair.privateKey, asPublic];
    }),
    crypto.subtle.importKey(
      "raw",
      uaPublic,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      [],
    ),
  ]);

  const ecdhSecret = await crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: uaPublicKey,
    },
    asPrivateKey,
    {
      name: "HKDF",
      hash: "SHA-256",
    },
    false,
    ["deriveBits"],
  );

  const IKM = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: Buffer.concat([
        // The `WebPush: info\x00` string
        new Uint8Array([
          0x57,
          0x65,
          0x62,
          0x50,
          0x75,
          0x73,
          0x68,
          0x3a,
          0x20,
          0x69,
          0x6e,
          0x66,
          0x6f,
          0x00,
        ]),
        uaPublic,
        new Uint8Array(asPublic),
      ]),
    },
    ecdhSecret,
    32 << 3,
  );

  // Role in RFC8188: `asPublic` is used as key ID, IKM as IKM.
  return [asPublic, IKM];
};
