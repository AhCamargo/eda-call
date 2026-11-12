import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// A tela do módulo é um ES module único (dist/ui/index.js + index.css) que o
// painel do EdaCall importa em tempo de execução e chama mount(el, ctx).
// O React vai dentro do pacote: o módulo não depende da versão do painel.
export default defineConfig({
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: "dist/ui",
    emptyOutDir: true,
    lib: {
      entry: "ui/main.tsx",
      formats: ["es"],
      fileName: () => "index.js",
      cssFileName: "index",
    },
  },
});
