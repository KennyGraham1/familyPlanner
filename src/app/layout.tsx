import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kinfolk — Family planner",
  description:
    "A shared family planner for calendars, meal plans, shopping lists and chores.",
  applicationName: "Kinfolk",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icons/icon-192.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the phone tab bar sit clear of the iPhone home indicator.
  viewportFit: "cover",
  themeColor: "#8b70bc",
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
