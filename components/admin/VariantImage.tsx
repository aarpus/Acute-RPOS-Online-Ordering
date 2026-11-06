import type { ImgHTMLAttributes } from 'react';

export default function VariantImage({ src, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return <img {...props} src={src || '/images/category-0.jpg'} alt={alt || 'Variant image'} onError={event => {
    if (!event.currentTarget.src.endsWith('/images/category-0.jpg')) event.currentTarget.src = '/images/category-0.jpg';
  }} />;
}
