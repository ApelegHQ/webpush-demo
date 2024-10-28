export default async (subscriptionInfo) => {
  const textEncoder = new TextEncoder();
  const canonicalForm = textEncoder.encode(JSON.stringify([
    subscriptionInfo.endpoint,
    subscriptionInfo.expirationTime,
    subscriptionInfo.keys.p256dh,
    subscriptionInfo.keys.auth,
  ]));
  const digest = await crypto.subtle.digest("SHA-384", canonicalForm);
  return Buffer.from(digest).slice(0, 16).toString("hex");
};
