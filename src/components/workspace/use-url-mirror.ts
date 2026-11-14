"use client";

import { usePathname } from "next/navigation";
import { useCallback } from "react";

/**
 * Writes view state (filters, period) into the address bar without a server
 * round trip, so a reload or a shared link restores the same view.
 */
export function useUrlMirror() {
  const pathname = usePathname();
  return useCallback(
    (params: URLSearchParams) => {
      const query = params.toString();
      window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
    },
    [pathname],
  );
}
