// @ts-check
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
  site: "https://Yoooooou-web.github.io",

  devToolbar: {
    enabled: false,
  },

  i18n: {
    locales: ["ja", "en", "zh"],
    defaultLocale: "ja",

    routing: {
      prefixDefaultLocale: false,
    },
  },
});