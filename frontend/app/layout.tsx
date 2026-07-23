import type { Metadata } from "next";
import "./styles/colors.css";
import "./styles/base.css";
import "./styles/nerd_icons.css";
import "./styles/header.css";
import "./styles/header_dropdown.css";
import { Header } from "@/components/Header";
import { ToastHost } from "@/components/ToastHost";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "AniListShare",
  description:
    "Track, share, and manage your anime watching list with AniListShare. Organize by categories, track seasons, and share with friends.",
  icons: { icon: "/logo.webp" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/NerdFontsSubset.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link rel="preconnect" href="https://api.jikan.moe" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.myanimelist.net" />
      </head>
      <body>
        <Providers>
          <Header />
          {children}
          <ToastHost />
        </Providers>
      </body>
    </html>
  );
}
