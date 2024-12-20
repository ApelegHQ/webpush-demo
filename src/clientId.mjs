// Generate an UUID from a `PushSubscription'
export default async (subscriptionInfo) => {
  const textEncoder = new TextEncoder();
  // <https://w3c.github.io/push-api/#pushsubscription-interface>
  const endpoint = textEncoder.encode(subscriptionInfo.endpoint);
  // <https://w3c.github.io/push-api/#pushencryptionkeyname-enumeration>
  const p256dh = textEncoder.encode(subscriptionInfo.keys.p256dh);
  const auth = textEncoder.encode(subscriptionInfo.keys.auth);

  const canonicalForm = new ArrayBuffer(
    8 +
      (4 + endpoint.byteLength) + (2 + p256dh.byteLength) +
      (2 + auth.byteLength),
  );
  const canonicalFormU8 = new Uint8Array(canonicalForm);
  const canonicalFormDV = new DataView(canonicalForm);
  let offset = 0;
  canonicalFormDV.setFloat64(
    offset,
    subscriptionInfo.expirationTime == null
      ? NaN
      : subscriptionInfo.expirationTime,
    false,
  );
  offset += 8;
  canonicalFormDV.setUint32(offset, endpoint.byteLength, false);
  offset += 4;
  canonicalFormU8.set(endpoint, offset);
  offset += endpoint.byteLength;
  canonicalFormDV.setUint16(offset, p256dh.byteLength, false);
  offset += 2;
  canonicalFormU8.set(p256dh, offset);
  offset += p256dh.byteLength;
  canonicalFormDV.setUint16(offset, auth.byteLength, false);
  offset += 2;
  canonicalFormU8.set(auth, offset);

  const digest = await crypto.subtle.digest("SHA-384", canonicalForm);
  const id = Buffer.from(digest.slice(0, 16));
  id[6] = 0x80 | (id[6] & 0x0F);
  id[8] = 0x80 | (id[8] & 0x3F);

  return [
    id.slice(0, 4),
    id.slice(4, 6),
    id.slice(6, 8),
    id.slice(8, 10),
    id.slice(10, 16),
  ].map((p) => p.toString("hex")).join("-");
};
