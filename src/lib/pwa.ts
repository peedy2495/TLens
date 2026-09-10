import { useCallback, useEffect, useRef, useState } from "react";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaState {
  canInstall: boolean;
  installed: boolean;
  offlineReady: boolean;
  updateAvailable: boolean;
  updateDeferred: boolean;
  installError: string;
  swError: string;
  requestInstall: () => Promise<void>;
  applyUpdate: () => Promise<void>;
  deferUpdate: () => void;
}

/** Pure helper for unit tests: standalone detection from injected values. */
export function detectInstalled(
  displayStandalone: boolean,
  navigatorStandalone?: boolean,
): boolean {
  return displayStandalone || navigatorStandalone === true;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  let display = false;
  try {
    display = window.matchMedia("(display-mode: standalone)").matches;
  } catch {
    /* Media query unavailable. */
  }
  let navigatorStandalone: boolean | undefined;
  try {
    navigatorStandalone = (window.navigator as { standalone?: boolean })
      .standalone;
  } catch {
    navigatorStandalone = undefined;
  }
  return detectInstalled(display, navigatorStandalone);
}

export function usePwa(working: boolean): PwaState {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(() =>
    typeof window === "undefined" ? false : isStandalone(),
  );
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDeferred, setUpdateDeferred] = useState(false);
  const [installError, setInstallError] = useState("");
  const [swError, setSwError] = useState("");
  const workingRef = useRef(working);
  workingRef.current = working;
  const updateFn = useRef<((reload?: boolean) => Promise<void>) | null>(null);
  // One-shot install event storage: the ref is consumed synchronously so a
  // double click cannot reuse the native prompt.
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      // Ignore further prompts once installed as an app.
      if (isStandalone()) return;
      event.preventDefault();
      const prompt = event as BeforeInstallPromptEvent;
      deferredRef.current = prompt;
      setDeferredPrompt(prompt);
      setInstallError("");
    };
    const onInstalled = () => {
      deferredRef.current = null;
      setDeferredPrompt(null);
      setInstalled(true);
    };
    const onDisplayChange = () => setInstalled(isStandalone());
    let query: MediaQueryList | null = null;
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    try {
      query = window.matchMedia("(display-mode: standalone)");
      if (typeof query.addEventListener === "function")
        query.addEventListener("change", onDisplayChange);
      else query.addListener(onDisplayChange);
    } catch {
      query = null;
    }
    setInstalled(isStandalone());
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (query) {
        if (typeof query.removeEventListener === "function")
          query.removeEventListener("change", onDisplayChange);
        else query.removeListener(onDisplayChange);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Production service worker only; dev builds have registration disabled.
    // Dynamic import keeps SSR safe (no window during prerender).
    import("virtual:pwa-register")
      .then(({ registerSW }) => {
        if (cancelled) return;
        const update = registerSW({
          immediate: false,
          onOfflineReady() {
            if (!cancelled) setOfflineReady(true);
          },
          onNeedRefresh() {
            if (cancelled) return;
            if (workingRef.current) {
              // Still surface the pending update; the explicit apply path
              // stays guarded while working. No auto reload here.
            }
            setUpdateAvailable(true);
            setUpdateDeferred(false);
          },
          onRegisteredSW(_swUrl: string, registration?: ServiceWorkerRegistration) {
            if (cancelled) return;
            try {
              if (registration?.active?.state === "activated") {
                setOfflineReady(true);
                return;
              }
            } catch {
              /* Registration inspection unavailable. */
            }
            // Initial install still pending: mark ready only once an
            // activated registration exists in this scope.
            try {
              void navigator.serviceWorker?.ready.then((active) => {
                if (cancelled) return;
                try {
                  if (active?.active?.state === "activated")
                    setOfflineReady(true);
                } catch {
                  /* Ignore late activation inspection failures. */
                }
              });
            } catch {
              /* Service workers unavailable. */
            }
          },
          onRegisterError() {
            if (!cancelled) setSwError("registration");
          },
        });
        updateFn.current = update;
      })
      .catch(() => {
        // Missing SW (dev) or unsupported browser must not break the app.
        if (!cancelled && import.meta.env.PROD) setSwError("registration");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const requestInstall = useCallback(async () => {
    const prompt = deferredRef.current ?? deferredPrompt;
    if (!prompt) return;
    // Consume synchronously before await: double activation cannot reuse it.
    deferredRef.current = null;
    setDeferredPrompt(null);
    setInstallError("");
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      setInstallError("install");
    }
    // Accepted, dismissed and rejected paths all end consumed; a future
    // beforeinstallprompt event allows a retry.
  }, [deferredPrompt]);

  const applyUpdate = useCallback(async () => {
    // Guarded while importing, deleting or migrating so the worker/OPFS
    // generation cannot be replaced mid-operation. The caller also disables
    // the button; this check keeps programmatic calls safe.
    if (workingRef.current) return;
    setSwError("");
    try {
      await updateFn.current?.(true);
    } catch {
      setSwError("update");
    }
  }, []);

  const deferUpdate = useCallback(() => setUpdateDeferred(true), []);

  return {
    canInstall: deferredPrompt !== null && !installed,
    installed,
    offlineReady,
    updateAvailable,
    updateDeferred,
    installError,
    swError,
    requestInstall,
    applyUpdate,
    deferUpdate,
  };
}
