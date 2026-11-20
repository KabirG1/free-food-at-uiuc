import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { EARLY_THEME_SCRIPT } from "./src/theme.ts";

const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

/** Puts the saved light/dark choice in place from every page's <head>, before anything is drawn. */
function earlyTheme(): Plugin {
  return {
    name: "early-theme",
    transformIndexHtml: () => [{ tag: "script", children: EARLY_THEME_SCRIPT, injectTo: "head" }],
  };
}

export default defineConfig({
  // Relative paths let the same build work locally and under GitHub Pages' /free-food-at-uiuc/ folder.
  base: "./",
  plugins: [tailwindcss(), earlyTheme()],
  build: {
    rollupOptions: {
      input: {
        today: page("index.html"),
        calendar: page("calendar.html"),
        faq: page("faq.html"),
        contact: page("contact.html"),
        account: page("account.html"),
        saved: page("saved.html"),
        following: page("following.html"),
        submit: page("submit.html"),
        review: page("review.html"),
        manage: page("manage.html"),
        search: page("search.html"),
        privacy: page("privacy.html"),
      },
    },
  },
});
