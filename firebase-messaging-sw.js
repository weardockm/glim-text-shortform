importScripts("./push-config.js?v=2");

const pushConfig = self.GLIM_PUSH_CONFIG;
const firebaseConfig = pushConfig?.firebase || {};
const isFirebaseConfigured = [
  firebaseConfig.apiKey,
  firebaseConfig.projectId,
  firebaseConfig.messagingSenderId,
  firebaseConfig.appId,
].every((value) => String(value || "").trim());

if (isFirebaseConfigured) {
  importScripts(
    "https://www.gstatic.com/firebasejs/12.15.0/firebase-app-compat.js",
  );
  importScripts(
    "https://www.gstatic.com/firebasejs/12.15.0/firebase-messaging-compat.js",
  );

  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const data = payload?.data || {};
    const category = String(data.category || "general");

    self.registration.showNotification(data.title || "글림", {
      body: data.body || "새로운 소식이 도착했습니다.",
      icon: "./image/app-logo.png",
      badge: "./image/app-logo.png",
      tag: `glim-${category}`,
      data: {
        url: data.url || "./",
      },
    });
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(
    event.notification?.data?.url || "./",
    self.location.origin,
  ).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clientList) => {
        for (const client of clientList) {
          if ("navigate" in client) await client.navigate(targetUrl);
          if ("focus" in client) return client.focus();
        }
        return self.clients.openWindow
          ? self.clients.openWindow(targetUrl)
          : undefined;
      }),
  );
});
