import { NextRequest,NextResponse } from 'next/server';
import { sessionCookie } from '@/lib/auth';
export async function POST(request:NextRequest){if((!request.headers.get('origin')||new URL(request.headers.get('origin')!).host!==request.headers.get('host')))return new Response(null,{status:403});const response=NextResponse.redirect(new URL('/login',request.url),303);response.cookies.set(sessionCookie,'',{path:'/',maxAge:0,httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax'});return response;}
