import type { HomeData } from '../data/home';
import Link from 'next/link';

export default function StoreLogo({ store }: { store: HomeData['store'] & { logoWidth?: number } }) {
  return (
    <Link href="/" aria-label={store.name} className="block max-w-full shrink" style={{ width: store.logoWidth ?? 56 }}>
      <img src={store.logo} alt={store.name} className="block h-auto w-full max-w-full object-contain object-left" />
    </Link>
  );
}
