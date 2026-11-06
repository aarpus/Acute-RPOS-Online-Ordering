import { BrandingError } from './branding-validation';
export const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
export function validateImage(bytes: Uint8Array, declared: string) {
  if (!bytes.length || bytes.length > MAX_IMAGE_SIZE) throw new BrandingError('Images must be at most 2MB.');
  const signature = Array.from(bytes.slice(0, 12));
  const png = [137,80,78,71,13,10,26,10].every((b, i) => signature[i] === b);
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
  const mime = png ? 'image/png' : jpg ? 'image/jpeg' : webp ? 'image/webp' : '';
  if (!mime || declared !== mime) throw new BrandingError('Only PNG, JPEG and WebP images are allowed.');
  return { mime, extension: png ? 'png' : jpg ? 'jpg' : 'webp' };
}
