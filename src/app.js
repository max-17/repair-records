import express from 'express';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { z } from 'zod';
const text = z.string().trim().min(1).max(300);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(v); return !isNaN(d) && d.toISOString().slice(0,10) === v;
}, 'Use a real calendar date');
export const fields = z.object({customer:text,device:text,work:text,price_uzs:z.number().int().min(0).max(1e12).nullable().optional(),due_date:date.nullable().optional(),status:z.enum(['received','in_progress','ready','delivered','cancelled']).optional()});
const creation = fields.extend({request_id:z.uuid()}).strict();
const patch = fields.partial().strict().refine(v=>Object.keys(v).length>0,'Provide a field to update');
export function createApp({db, apiKey, masterId, dashboardKey} = {}) {
  const app=express();
  app.disable('x-powered-by');
  const configured=Boolean(db && apiKey && masterId);
  app.get('/health',(_req,res)=>res.status(configured?200:503).json({ok:configured}));
  app.use((_req,res,next)=> {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    next();
  });
  app.use(express.static(fileURLToPath(new URL('../public/',import.meta.url))));
  app.use('/api', (req,res,next)=> {
    res.setHeader('Cache-Control','no-store');
    if(!configured) return res.status(503).json({error:'Server setup incomplete. Configure DATABASE_URL, DATABASE_TOKEN, ACTION_API_KEY, MASTER_ID, and DASHBOARD_KEY in your hosting settings, then redeploy.'});
    const given=Buffer.from(req.headers.authorization || '');
    const matches=key=> {
      const expected=Buffer.from(`Bearer ${key}`);
      return given.length===expected.length && timingSafeEqual(given,expected);
    };
    if(matches(apiKey)) return next();
    if(dashboardKey && matches(dashboardKey)) {
      if(req.method !== 'GET') return res.status(403).json({error:'Read-only access'});
      return next();
    }
    return res.status(401).json({error:'Unauthorized'});
  });
  app.use(express.json({limit:'16kb'}));
  app.post('/api/repairs', async(req,res)=> {
    const parsed=creation.safeParse(req.body);
    if(!parsed.success) return res.status(400).json({error:parsed.error.issues});
    const v=parsed.data;
    const result=await db.execute({sql:`INSERT INTO repair_jobs (id,master_id,request_id,customer,device,work,price_uzs,due_date,status) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(master_id,request_id) DO NOTHING RETURNING *`,args:[randomUUID(),masterId,v.request_id,v.customer,v.device,v.work,v.price_uzs??null,v.due_date??null,v.status??'received']});
    if(result.rows.length) return res.status(201).json(result.rows[0]);
    const prior=await db.execute({sql:'SELECT * FROM repair_jobs WHERE master_id=? AND request_id=?',args:[masterId,v.request_id]});
    const row=prior.rows[0];
    if(['customer','device','work','price_uzs','due_date','status'].some(k=>row[k] !== (v[k]??(k==='status'?'received':null)))) return res.status(409).json({error:'Request ID already used with different details'});
    res.json(row);
  });
  app.get('/api/repairs',async(req,res)=> {
    const parsed=z.object({q:z.string().max(100).optional(),status:fields.shape.status,page:z.coerce.number().int().min(1).max(100000).optional()}).strict().safeParse(req.query);
    if(!parsed.success) return res.status(400).json({error:'Invalid query'});
    const {q='',status,page=1}=parsed.data;
    const result=await db.execute({sql:`SELECT * FROM repair_jobs WHERE master_id=? AND (instr(lower(customer),lower(?))>0 OR instr(lower(device),lower(?))>0) ${status?'AND status=?':''} ORDER BY created_at DESC,id LIMIT 100 OFFSET ?`,args:status?[masterId,q,q,status,(page-1)*100]:[masterId,q,q,(page-1)*100]});
    res.json({repairs:result.rows,limit:100,page,master_id:masterId});
  });
  app.patch('/api/repairs/:id',async(req,res)=> {
    const parsed=patch.safeParse(req.body);
    if(!z.uuid().safeParse(req.params.id).success || !parsed.success) return res.status(400).json({error:'Invalid ID or update'});
    const entries=Object.entries(parsed.data);
    const result=await db.execute({sql:`UPDATE repair_jobs SET ${entries.map(([k])=>`${k}=?`).join(',')}, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND master_id=? RETURNING *`,args:[...entries.map(([,v])=>v),req.params.id,masterId]});
    if(!result.rows.length) return res.status(404).json({error:'Repair not found'});
    res.json(result.rows[0]);
  });
  app.use((err,_req,res,_next)=>res.status(err.status===400?400:500).json({error:err.status===400?'Invalid JSON':'Request failed'}));
  return app;
}
