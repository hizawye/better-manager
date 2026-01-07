import crypto from 'crypto';

// Cloud Code OAuth credentials (same as Antigravity-Manager)
const CLOUD_CODE_CLIENT_ID = '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const CLOUD_CODE_CLIENT_SECRET = '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';

// Required OAuth scopes for Cloud Code API access
export const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
];

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface UserInfo {
  email: string;
  name?: string;
  picture?: string;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export class GoogleOAuth {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(config: Partial<GoogleOAuthConfig> = {}) {
    // Always use Cloud Code credentials for cloudcode-pa.googleapis.com compatibility
    this.clientId = config.clientId || CLOUD_CODE_CLIENT_ID;
    this.clientSecret = config.clientSecret || CLOUD_CODE_CLIENT_SECRET;
    this.redirectUri = config.redirectUri || 'http://localhost:8094/oauth/callback';
  }

  /**
   * Generate a random state parameter for CSRF protection
   */
  static generateState(): string {
    return crypto.randomBytes(16).toString('base64url');
  }

  /**
   * Generate the authorization URL
   */
  generateAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code: string): Promise<TokenResponse> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    return response.json();
  }

  /**
   * Refresh an access token
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get user info using an access token
   */
  async getUserInfo(accessToken: string): Promise<UserInfo> {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get user info: ${errorText}`);
    }

    return response.json();
  }

  /**
   * Check if OAuth is configured
   */
  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }
}

// Default instance
export const googleOAuth = new GoogleOAuth();
