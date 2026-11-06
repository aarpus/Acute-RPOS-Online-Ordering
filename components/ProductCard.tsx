import type { Product } from '../data/home';

type Props = {
  product: Product;
  formatPrice: (price: number) => string;
  onAdd: (product: Product) => void;
};

export default function ProductCard({ product, formatPrice, onAdd }: Props) {
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
      <img src={product.image} alt={product.name} className="h-32 w-full object-cover sm:h-36" />
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <h3 className="font-serif text-lg font-bold sm:text-xl">{product.name}</h3>
        <p className="mt-1 mb-4 text-sm leading-5 text-gray-600">{product.description}</p>
        <div className="mt-auto flex items-center justify-between gap-2">
          <strong className="font-serif text-lg text-red-700">{formatPrice(product.price)}</strong>
          <button
            onClick={() => onAdd(product)}
            aria-label={`Add ${product.name} to cart`}
            className="rounded-md bg-red-700 px-3 py-2 font-semibold text-white hover:bg-red-800"
          >
            Add +
          </button>
        </div>
      </div>
    </article>
  );
}
