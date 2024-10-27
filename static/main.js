~function () {
  "use strict";

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
    if (!navigator.serviceWorker) {
      throw new Error("Service worker not supported");
    }
    var registration = await navigator.serviceWorker.register(
      "/service-worker.js",
      { scope: "/" },
    );
    await registration.update();
  }

  function showError(name) {
    var popover = typeof HTMLElement.prototype.showPopover === "function";
    var error$ = document.createElement(popover ? "main" : "dialog");
    if (popover) {
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
    if (popover) {
      error$.showPopover();
    } else {
      error$.showModal();
    }
    throw new Error(name + " is not available");
  }

  function notifySwOfPermissionChange() {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: "notifications-ready",
      });
    }
  }

  var requestNotificationPermissions = function (requested) {
    var permission = Notification.permission;
    switch (permission) {
      case "default":
        if (!requested) {
          // Prevent double requests
          Notification.requestPermission().then(function () {
            setTimeout(function () {
              requestNotificationPermissions(true);
            }, 0);
          });
        }
        break;
      case "denied":
        alert("Error: Notifications permissions is denied");
        break;
      case "granted":
        console.info("Notifications permissions granted, notifying SW");
        notifySwOfPermissionChange();
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
        requestNotificationPermissions();
      },
      false,
    );
    button$.appendChild(document.createTextNode("Enable notifications"));
    document.body.appendChild(button$);
    var enableNotificationsButtonState = function () {
      var firstRun = true;
      var handler = function (state) {
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
            firstRun = false;
            notifySwOfPermissionChange();
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
            handler();
          },
        ).catch(function (e) {
          console.error("Error querying notifications permission", e);
        });
      } else {
        setInterval(function () {
          handler(Notification.permission);
        }, 100);
      }
    };

    var textarea$ = document.createElement("textarea");
    textarea$.setAttribute("placeholder", "Nothing here yet\u2026");
    textarea$.setAttribute("readonly", "readonly");
    textarea$.style.setProperty("box-sizing", "border-box", "important");
    textarea$.style.setProperty("height", "12em", "important");
    textarea$.style.setProperty("margin", "0", "important");
    textarea$.style.setProperty("padding", "0.5em", "important");
    textarea$.style.setProperty("width", "100%", "important");
    navigator.serviceWorker.addEventListener("message", function (event) {
      if (!event.isTrusted || !event.data) {
        return;
      }
      if (event.data.type === "notification") {
        textarea$.value = [
          "[" + new Date().toISOString() + "] " +
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
