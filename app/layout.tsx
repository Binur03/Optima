import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import { BottomNav } from "@/components/BottomNav";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "MacroDelta",
  description: "Adaptive calorie tracking with a rolling Fitbit maintenance baseline.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MacroDelta", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f14",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="app-frame">
            <div className="app-content">{children}</div>
            <BottomNav />
          </div>
          <ServiceWorkerRegister />
        </Providers>
      </body>
    </html>
  );
}
