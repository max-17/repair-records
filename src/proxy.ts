import { NextRequest, NextResponse } from 'next/server';
import { authenticated, sessionCookie } from '@/lib/auth';
export function proxy(request:NextRequest){
 const path=request.nextUrl.pathname;
 // UploadThing verifies callbacks itself; its upload middleware authorizes new uploads.
 if(path==='/api/customer-bot/webhook')return NextResponse.next();
 if(path==='/api/telegram/webhook')return NextResponse.next();
 if(path==='/api/telegram/cron')return NextResponse.next();
 if(path==='/api/uploadthing')return NextResponse.next();
 const privateApi=/^\/api\/(inventory|sales|analytics|local-images|telegram)(\/|$)/.test(path)||request.nextUrl.searchParams.get('all')==='1'||!['GET','HEAD','OPTIONS'].includes(request.method);
 if(!path.startsWith('/admin')&&!privateApi)return NextResponse.next();
 if(!authenticated(request.cookies.get(sessionCookie)?.value))return path.startsWith('/api/')?NextResponse.json({error:'Kirish talab qilinadi.'},{status:401}):NextResponse.redirect(new URL('/login',request.url));
 if(!['GET','HEAD','OPTIONS'].includes(request.method)&&(!request.headers.get('origin')||new URL(request.headers.get('origin')!).host!==request.headers.get('host')))return NextResponse.json({error:'Forbidden'},{status:403});
 return NextResponse.next();
}
export const config={matcher:['/admin/:path*','/api/products/:path*','/api/categories/:path*','/api/shop/:path*','/api/inventory/:path*','/api/sales/:path*','/api/analytics/:path*','/api/telegram/:path*','/api/local-images/:path*','/api/images/:path*','/api/customer-bot/:path*','/api/operations']};
