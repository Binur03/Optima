"use client";

import { useEffect } from "react";

// Registers the PWA service worker in production only. In development, dev
// chunks aren't content-hashed, so a caching worker would serve stale code —
// remove any worker left over from an earlier session instead.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* registration failure is non-fatal */
    });
  }, []);
  return null;
}
