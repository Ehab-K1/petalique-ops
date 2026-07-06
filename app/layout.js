import "./globals.css";

export const metadata = {
  title: "Petalique Flora — Studio Operations",
  description: "Inventory, deliveries, customers, and planning for Petalique Flora.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
