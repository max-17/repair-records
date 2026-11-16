import { createRouteHandler } from 'uploadthing/next';
import { fileRouter } from './core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler=createRouteHandler({ router: fileRouter });
export const GET=process.env.NODE_ENV==='development'?()=>Response.json({error:'Use local uploads in development'},{status:403}):handler.GET;
export const POST=process.env.NODE_ENV==='development'?()=>Response.json({error:'Use local uploads in development'},{status:403}):handler.POST;