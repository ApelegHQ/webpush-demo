~function () {
  "use strict";

  var consoleEvents = new EventTarget();
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
        consoleEvents.dispatchEvent(
          new CustomEvent("console", { detail: { level, args } }),
        );
      };
    });
  }();

  function onLoad(handler) {
    if (["interactive", "complete"].indexOf(document.readyState) !== -1) {
      setTimeout(handler, 0);
    } else if (document.addEventListener) {
      var listener = function () {
        document.removeEventListener("DOMContentLoaded", listener, false);
        handler();
      };
      document.addEventListener("DOMContentLoaded", listener, false);
    } else {
      throw new Error("Unsupported browser");
    }
  }

  async function setupServiceWorker() {
    if (
      typeof ServiceWorkerRegistration !== "function" ||
      !navigator.serviceWorker
    ) {
      throw new Error("Service worker not supported");
    }
    if (typeof PushManager !== "function") {
      throw new Error("PushManager not available");
    }
    if (
      typeof ServiceWorkerRegistration.prototype.showNotification !== "function"
    ) {
      throw new Error("Showing notifications from a SW is not available");
    }

    var registration = await navigator.serviceWorker.register(
      "/service-worker.js",
      { scope: "/" },
    );
    await registration.update();
  }

  function showError(name) {
    var supportsPopover = typeof HTMLElement.prototype.showPopover === "function";
    var supportsDialog = typeof HTMLDialogElement === "function";
    var errorElementTag = supportsPopover || !supportsDialog ? "aside" : "dialog";
    var error$ = document.createElement(errorElementTag);
    if (supportsPopover) {
      error$.setAttribute("popover", "manual");
    }
    var heading$ = document.createElement("h2");
    heading$.appendChild(document.createTextNode("Error"));
    error$.appendChild(heading$);
    var name$ = document.createElement("code");
    name$.appendChild(document.createTextNode(name));
    error$.appendChild(name$);
    error$.appendChild(document.createTextNode(" is not available"));
    document.body.appendChild(error$);
    if (supportsPopover) {
      error$.showPopover();
    } else if (supportsDialog) {
      error$.showModal();
    }
    throw new Error(name + " is not available");
  }

  function notifySw(type) {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type,
      });
    }
  }

  var requestNotificationPermissions = function (permission, requested) {
    switch (permission) {
      case "default":
        if (!requested) {
          // Prevent double requests
          Notification.requestPermission().then(function (permission) {
            requestNotificationPermissions(permission, true);
          });
        }
        break;
      case "denied":
        alert("Error: Notifications permissions is denied");
        break;
      case "granted":
        console.info("Notifications permissions granted, notifying SW");
        createPushSubscription();
        break;
    }
  };

  onLoad(function () {
    if (typeof Notification !== "function") {
      showError("Notification");
    }

    if (typeof navigator.serviceWorker !== "object") {
      showError("ServiceWorker");
    }

    var button$ = document.createElement("button");
    button$.setAttribute("type", "button");
    button$.setAttribute("disabled", "disabled");
    button$.addEventListener(
      "click",
      function (event) {
        event.preventDefault();
        requestNotificationPermissions(Notification.permission);
      },
      false,
    );
    button$.appendChild(document.createTextNode("Enable notifications"));
    document.body.appendChild(button$);
    var enableNotificationsButtonState = function () {
      var handler = function (state, firstRun) {
        var hasDisabled = button$.hasAttribute("disabled");
        if (state !== "granted") {
          if (hasDisabled) {
            button$.removeAttribute("disabled");
          }
        } else {
          if (!hasDisabled) {
            button$.setAttribute("disabled", "disabled");
          }
          if (!hasDisabled || firstRun) {
            createPushSubscription();
          }
        }
      };

      if (
        typeof navigator.permissions === "object" &&
        navigator.permissions.query === "function"
      ) {
        navigator.permissions.query({ name: "notifications" }).then(
          function (result) {
            result.addEventListener("change", function () {
              handler(result.state);
            }, false);
            handler(result.state, true);
          },
        ).catch(function (e) {
          console.error("Error querying notifications permission", e);
        });
      } else {
        handler(Notification.permission, true);
        setInterval(function () {
          handler(Notification.permission);
        }, 100);
      }
    };

    var createPushSubscription = (function () {
      var actionInProgress;

      return function () {
        if (!actionInProgress) {
          actionInProgress = navigator.serviceWorker.ready.then(
            function (registration) {
              return registration.pushManager.getSubscription()
                .then(function (subscription) {
                  if (
                    !subscription ||
                    (subscription.expirationTime != null &&
                      subscription.expirationTime <= Date.now())
                  ) {
                    console.info("Attempting to create a new subscription", subscription);
                    return getPushOptions().then(function (options) {
                      return registration.pushManager.subscribe(options);
                    });
                  }
                  console.info("Using existing subscription", subscription);
                  return subscription;
                });
            },
          );
          actionInProgress.then(function (subcription) {
            if (!subcription) {
              return;
            }
            notifySw("notifications-ready");
          });
          actionInProgress.finally(function () {
            actionInProgress = undefined;
          });
        }
        return actionInProgress;
      };
    })();

    async function getPushOptions() {
      var publicKeyRequest = await fetch("/vapid-public-key");
      if (!publicKeyRequest.ok) {
        throw new Error("Error obtaining VAPID public key");
      }
      var publicKey = await publicKeyRequest.arrayBuffer();

      var options = {
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      };

      return options;
    }

    var textarea$ = document.createElement("textarea");
    textarea$.setAttribute("placeholder", "Nothing here yet\u2026");
    textarea$.setAttribute("readonly", "readonly");
    textarea$.style.setProperty("box-sizing", "border-box", "important");
    textarea$.style.setProperty("height", "12em", "important");
    textarea$.style.setProperty("margin", "0", "important");
    textarea$.style.setProperty("padding", "0.5em", "important");
    textarea$.style.setProperty("width", "100%", "important");
    consoleEvents.addEventListener("console", function (event) {
      textarea$.value = [
        "[" + new Date().toISOString() + "] BR LOG(" +
        event.detail.level.padStart(5, " ") + ") " +
        event.detail.args.map(function (arg) {
          return JSON.stringify(arg);
        }).join(" "),
        textarea$.value,
      ].join("\r\n");
    }, false);
    navigator.serviceWorker.addEventListener("message", function (event) {
      if (!event.isTrusted || !event.data) {
        return;
      }

      if (event.data.type === "console") {
        textarea$.value = [
          "[" + new Date().toISOString() + "] SW LOG(" +
          event.data.level.padStart(5, " ") + ") " +
          event.data.args.map(function (arg) {
            return JSON.stringify(arg);
          }).join(" "),
          textarea$.value,
        ].join("\r\n");
      } else if (event.data.type === "push-notification") {
        textarea$.value = [
          "[" + new Date().toISOString() + "] NOTIFICATION " +
          JSON.stringify(event.data.value),
          textarea$.value,
        ].join("\r\n");
      } else if (event.data.type === "error") {
        console.error(
          "Received error from ServiceWorker",
          event.data.subtype,
          event.data.error,
        );
        alert(
          "ServiceWorker error (" + event.data.subtype + "): " +
            String(
              (event.data.error && event.data.error.message) ||
                event.data.error,
            ),
        );
      }
    });

    setupServiceWorker().then(function () {
      enableNotificationsButtonState();

      var details$ = document.createElement("details");
      details$.setAttribute("open", "open");
      details$.style.setProperty("padding", "0.5em", "important");

      var summary$ = document.createElement("summary");
      summary$.appendChild(document.createTextNode("Subcription logs"));

      details$.appendChild(summary$);
      details$.appendChild(textarea$);
      document.body.appendChild(details$);
    }, function (e) {
      var message = String((e && e.message) || e);
      console.error("Error setting up ServiceWorker", e);
      alert("Error setting up ServiceWorker: " + message);
    });
  });
}();
