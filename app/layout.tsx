import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PropOps — ระบบเช็คลิสต์งานอสังหาฯ",
  description: "บริหารงานวนซ้ำของพอร์ตอสังหาฯ: มีอะไรต้องทำ / ทำหรือยัง / ทำเมื่อไหร่",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
