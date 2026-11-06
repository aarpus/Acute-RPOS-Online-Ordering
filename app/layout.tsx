import type { Metadata } from 'next';
import './globals.css';
import StoreProvider from '../components/StoreProvider';

export const metadata: Metadata = {
  title: 'Spice Table | Online Ordering',
  description: 'Fresh Indian flavours. Order your favourite dishes for delivery or pickup.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth motion-reduce:scroll-auto">
      <body className="m-0 bg-white font-sans text-gray-950 [&_button]:cursor-pointer [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-4 [&_button:focus-visible]:outline-red-700 [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-red-700 [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-red-700">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
