"use client";

import { useEffect } from "react";

export function ChunkErrorHandler() {
  useEffect(() => {
    // Catch unhandled ChunkLoadError and stale script errors globally
    const handleError = (event: ErrorEvent) => {
      const errorMsg = event.message || event.error?.message || "";
      const isChunkError =
        event.error?.name === "ChunkLoadError" ||
        errorMsg.includes("Loading chunk") ||
        errorMsg.includes("ChunkLoadError") ||
        errorMsg.includes("Refused to execute script") ||
        errorMsg.includes("Minified React error #423");

      if (isChunkError) {
        const lastReload = sessionStorage.getItem("cbt_chunk_auto_reload_ts");
        const now = Date.now();
        // Prevent infinite reload loops (at most once every 10 seconds)
        if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
          sessionStorage.setItem("cbt_chunk_auto_reload_ts", String(now));
          window.location.reload();
        }
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reasonMsg = event.reason?.message || String(event.reason || "");
      const isChunkError =
        event.reason?.name === "ChunkLoadError" ||
        reasonMsg.includes("Loading chunk") ||
        reasonMsg.includes("ChunkLoadError") ||
        reasonMsg.includes("Refused to execute script");

      if (isChunkError) {
        const lastReload = sessionStorage.getItem("cbt_chunk_auto_reload_ts");
        const now = Date.now();
        if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
          sessionStorage.setItem("cbt_chunk_auto_reload_ts", String(now));
          window.location.reload();
        }
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
