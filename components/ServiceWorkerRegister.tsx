"use client";

import { useEffect } from "react";

// Registers the PWA service worker once on the client. Kept out of the server
// layout so it never runs during SSR.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failure is non-fatal */
      });
    }
  }, []);
  return null;
}
