import type { CapacitorConfig } from "@capacitor/cli";

const config = {
  appId: "com.glimfactory.glim",
  appName: "글림",
  webDir: "dist",
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#050505",
    },
    StatusBar: {
      backgroundColor: "#050505",
      style: "DARK",
    },
  },
} satisfies CapacitorConfig;

export default config;
