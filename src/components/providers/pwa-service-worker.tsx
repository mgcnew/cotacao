"use client";

import { useEffect } from "react";

/**
 * O worker fica fora do bundle do Next para controlar todo o escopo do site.
 * Em desenvolvimento ele não é registrado: cache persistente enquanto se
 * programa costuma mascarar alterações e produzir diagnósticos falsos.
 */
export function PwaServiceWorker() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .catch(() => undefined);
  }, []);

  return null;
}
