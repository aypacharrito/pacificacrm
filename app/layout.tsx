import {LanguageProvider} from "./components/LanguageProvider";
import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { isClerkConfigured } from "./lib/clerk-config";
import { appearanceBootstrap } from "./lib/workspace-appearance";
import AutocorrectDefaults from "./components/AutocorrectDefaults";
import "./typography.css";
import "./globals.css";
import "./professional-polish.css";
import "./professional-v2.css";
import "./product-system.css";
import "./workspace-layout.css";
import "./video-finish.css";
import "./pacifica-minimal.css";
import "./assistant.css";
import "./viewport-quote.css";
import "./message-attachments.css";
import "./frontier-theme.css";
import "./scrollbars.css";
import "./refined-workspace.css";
import "./responsive-workspace.css";
import "./v47-experience.css";
import "./v48-experience.css";
import "./v49-experience.css";
import "./v50-experience.css";
import "./polished-workspace.css";
import "./luxury-workspace.css";
import "./daily-workspace.css";
import "./phone-workspace.css";
import "./floating-workspace.css";
import "./palette-workspace.css";
import "./branding.css";

export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover",interactiveWidget:"resizes-content",themeColor:[{media:"(prefers-color-scheme: dark)",color:"#0b0e0d"},{media:"(prefers-color-scheme: light)",color:"#f3f1eb"}]};

export const metadata: Metadata = {
  title: "Pacifica CRM | Every Lead Worked",
  description: "A focused lead CRM with browser calling, messaging, AI-assisted follow-up, pipelines, and live reporting.",
  icons: {
    icon: [
      { url: "/favicon-32.png?v=5", sizes: "32x32", type: "image/png" },
      { url: "/pacifica-icon-192.png?v=5", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico?v=5",
    apple: "/apple-touch-icon.png?v=5",
  },
  openGraph: {
    title: "Pacifica CRM | Every Lead Worked",
    description: "Import leads, call and text through Twilio, and manage every follow-up from one focused workspace.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Pacifica CRM | Every Lead Worked",
    description: "Import leads, call and text through Twilio, and manage every follow-up from one focused workspace.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const clerkEnabled = isClerkConfigured();
  return (
    <html lang="en" data-theme="dark" data-display-size="large" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{__html: appearanceBootstrap}}/>
      </head>
      <body><LanguageProvider><AutocorrectDefaults/>{clerkEnabled?<ClerkProvider dynamic>{children}</ClerkProvider>:children}</LanguageProvider></body>
    </html>
  );
}
