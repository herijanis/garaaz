// Teavitused: server saadab tühja push'i, siin loeme teksti serverist.
const API = "https://garaaz.garaaz-worker.workers.dev";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let msg = { title: "Meie Garaaž", body: "Vaata äppi." };
    try {
      const key = await (await (await caches.open("garaaz-key")).match("/key")).text();
      const r = await fetch(API + "/api/push/msg", { headers: { "X-Key": key } });
      if (r.ok) msg = await r.json();
    } catch (err) {}
    await self.registration.showNotification(msg.title, { body: msg.body, icon: "icon-192.png", badge: "icon-192.png" });
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then(list => list.length ? list[0].focus() : self.clients.openWindow("./")));
});
