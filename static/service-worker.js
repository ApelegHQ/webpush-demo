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
    return self.clients.matchAll()
      .then(function (clientList) {
        clientList.forEach(function (client) {
          client.postMessage(message);
        });
      }, function (e) {
        console.error("Error fetching all clients", e);
      });
  }

  var setupPushSubscription = (function () {
    var registrationInProgress;
    var register = async function () {
      try {
        if (!registration) {
          throw new Error("No service-worker registration found!");
        }

        var subscription = await registration.pushManager.getSubscription()
          .then(function (subscription) {
            if (
              !subscription ||
              (subscription.expirationTime != null &&
                subscription.expirationTime <= Date.now())
            ) {
              throw new Error("Missing subscription");
            }
            console.info("Subscription found");

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

          console.error(
            "Error notifying server of subscription",
            res.status,
            subscription,
          );
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
        messageAllClients({
          type: "error",
          subtype: "subscription",
          error: e,
        });
        throw e;
      }
    };

    return function () {
      if (!registrationInProgress) {
        registrationInProgress = register();
      }

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
      event.waitUntil(setupPushSubscription());
    }
  }, false);

  self.addEventListener("messageerror", function (event) {
    console.info("Error processing received message", event.data);
  }, false);

  self.addEventListener("pushsubscriptionchange", function (event) {
    event.waitUntil(self.registration.pushManger.subscribe(
      event.oldSubscription.options,
    )).then(function () {
      return setupPushSubscription();
    });
  });

  self.addEventListener("push", function (event) {
    try {
      var data = event.data.json();

      event.waitUntil(Promise.all([
        registration.showNotification(
          data.title,
          {
            body: data.body || "",
            icon: "",
          },
        ),
        messageAllClients({
          type: "push-notification",
          value: data,
        }),
      ]));
    } catch (e) {
      console.error("Error processing push event", e);
    }
  }, false);

  // navigator.setAppBadge(5);
}();
