/// <reference types="vite/client" />

declare module 'virtual:report-icons' {
  const icons: Record<string, string>;
  export default icons;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_AUTH_MODE?: string;
  readonly VITE_ENTRA_SPA_CLIENT_ID?: string;
  readonly VITE_ENTRA_TENANT_SUBDOMAIN?: string;
  readonly VITE_ENTRA_API_SCOPE?: string;
  readonly VITE_APPINSIGHTS_CONNECTION_STRING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
