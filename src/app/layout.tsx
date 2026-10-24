import type { Metadata, Viewport } from "next";
import "./globals.css";

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
  themeColor: "#28634f",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
