/** Fail fast with a clear message when the local stack or the demo data is missing. */
export const API = process.env.E2E_API_URL ?? 'http://localhost:8000';

export default async function globalSetup(): Promise<void> {
  let ready: Response;
  try {
    ready = await fetch(`${API}/api/v1/health/ready`);
  } catch {
    throw new Error(`The API is not reachable at ${API}. Start the stack with .\\scripts\\dev.ps1.`);
  }
  if (!ready.ok) throw new Error(`The API is not ready (${ready.status}). Check the database.`);
  const login = await fetch(`${API}/api/v1/auth/dev/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@contoso.test' }),
  });
  if (!login.ok) throw new Error('Dev login failed: the API must run with AUTH_MODE=dev.');
  const { access_token: token } = (await login.json()) as { access_token: string };
  const me = (await (await fetch(`${API}/api/v1/me`, { headers: { Authorization: `Bearer ${token}` } })).json()) as {
    state?: string;
  };
  if (me.state !== 'active') {
    throw new Error('The demo organization is missing: run `python -m kloudrecon.cli seed-demo`.');
  }
}
