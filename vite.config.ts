import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "playground",
  plugins: [react()],
  server: { port: 5188, strictPort: true },
  build: { outDir: "../dist/playground", emptyOutDir: true }
});
