import { aes128gcm } from "@apeleghq/rfc8188/encodings";
import encrypt from "@apeleghq/rfc8188/encrypt";
import vapid from "../config/vapid.json" with { type: "json" };
import clientId from "./clientId.mjs";
import subscriptionInfoWrapper from "./subscriptionInfoWrapper.mjs";

const clients = new Map();

const encryptPayload = async (subcription, data) => {
  const readableStream = new Response(data).body;
  const [asPublic, IKM] = await subcription.encryptionKeys;

  return encrypt(aes128gcm, readableStream, 32768, asPublic, IKM);
};

const generateJwt = async (endpoint) => {
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    vapid.VAPID_PRIVATE_KEY,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const now = Math.round(Date.now() / 1e3);

  const audience = endpoint.origin;

  const header = Buffer.from(JSON.stringify(
    Object.fromEntries([["typ", "JWT"], ["alg", "ES256"]]),
  )).toString("base64url");
  const body = Buffer.from(JSON.stringify(
    Object.fromEntries([
      ["aud", audience],
      ["exp", now + 60],
      ["iat", now],
      ["nbf", now - 60],
      ["sub", vapid.VAPID_EMAIL],
    ]),
  )).toString("base64url");

  const signature = Buffer.from(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      Buffer.from([header, body].join(".")),
    ),
  ).toString("base64url");

  return [header, body, signature].join(".");
};

const postEvent = async (subscription, event) => {
  const jwt = await generateJwt(subscription.endpoint);
  const body = await encryptPayload(subscription, JSON.stringify(event));
  const bodyBytes = await ((async () => {
    const chunks = [];
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new Uint8Array(value));
    }
    return Buffer.concat(chunks);
  })());

  const req = await fetch(subscription.endpoint, {
    method: "POST",
    headers: [
      ["authorization", `vapid t=${jwt}, k=${vapid.VAPID_PUBLIC_KEY}`],
      ["content-encoding", "aes128gcm"],
      [
        "content-type",
        "application/octet-stream",
      ],
      // ["push-receipt", ""],
      ["ttl", "60"],
    ],
    body: bodyBytes,
    // duplex: "half",
  });

  if (!req.ok) {
    console.error(
      new Date().toISOString(),
      "Error sending event",
      subscription.id,
      event,
      req.status,
      [...req.headers.entries()],
      await req.text(),
    );

    // If the response was 401 (Unauthorized), 404 (Not found) or 410 (Gone),
    // it likely means that the subscription no longer exists.
    if ([401, 404, 410].includes(req.status)) {
      console.warn(
        new Date().toISOString(),
        "Removing subscription",
        subscription.id,
      );
      deleteClient(subscription.id);
    }
  } else {
    console.log(
      new Date().toISOString(),
      "Sent event",
      subscription.id,
      event,
      req.status,
    );
  }
};

const newSimulatedEvents = async (id) => {
  const subcription = clients.get(id)
  postEvent(subcription, {
    title: "initialSetup",
    body: "SUCCESS - SUBSCRIPTION SET UP",
  }).catch(
    (e) => {
      console.error(
        new Date().toISOString(),
        `Error sending message to ${id}`,
        "initial",
        e,
      );
    },
  );

  let seq = 0;
  let interval = setInterval(() => {
    if (!clients.has(id)) {
      clearInterval(interval);
      return;
    }
    seq++;
    postEvent(subcription, {
      title: `Notification ${seq}`,
      body: `Value: ${seq}`,
    }).catch((e) => {
      console.error(
        new Date().toISOString(),
        `Error sending message to ${id}`,
        seq,
        e,
      );
    });
  }, 5000);
};

export const deleteClient = (id) => {
  clients.delete(id);
};

export const addClient = async (subscription) => {
  const subcriptionId = await clientId(subscription);

  if (clients.has(subcriptionId)) {
    return;
  }

  subscription = subscriptionInfoWrapper(subcriptionId, subscription);
  clients.set(subcriptionId, subscription);
  
  newSimulatedEvents(subcriptionId);
};
