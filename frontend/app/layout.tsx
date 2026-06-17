import type { Metadata } from "next";
import "./globals.css";
import { PostHogProvider } from "@/providers/PostHogProvider";

export const metadata: Metadata = {
  title: "TeamLens",
  description: "Visibility, control, and agent deployment for modern teams.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        <PostHogProvider>
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
