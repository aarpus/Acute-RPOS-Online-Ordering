// Required upload dimensions, shared by the admin hint and validation.
export const menuItemImage = {
  width: 416,
  height: 384,
  maxBytes: 2 * 1024 * 1024,
  types: ['image/jpeg', 'image/png', 'image/webp'],
  sizeLabel: 'Required image size: 416 × 384 px',
  fileLabel: 'PNG, JPG or WebP · Maximum file size: 2 MB',
};

export function validateMenuItemImage(file: { type: string; size: number }, dimensions?: { width: number; height: number }): string | null {
  if (!menuItemImage.types.includes(file.type)) return 'Invalid image format. Use PNG, JPG or WebP.';
  if (!file.size) return 'This image is empty. Choose another file.';
  if (file.size > menuItemImage.maxBytes) return 'Image exceeds 2 MB. Choose a smaller file.';
  if (dimensions && (dimensions.width !== menuItemImage.width || dimensions.height !== menuItemImage.height)) {
    return `Image must be exactly ${menuItemImage.width} x ${menuItemImage.height} px. Selected image: ${dimensions.width} x ${dimensions.height} px.`;
  }
  return null;
}

export function readMenuItemImage(file: File, requireItemDimensions = true): Promise<string> {
  const error = validateMenuItemImage(file);
  if (error) return Promise.reject(new Error(error));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('This image could not be read. Choose another file.'));
    reader.onload = () => {
      const source = String(reader.result);
      const image = new Image();
      image.onerror = () => reject(new Error('This image is damaged or invalid. Choose another file.'));
      image.onload = () => {
        const error = validateMenuItemImage(file, requireItemDimensions ? { width: image.naturalWidth, height: image.naturalHeight } : undefined);
        if (error) reject(new Error(error));
        else resolve(source);
      };
      image.src = source;
    };
    reader.readAsDataURL(file);
  });
}
