"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function Providers({ children }: { children: ReactNode }) {
  // One client per browser session; created lazily so it isn't shared across
  // server requests during SSR.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: true },
        },
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
