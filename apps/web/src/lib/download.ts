import { ApiError, getAccessToken } from '@/lib/api/client';
import { env } from '@/lib/env';
import { viewAsHeaders } from '@/lib/view-as';

/** Authenticated GET that saves the response as a file (CSV, XLSX, ZIP exports). */
export async function downloadFile(
  path: string,
  params: Record<string, string | string[] | undefined>,
  fallbackName: string,
): Promise<void> {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((item) => search.append(k, item));
    else if (v) search.set(k, v);
  }
  const token = await getAccessToken();
  const qs = search.toString();
  const response = await fetch(`${env.apiBaseUrl}${path}${qs ? `?${qs}` : ''}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...viewAsHeaders() },
  });
  if (!response.ok) {
    let message = 'The download failed.';
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      /* not JSON */
    }
    throw new ApiError(response.status, 'download_failed', message);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
