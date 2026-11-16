import { queueImageCleanup, processImageCleanup } from '@/lib/image-cleanup';
export const runtime = 'nodejs';
export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body.urls) || body.urls.length > 100 || body.urls.some((url: unknown) => typeof url !== 'string' || url.length > 2000)) return Response.json({error:'Noto‘g‘ri rasm ro‘yxati.'},{status:400});
    await queueImageCleanup(body.urls);
    const result = await processImageCleanup();
    return Response.json({ok:true, cleanupPending:result.failed > 0});
  } catch { return Response.json({error:'Rasmlarni tozalashni saqlab bo‘lmadi. Qayta urinib ko‘ring.'},{status:500}); }
}
