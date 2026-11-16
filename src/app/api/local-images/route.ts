import { MAX_IMAGE_BYTES } from '@/lib/upload-limits';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
export const runtime = 'nodejs';
const extensions: Record<string,string> = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif'};
export async function POST(request: Request) {
  if(process.env.NODE_ENV==='production')return Response.json({error:'Mahalliy yuklash o‘chirilgan.'},{status:403});
  const origin=request.headers.get('origin');
  if(origin&&new URL(origin).host!==request.headers.get('host'))return Response.json({error:'Ruxsat yo‘q.'},{status:403});
  const written:string[]=[];
  try{
    const files=(await request.formData()).getAll('files');
    if(!files.length||files.length>10||files.some(file=>!(file instanceof File)||!extensions[file.type]||file.size>MAX_IMAGE_BYTES))return Response.json({error:'10 tagacha JPG, PNG, WebP, GIF yoki AVIF rasm tanlang. Har biri 5 MB gacha.'},{status:400});
    const folder=join(process.cwd(),'public','uploads');await mkdir(folder,{recursive:true});
    const images=[];
    for(const value of files){const file=value as File;const name=`${crypto.randomUUID()}.${extensions[file.type]}`;const path=join(folder,name);await writeFile(path,Buffer.from(await file.arrayBuffer()));written.push(path);images.push({ufsUrl:`/uploads/${name}`});}
    return Response.json(images);
  }catch{await Promise.all(written.map(path=>unlink(path).catch(()=>{})));return Response.json({error:'Rasmlar saqlanmadi.'},{status:500});}
}
