/// <reference types="astro/client" />
/// <reference types="vite-plugin-pwa/client" />
declare module "virtual:pwa-info" {
  export interface PwaInfo {
    webManifestUrl: string;
    swUrl: string;
    scope: string;
    themeColor?: string;
  }
  export const pwaInfo: PwaInfo | undefined;
}
declare module "virtual:pwa-register" {
  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegisteredSW?: (swUrl: string, registration?: ServiceWorkerRegistration) => void;
    onRegisterError?: (error: unknown) => void;
  }
  export function registerSW(options?: RegisterSWOptions): (reloadPage?: boolean) => Promise<void>;
}
