import type { Metadata, Viewport } from "next";
import "./globals.css";
import { themeScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Kinfolk — Family planner",
  description:
    "A shared family planner for calendars, meal plans, shopping lists and chores.",
  applicationName: "Kinfolk",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    // iOS needs a solid square icon (it rounds the corners itself; see-through
    // corners turn black on the home screen).
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180" },
  },
  // How the app appears once added to an iPhone or iPad home screen.
  appleWebApp: { capable: true, title: "Kinfolk", statusBarStyle: "default" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the phone tab bar sit clear of the iPhone home indicator.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#28634f" },
    { media: "(prefers-color-scheme: dark)", color: "#101512" },
  ],
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The theme script may set data-theme before React loads.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
