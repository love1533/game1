import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "미니게임월드",
  description: "놀면서 배우는 재미있는 미니게임 모음! 영어, 수학, 퀴즈, 리듬게임 등 12가지 🎮",
  keywords: "미니게임,교육게임,영어게임,수학게임,초등교육,어린이게임",
  openGraph: {
    title: "🎮 미니게임월드",
    description: "놀면서 배우는 재미있는 미니게임 12종! 영어, 수학, 퀴즈, 슈팅, 탕후루 등",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full flex flex-col bg-[#f0f4ff]">
        {children}
      </body>
    </html>
  );
}
