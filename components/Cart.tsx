import { useEffect, useRef } from 'react';
import type { Product } from '../data/home';

export type CartItem = { product: Product; quantity: number };

type Props = {
  items: CartItem[];
  mode: string;
  formatPrice: (price: number) => string;
  onChangeQuantity: (id: string, change: number) => void;
  onClose: () => void;
};

export default function Cart({ items, mode, formatPrice, onChangeQuantity, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const subtotal = items.reduce((total, item) => total + item.product.price * item.quantity, 0);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      aria-labelledby="cart-title"
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl bg-white p-6 text-gray-900 shadow-xl backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between">
        <h2 id="cart-title" className="font-serif text-2xl font-bold">Your Cart</h2>
        <button onClick={onClose} aria-label="Close cart" className="rounded border border-gray-200 px-3 py-1">✕</button>
      </div>
      <p className="mt-2 text-sm text-gray-500">{mode}</p>

      {items.length === 0 ? (
        <p className="py-10 text-center text-gray-500">Your cart is empty. Add a dish from the menu.</p>
      ) : (
        <>
          {items.map(({ product, quantity }) => (
            <div key={product.id} className="flex gap-3 border-b border-gray-200 py-4">
              <img src={product.image} alt="" className="h-16 w-20 rounded object-cover" />
              <div className="flex-1">
                <h3 className="font-semibold">{product.name}</h3>
                <p className="text-red-700">{formatPrice(product.price * quantity)}</p>
                <div className="mt-2 flex items-center gap-4">
                  <button aria-label={`Remove one ${product.name}`} onClick={() => onChangeQuantity(product.id, -1)} className="rounded bg-gray-100 px-3 py-1">−</button>
                  <span>{quantity}</span>
                  <button aria-label={`Add one ${product.name}`} onClick={() => onChangeQuantity(product.id, 1)} className="rounded bg-gray-100 px-3 py-1">+</button>
                </div>
              </div>
            </div>
          ))}
          <p className="mt-5 flex justify-between font-bold"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></p>
          <p className="mt-3 text-xs text-gray-500">Taxes and delivery fees are calculated at checkout.</p>
        </>
      )}
      <p className="mt-4 rounded bg-orange-50 p-3 text-sm text-gray-600">Home page demo. Checkout will be added with the next screen.</p>
    </dialog>
  );
}
