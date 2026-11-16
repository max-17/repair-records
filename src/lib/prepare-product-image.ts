import { MAX_IMAGE_BYTES } from './upload-limits';

const MAX_EDGE = 2000;
const uploadFormats = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export class ImagePreparationError extends Error {}

type DecodedImage = { source: CanvasImageSource; width: number; height: number; close: () => void };
async function decode(file: File): Promise<DecodedImage> {
 if (typeof createImageBitmap === 'function') {
  try {
   const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
   return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch { /* Some browsers decode camera formats through HTMLImageElement instead. */ }
 }
 const url = URL.createObjectURL(file);
 const image = new Image();
 try {
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Image decode failed')); image.src = url; });
  return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => { image.src = ''; URL.revokeObjectURL(url); } };
 } catch {
  URL.revokeObjectURL(url);
  throw new ImagePreparationError('Rasm ochilmadi. JPG, PNG yoki WebP formatidan foydalaning.');
 }
}

export async function prepareProductImage(file: File): Promise<File> {
 if (!file.type.startsWith('image/')) throw new ImagePreparationError('Faqat rasm fayllarini tanlang.');
 // Keep GIF animation rather than silently replacing it with one still frame.
 if (file.type === 'image/gif') {
  if (file.size > MAX_IMAGE_BYTES) throw new ImagePreparationError('GIF 5 MB dan oshmasligi kerak. Kichikroq GIF yoki JPG rasm tanlang.');
  return file;
 }
 const image = await decode(file);
 let canvas: HTMLCanvasElement | undefined;
 try {
  if (!image.width || !image.height) throw new ImagePreparationError('Rasm o‘lchami aniqlanmadi. Boshqa rasm tanlang.');
  if (file.size <= MAX_IMAGE_BYTES && Math.max(image.width, image.height) <= MAX_EDGE && uploadFormats.has(file.type)) return file;
  canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new ImagePreparationError('Rasm tayyorlanmadi. Boshqa rasm tanlang yoki qayta urinib ko‘ring.');
  const mime = file.type === 'image/png' || file.type === 'image/svg+xml' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  let edge = Math.min(MAX_EDGE, Math.max(image.width, image.height));
  for (let attempt = 0; attempt < 6; attempt++) {
   const scale = Math.min(1, edge / Math.max(image.width, image.height));
   canvas.width = Math.max(1, Math.round(image.width * scale));
   canvas.height = Math.max(1, Math.round(image.height * scale));
   context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
   const blob = await new Promise<Blob | null>(resolve => canvas!.toBlob(resolve, mime, Math.max(0.55, 0.85 - attempt * 0.08)));
   if (blob && blob.size > 0 && blob.size <= MAX_IMAGE_BYTES) {
    const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const name = (file.name.replace(/\.[^.]*$/, '') || 'photo') + '.' + extension;
    return new File([blob], name, { type: blob.type, lastModified: file.lastModified });
   }
   edge = Math.max(1, Math.floor(edge * 0.8));
  }
  throw new ImagePreparationError('Rasmni 5 MB gacha kichraytirib bo‘lmadi. Boshqa rasm tanlang.');
 } catch (error) {
  if (error instanceof ImagePreparationError) throw error;
  throw new ImagePreparationError('Rasm tayyorlanmadi. Boshqa rasm tanlang yoki qayta urinib ko‘ring.');
 } finally {
  image.close();
  if (canvas) { canvas.width = 0; canvas.height = 0; }
 }
}