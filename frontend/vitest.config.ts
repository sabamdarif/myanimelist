import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Next's tsconfig sets jsx:preserve, so the react plugin must transform JSX.
export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom" },
});
