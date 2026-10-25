import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
} from '@azure/msal-browser';
import { api, unwrap } from '@/lib/api/client';
import { env } from '@/lib/env';
import { isSafeInternalPath } from '@/lib/url';

export interface SignInOptions {
  email?: string;
  name?: string;
  signUp?: boolean;
  returnTo?: string;
  /** AUTH_MODE=local: the session issued after the one-time code was verified. */
  session?: { token: string; expiresIn: number; email: string };
}

/** One interface for both login modes, so the rest of the app never branches on it. */
export interface AuthAdapter {
  readonly mode: 'dev' | 'entra' | 'local' | 'demo';
  init(): Promise<void>;
  isSignedIn(): boolean;
  getToken(): Promise<string | null>;
  signIn(options?: SignInOptions): Promise<void>;
  signOut(): Promise<void>;
  displayEmail(): string | null;
}

const RETURN_KEY = 'kr.returnTo';

export function rememberReturnTo(path: string | undefined): void {
  try {
    if (isSafeInternalPath(path)) sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    /* storage unavailable */
  }
}

export function takeReturnTo(): string | null {
  try {
    const value = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return isSafeInternalPath(value) ? value : null;
  } catch {
    return null;
  }
}

// ---- AUTH_MODE=dev ---------------------------------------------------------------------------

const DEV_KEY = 'kr.devToken';

interface DevSession {
  token: string;
  email: string;
  expiresAt: number;
}

export class DevAuthAdapter implements AuthAdapter {
  readonly mode = 'dev' as const;
  private session: DevSession | null = null;

  init(): Promise<void> {
    try {
      const raw = localStorage.getItem(DEV_KEY);
      const parsed = raw ? (JSON.parse(raw) as DevSession) : null;
      this.session = parsed && parsed.expiresAt > Date.now() ? parsed : null;
    } catch {
      this.session = null;
    }
    return Promise.resolve();
  }

  isSignedIn(): boolean {
    return this.session !== null && this.session.expiresAt > Date.now();
  }

  getToken(): Promise<string | null> {
    return Promise.resolve(this.isSignedIn() ? (this.session?.token ?? null) : null);
  }

  displayEmail(): string | null {
    return this.session?.email ?? null;
  }

  async signIn(options?: SignInOptions): Promise<void> {
    const email = options?.email?.trim().toLowerCase();
    if (!email) throw new Error('Enter an email address.');
    const data = await unwrap(
      api.POST('/api/v1/auth/dev/login', { body: { email, name: options?.name ?? '' } }),
    );
    this.session = {
      token: data.access_token,
      email,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    localStorage.setItem(DEV_KEY, JSON.stringify(this.session));
  }

  signOut(): Promise<void> {
    this.session = null;
    localStorage.removeItem(DEV_KEY);
    return Promise.resolve();
  }
}

// ---- AUTH_MODE=local (one-time email codes, decision 0047) ------------------------------------

const LOCAL_KEY = 'kr.session';

/**
 * Holds the session the API issued after a verified one-time code. Kept in sessionStorage: it
 * ends with the browser tab and is never shared with other tabs or windows.
 */
export class LocalAuthAdapter implements AuthAdapter {
  readonly mode = 'local' as const;
  private session: DevSession | null = null;

  init(): Promise<void> {
    try {
      const raw = sessionStorage.getItem(LOCAL_KEY);
      const parsed = raw ? (JSON.parse(raw) as DevSession) : null;
      this.session = parsed && parsed.expiresAt > Date.now() ? parsed : null;
    } catch {
      this.session = null;
    }
    return Promise.resolve();
  }

  isSignedIn(): boolean {
    return this.session !== null && this.session.expiresAt > Date.now();
  }

  getToken(): Promise<string | null> {
    return Promise.resolve(this.isSignedIn() ? (this.session?.token ?? null) : null);
  }

  displayEmail(): string | null {
    return this.session?.email ?? null;
  }

  signIn(options?: SignInOptions): Promise<void> {
    const issued = options?.session;
    if (!issued?.token) return Promise.reject(new Error('Enter the code from your email to sign in.'));
    this.session = { token: issued.token, email: issued.email, expiresAt: Date.now() + issued.expiresIn * 1000 };
    try {
      sessionStorage.setItem(LOCAL_KEY, JSON.stringify(this.session));
    } catch {
      /* storage unavailable: the session lives until the page is closed */
    }
    return Promise.resolve();
  }

