// Google's sign-in script (https://accounts.google.com/gsi/client), loaded once per page when needed.
// It draws the sign-in button (src/auth.ts) and hands out Google Calendar access (src/googleCalendar.ts).

export const googleClientId: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID;

let googleScript: Promise<void> | undefined;

export function loadGoogleScript(): Promise<void> {
  googleScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      googleScript = undefined;
      reject(new Error("Couldn't load Google sign-in"));
    };
    document.head.append(script);
  });
  return googleScript;
}
