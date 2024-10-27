# Web Push Demo

This repository is a basic Node.js app showing the different parts needed to
implement web push notifications.

The app consists of three components:

1. The server (everything under `src`), which is responsible for serving the
   app assets as well as sending synthetic push notificatoins.
2. The main script (`static/main.js`), which runs in the browsing context and
   is responsible for managing the user interface and starting up the service
   worker.
3. The service worker (`static/service-worker.js`), which runs as a service
   worker, and is mainly responsible for receiving push notifications sent
   by the server.

## Setting things up

1. You'll need to generate VAPID keys. See the `config/vapid.json.example` for
   reference. These keys need to be at `config/vapid.json`. The script at
   `scripts/keygenHelper.mjs` should provide suitable values.
2. Run the script at `src/index.mjs` directly or using `npm run start`. The app
   will start by default at port `5000`, which can be changed by setting the
   `PORT` environment variable.
