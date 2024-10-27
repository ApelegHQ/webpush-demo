~function () {
  "use strict";

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

  async function setupPushSubscription() {
    try {
      if (!registration) {
        throw new Error("No service-worker registration found!");
      }

      var publicKeyRequest = await fetch("/vapid-public-key");
      if (!publicKeyRequest.ok) {
        throw new Error("Error obtaining VAPID public key");
      }
      var publicKey = await publicKeyRequest.arrayBuffer();

      await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      }).then(
        function (subscription) {
          console.log("SUBCRIPTION ENDPOINT", subscription.endpoint);

          fetch("/new-subscription", {
            method: "POST",
            headers: [["content-type", "application/json"]],
            body: JSON.stringify(subscription),
          }).catch(function (e) {
            console.error("Error sending subscription endpoint to server", e);
            messageAllClients({
              type: "error",
              subtype: "subscription-submission",
              error: e,
            });
          });
        },
      );
    } catch (e) {
      console.error("Error creating subscription", e);
      messageAllClients({
        type: "error",
        subtype: "subscription",
        error: e,
      });
      throw e;
    }
  }

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
      event.data.type === "notifications-ready" &&
      Notification.permission === "granted"
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
      type: "notification",
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
