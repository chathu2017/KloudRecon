/** Build-time configuration (Vite). Locally, `/api` is proxied to the API by Vite. */
export const env = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, ''),
  authMode: (['entra', 'local'] as const).find((m) => m === import.meta.env.VITE_AUTH_MODE) ?? ('dev' as const),
  entraClientId: import.meta.env.VITE_ENTRA_SPA_CLIENT_ID ?? '',
  entraTenantSubdomain: import.meta.env.VITE_ENTRA_TENANT_SUBDOMAIN ?? '',
  entraApiScope: import.meta.env.VITE_ENTRA_API_SCOPE ?? 'api://kloudrecon-api/access_as_user',
  appInsightsConnectionString: import.meta.env.VITE_APPINSIGHTS_CONNECTION_STRING ?? '',
} as const;
