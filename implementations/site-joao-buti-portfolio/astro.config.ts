import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: process.env.SITE_URL ?? "https://portfolio.jboot.com.br",
  vite: {
    cacheDir: ".astro/vite",
    plugins: [tailwindcss()],
  },
});