  signOut(): Promise<void> {
    this.session = null;
    try {
      sessionStorage.removeItem(LOCAL_KEY);
    } catch {
      /* storage unavailable */
    }
    return Promise.resolve();
  }
}

// ---- AUTH_MODE=entra (Microsoft Entra External ID) --------------------------------------------

export class EntraAuthAdapter implements AuthAdapter {
  readonly mode = 'entra' as const;
  readonly msal: PublicClientApplication;
  private account: AccountInfo | null = null;

  constructor() {
    const host = `${env.entraTenantSubdomain}.ciamlogin.com`;
    this.msal = new PublicClientApplication({
      auth: {
        clientId: env.entraClientId,
        authority: `https://${host}/`,
        knownAuthorities: [host],
        redirectUri: window.location.origin,
        postLogoutRedirectUri: window.location.origin,
      },
      cache: { cacheLocation: 'sessionStorage' },
    });
  }

  async init(): Promise<void> {
    await this.msal.initialize();
    const result = await this.msal.handleRedirectPromise();
    this.account = result?.account ?? this.msal.getAllAccounts()[0] ?? null;
    if (this.account) this.msal.setActiveAccount(this.account);
  }

  isSignedIn(): boolean {
    return this.account !== null;
  }

  displayEmail(): string | null {
    return this.account?.username ?? null;
  }

  async getToken(): Promise<string | null> {
    if (!this.account) return null;
    const request = { scopes: [env.entraApiScope], account: this.account };
    try {
      const result = await this.msal.acquireTokenSilent(request);
      return result.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        await this.msal.acquireTokenRedirect(request);
      }
      return null;
    }
  }

  async signIn(options?: SignInOptions): Promise<void> {
    rememberReturnTo(options?.returnTo);
    await this.msal.loginRedirect({
      scopes: [env.entraApiScope],
      ...(options?.signUp ? { prompt: 'create' } : {}),
      ...(options?.email ? { loginHint: options.email } : {}),
    });
  }

  async signOut(): Promise<void> {
    const account = this.account;
    this.account = null;
    await this.msal.logoutRedirect(account ? { account } : undefined);
  }
}

// ---- public "View live demo" (read-only, decision 0040) ---------------------------------------

const DEMO_KEY = 'kr.demoSession';

interface DemoSession {
  token: string;
  expiresAt: number;
}

function readDemoSession(): DemoSession | null {
  try {
    const raw = sessionStorage.getItem(DEMO_KEY);
    const parsed = raw ? (JSON.parse(raw) as DemoSession) : null;
    return parsed && parsed.expiresAt > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

export function isDemoSession(): boolean {
  return readDemoSession() !== null;
}

/** Ask the API for a demo session, then reload into the app with the demo adapter. */
export async function startDemo(): Promise<void> {
  const data = await unwrap(api.POST('/api/v1/public/demo/session'));
  sessionStorage.setItem(DEMO_KEY, JSON.stringify({ token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }));
  window.location.assign('/app');
}

export class DemoAuthAdapter implements AuthAdapter {
  readonly mode = 'demo' as const;
  private session: DemoSession | null = null;

  init(): Promise<void> {
    this.session = readDemoSession();
    return Promise.resolve();
  }

  isSignedIn(): boolean {
    return this.session !== null && this.session.expiresAt > Date.now();
  }

  getToken(): Promise<string | null> {
    return Promise.resolve(this.isSignedIn() ? (this.session?.token ?? null) : null);
  }

  displayEmail(): string | null {
    return 'Demo visitor';
  }

  signIn(): Promise<void> {
    return this.signOut();
  }

  signOut(): Promise<void> {
    this.session = null;
    sessionStorage.removeItem(DEMO_KEY);
    window.location.assign('/');
    return Promise.resolve();
  }
}

export function createAuthAdapter(): AuthAdapter {
  if (isDemoSession()) return new DemoAuthAdapter();
  if (env.authMode === 'entra') return new EntraAuthAdapter();
  return env.authMode === 'local' ? new LocalAuthAdapter() : new DevAuthAdapter();
}
