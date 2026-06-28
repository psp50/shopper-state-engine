import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shopper State Engine",
  description: "Decay-weighted personalization rules engine with an LLM reasoning layer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif" }}>{children}</body>
    </html>
  );
}
