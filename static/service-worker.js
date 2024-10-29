~function () {
  "use strict";

  ~function () {
    var origConsole = {
      debug: console.debug,
      info: console.info,
      log: console.log,
      warn: console.warn,
      error: console.error,
    };
    ["debug", "info", "log", "warn", "error"].forEach(function (level) {
      if (!origConsole[level]) return;
      console[level] = function (...args) {
        origConsole[level](...args);
        messageAllClients({ type: "console", level, args });
      };
    });
  }();

  function messageAllClients(message) {
    self.clients.matchAll()
      .then(function (clientList) {
        clientList.forEach(function (client) {
          client.postMessage(message);
        });
      }, function () {
        console.error("Error fetching all clients");
      });
  }

  var setupPushSubscription = (function () {
    var registrationInProgress = Promise.resolve();

    var register = async function () {
      try {
        if (!registration) {
          throw new Error("No service-worker registration found!");
        }

        var publicKeyRequest = await fetch("/vapid-public-key");
        if (!publicKeyRequest.ok) {
          throw new Error("Error obtaining VAPID public key");
        }
        var publicKey = await publicKeyRequest.arrayBuffer();

        var options = {
          userVisibleOnly: true,
          applicationServerKey: publicKey,
        };

        if (registration.pushManager.permissionState) {
          const permissionState = await registration.pushManager
            .permissionState(
              options,
            );
          console.debug("Push notifications permission is " + permissionState);
          if (permissionState !== "granted") {
            // Seems to require a full refresh in Safari
            throw new Error("Push pemission not granted");
          }
        } else {
          console.info("permissionState is unavailable");
        }

        // If there's an active subscription, use that one
        var subscription = await registration.pushManager.getSubscription()
          .then(function (subscription) {
            if (!subscription || subscription.expirationTime > Date.now()) {
              console.info("Attempting to create a new subscription");
              return registration.pushManager.subscribe(options);
            }
            console.info("Using existing subscription");
            return subscription;
          });

        console.log("SUBCRIPTION ACTIVE AT ENDPOINT", subscription.endpoint);

        // Notify SW of a new subscription
        fetch("/new-subscription", {
          method: "POST",
          headers: [["content-type", "application/json"]],
          body: JSON.stringify(subscription),
        }).then(function (res) {
          if (res.ok) {
            console.info("Notified server of subscription endpoint and data");
            return;
          }

          console.error("Error notifying server of subscription", res.status);
        }).catch(function (e) {
          console.error("Error sending subscription endpoint to server", e);
          messageAllClients({
            type: "error",
            subtype: "subscription-submission",
            error: e,
          });
        });
      } catch (e) {
        console.error("Error creating subscription", e);
        if (
          Notification.permission === "granted" && e &&
          e.message === "Push pemission not granted"
        ) {
          clients.forEach((client) => client.navigate(client.url));
          return;
        }
        messageAllClients({
          type: "error",
          subtype: "subscription",
          error: e,
        });
        throw e;
      }
    };

    return function () {
      registrationInProgress = registrationInProgress.then(register, register)
        .finally(function () {
          registrationInProgress = Promise.resolve();
        });
      return registrationInProgress;
    };
  })();

  self.addEventListener("install", function (event) {
    event.waitUntil(self.skipWaiting());
  }, false);

  self.addEventListener("activate", function (event) {
    event.waitUntil(self.clients.claim());
  }, false);

  self.addEventListener("message", function (event) {
    console.info("Received message", event.data);
    if (
      event.data &&
      event.data.type === "notifications-ready"
    ) {
      setupPushSubscription();
    }
  }, false);

  self.addEventListener("messageerror", function (event) {
    console.info("Error processing received message", event.data);
  }, false);

  self.addEventListener("pushsubscriptionchange", async function (event) {
    var subscription = await self.registration.pushManger.subscribe(
      event.oldSubscription.options,
    );
  });

  self.addEventListener("push", function (event) {
    var data = event.data.json();

    if (Notification.permission !== "granted") {
      return;
    }

    registration.showNotification(
      data.title,
      {
        body: data.body || "",
        icon: "",
      },
    );

    messageAllClients({
      type: "push-notification",
      value: data,
    });
  }, false);

  if (
    typeof Notification === "function" &&
    typeof navigator === "object" &&
    typeof navigator.permissions === "object" &&
    typeof navigator.permissions.query === "function"
  ) {
    navigator.permissions.query({ name: "notifications" }).then(
      function (result) {
        var handler = function (state) {
          if (state !== "granted") {
            return;
          }
          setupPushSubscription();
        };
        result.addEventListener("change", function () {
          handler(result.state);
        }, false);
        handler(result.state);
      },
    ).catch(function (e) {
      console.error("Error querying notifications permission", e);
    });
  }
}();
