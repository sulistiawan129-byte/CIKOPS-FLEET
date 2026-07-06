import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/lib/providers";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "CIKOPS Fleet Ops",
  description: "Driver Task Management System — CIKOPS Fleet Operations",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.png",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CIKOPS",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#2E5BFF",
};

// Applies the saved theme to <html> BEFORE React hydrates, so there's no
// flash of the wrong theme on load. Reads the same "cikops_theme" key
// AppProviders uses, keeping a single source of truth.
const THEME_INIT_SCRIPT = `
  try {
    var t = localStorage.getItem("cikops_theme");
    if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
  } catch (e) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <AppProviders>
          <AuthProvider>{children}</AuthProvider>
        </AppProviders>
      </body>
    </html>
  );
}
