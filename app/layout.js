import "./globals.css";

export const metadata = {
  title: "Labely & Valcoin – Product Screenshots",
  description: "Upload a product photo and download a Labely or Valcoin app screenshot.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f6f4ef] text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
