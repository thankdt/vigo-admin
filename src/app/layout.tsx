import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: 'Vigo Admin',
  description: 'The admin dashboard for Vigo',
  // PWA "Thêm vào màn hình chính". LƯU Ý: iOS BỎ QUA mảng icon trong manifest —
  // nó chỉ đọc <link rel="apple-touch-icon">, nên thẻ apple bên dưới mới là thứ
  // quyết định icon hiện trên màn hình chính iPhone.
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-256.png', sizes: '256x256', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true, // mở ở chế độ standalone, không còn thanh địa chỉ Safari
    title: 'Vigo Admin', // nhãn dưới icon trên màn hình chính
    statusBarStyle: 'default',
  },
};

// interactiveWidget: 'resizes-content' makes the mobile soft keyboard RESIZE the layout
// viewport instead of overlaying it. Without this, opening the keyboard in the đặt-hộ portal
// webview left the modal centered in the full-height viewport, so its inputs slid behind the
// keyboard and the dark Dialog overlay covered them. Desktop admin is unaffected (no soft keyboard).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
  themeColor: '#3f51b5',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Next 15 phát ra <meta name="mobile-web-app-capable"> (tên chuẩn mới) cho
          appleWebApp.capable. iOS từ 16.4 mở standalone dựa trên "display" trong
          manifest nên vẫn đúng, nhưng iPhone cũ hơn CHỈ hiểu thẻ có tiền tố apple-.
          Thêm tay để máy cũ cũng mở không kèm thanh địa chỉ Safari.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
