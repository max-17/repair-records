// Read-only snapshot of Pul/staff records. Output is private and ignored by Git.
import 'dotenv/config';
import {createClient} from '@libsql/client';
import {writeFile,mkdir} from 'node:fs/promises';
const path=`data/backups/pul-${new Date().toISOString().replaceAll(':','-')}.json`;
const db=createClient({url:process.env.DATABASE_URL,authToken:process.env.DATABASE_TOKEN||process.env.database_token});
try{
 const tx=await db.transaction('read');
 try{
  const names=(await tx.execute("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'pul_%' OR name LIKE 'staff_%') ORDER BY name")).rows.map(r=>r.name),tables={};
  for(const name of names){const result=await tx.execute('SELECT * FROM "'+name.replaceAll('"','""')+'"');tables[name]={columns:result.columns,rows:result.rows.map(row=>result.columns.map(c=>row[c] instanceof ArrayBuffer?{base64:Buffer.from(row[c]).toString('base64')}:ArrayBuffer.isView(row[c])?{base64:Buffer.from(row[c].buffer,row[c].byteOffset,row[c].byteLength).toString('base64')}:row[c]))};}
  await mkdir('data/backups',{recursive:true});await writeFile(path,JSON.stringify({exportedAt:new Date().toISOString(),tables}),{mode:0o600,flag:'wx'});await tx.commit();
  console.log(JSON.stringify({backup:path,tables:names.length,records:tables.pul_records?.rows.length,history:tables.pul_history?.rows.length}));
 }finally{if(!tx.closed)await tx.rollback();}
}finally{db.close();}
