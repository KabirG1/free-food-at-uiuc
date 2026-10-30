import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const page = (file: string) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig({
  // Relative paths let the same build work locally and under GitHub Pages' /free-food-at-uiuc/ folder.
  base: "./",
  plugins: [tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        today: page("index.html"),
        calendar: page("calendar.html"),
        faq: page("faq.html"),
        contact: page("contact.html"),
      },
    },
  },
});
