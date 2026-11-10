// The parts of Google's sign-in script (https://accounts.google.com/gsi/client) that src/auth.ts uses.
// Full reference: https://developers.google.com/identity/gsi/web/reference/js-reference

declare namespace google.accounts.id {
  interface CredentialResponse {
    /** The signed ID token. */
    credential: string;
  }

  interface IdConfiguration {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    nonce?: string;
    hd?: string;
  }

  interface GsiButtonConfiguration {
    theme?: "outline" | "filled_blue" | "filled_black";
    size?: "large" | "medium" | "small";
    text?: "signin_with" | "signup_with" | "continue_with" | "signin";
    shape?: "rectangular" | "pill" | "circle" | "square";
  }

  function initialize(config: IdConfiguration): void;
  function renderButton(parent: HTMLElement, options: GsiButtonConfiguration): void;
}

// Short-lived access to Google APIs (used for Google Calendar, src/googleCalendar.ts).
// Reference: https://developers.google.com/identity/oauth2/web/reference/js-reference
declare namespace google.accounts.oauth2 {
  interface TokenResponse {
    access_token: string;
    /** Seconds until the access runs out. */
    expires_in: number | string;
    scope: string;
    /** Set when the student refused or something went wrong, e.g. "access_denied". */
    error?: string;
  }

  interface ClientConfigError {
    /** "popup_failed_to_open", "popup_closed", or "unknown". */
    type: string;
  }

  interface TokenClientConfig {
    client_id: string;
    scope: string;
    login_hint?: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: ClientConfigError) => void;
  }

  interface TokenClient {
    requestAccessToken(overrides?: { prompt?: "" | "none" | "consent" | "select_account" }): void;
  }

  function initTokenClient(config: TokenClientConfig): TokenClient;
  function hasGrantedAllScopes(response: TokenResponse, firstScope: string, ...restScopes: string[]): boolean;
  function revoke(accessToken: string, done?: () => void): void;
}
