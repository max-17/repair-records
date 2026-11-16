import type { Product } from './types';

export type StockAction = 'in' | 'out' | 'count';
export type StockMovement = {
  id: string; productId: string; productName: string; type: StockAction | 'opening' | 'sale';
  quantity: number; delta: number; before: number; after: number; note: string; createdAt: string;
};
export type InventoryCode = { code: string; productId: string | null };
export type InventoryData = { products: Product[]; movements: StockMovement[]; codes: InventoryCode[]; restocks?: { productId: string; quantity: number }[] };
export const stockActionLabels = { in: 'Kirim', out: 'Chiqim', count: 'Qoldiqni sanash', opening: 'Boshlang‘ich qoldiq', sale: 'Sotuv' };
export function validInventoryCode(code: unknown): code is string {
  return typeof code === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(code);
}
