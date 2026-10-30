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
