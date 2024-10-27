import rfc8291Ikm from "./rfc8291Ikm.mjs";

export default (subscriptionInfo) => {
  subscriptionInfo.endpoint = new URL(subscriptionInfo.endpoint);

  Object.defineProperties(subscriptionInfo, {
    "id": {
        get() {
            // In production, the ID should be derived from more entropy,
            // such as the entire JSON object in some canonical form.
            // It might be also a good idea to move ID generation to a dedicated
            // function, to avoid having to call the wrapper early in the
            // subscription manager.
            return this.endpoint.pathname.slice(-12);
        }
    },
    "encryptionKeys": {
      get: (() => {
        let count = 0;
        let resultPromise;
        let salt;
        let uaPublic;

        return function () {
          // Rotate encryption keys every 2**32 messages
          // This is just a precaution for a birthday attack, which reduces the
          // odds of a collision due to salt reuse to under 10**-18.
          if ((count | 0) === 0) {
            if (!salt) {
              salt = Buffer.from(this.keys.auth, "base64url");
            }
            if (!uaPublic) {
              uaPublic = Buffer.from(this.keys.p256dh, "base64url");
            }

            resultPromise = rfc8291Ikm(uaPublic, salt);
            count = 1;
          } else {
            count++;
          }

          return resultPromise;
        };
      })(),
    },
  });

  Object.freeze(subscriptionInfo);

  return subscriptionInfo;
};
