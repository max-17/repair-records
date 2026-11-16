import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('image cleanup preserves shared images, retries failures, and retains deleted product history', async () => {
 const cwd=process.cwd(), folder=await mkdtemp(join(tmpdir(),'shop-image-cleanup-'));
 const local=process.env.INVENTORY_LOCAL_ONLY;
 let database:typeof import('../src/lib/db')|undefined;
 try {
  process.env.INVENTORY_LOCAL_ONLY='true';process.chdir(folder);
  database=await import('../src/lib/db');
  const {initializeInventory,getInventory}=await import('../src/lib/inventory');
  const {confirmSale,recentSales}=await import('../src/lib/sales');
  const {queueImageCleanup,processImageCleanup,uploadedImage}=await import('../src/lib/image-cleanup');
  await initializeInventory();
  await mkdir(join(folder,'public/uploads'),{recursive:true});
  const photo='/uploads/fixture-photo.jpg', shared='/uploads/fixture-shared.jpg';
  for(const url of [photo,shared])await writeFile(join(folder,'public',url),'image fixture');
  const base={name:'History fixture',category:'Smartfonlar',brand:'Fixture',price:100,oldPrice:0,stock:3,image:photo,images:[photo,shared],description:'',featured:false,published:true};
  await database.saveProduct({...base,id:'cleanup-history'});
  await database.saveProduct({...base,id:'cleanup-shared',image:shared,images:[shared]});
  await confirmSale('cleanup-sale',[{productId:'cleanup-history',quantity:1,unitPrice:100}]);
  const before=(await getInventory()).movements.filter(row=>row.productId==='cleanup-history');
  await database.deleteProduct('cleanup-history');
  assert.equal((await processImageCleanup()).failed,0);
  await assert.rejects(access(join(folder,'public',photo)));
  await access(join(folder,'public',shared));
  assert.deepEqual((await getInventory()).movements.filter(row=>row.productId==='cleanup-history'),before);
  const receipt=(await recentSales()).find(row=>row.id==='cleanup-sale');
  assert.equal(receipt?.items[0].name,'History fixture');assert.equal(receipt?.total,100);
  assert.equal((await database.getProducts(true)).some(row=>row.id==='cleanup-history'),false);
  // Cancelled drafts: only unused uploads are deleted; saved images stay intact.
  const draft='/uploads/fixture-draft.jpg';await writeFile(join(folder,'public',draft),'draft');
  await queueImageCleanup([draft,shared,'/uploads/../../secret.jpg','https://example.com/photo.jpg']);
  await processImageCleanup();await assert.rejects(access(join(folder,'public',draft)));await access(join(folder,'public',shared));
  assert.equal(uploadedImage('/uploads/../../secret.jpg'),null);
  assert.equal(uploadedImage('https://example.com/f/key'),null);
  assert.equal(uploadedImage('https://app.ufs.sh/f/key')?.key,'key');
  // A storage failure remains queued and succeeds on the next attempt.
  const retry='/uploads/fixture-retry.jpg';await mkdir(join(folder,'public',retry));
  await queueImageCleanup([retry]);assert.equal((await processImageCleanup()).failed,1);
  assert.equal((await database.db.execute('SELECT url FROM image_cleanup')).rows.length,1);
  await rm(join(folder,'public',retry),{recursive:true});assert.equal((await processImageCleanup()).failed,0);
  // Editing a saved product deletes removed uploads, retaining its replacement.
  const replacement='/uploads/fixture-replacement.jpg';await writeFile(join(folder,'public',replacement),'replacement');
  await database.saveProduct({...base,id:'cleanup-shared',image:replacement,images:[replacement]});
  await processImageCleanup();await assert.rejects(access(join(folder,'public',shared)));await access(join(folder,'public',replacement));
 } finally {
  database?.db.close();process.chdir(cwd);
  if(local===undefined)delete process.env.INVENTORY_LOCAL_ONLY;else process.env.INVENTORY_LOCAL_ONLY=local;
  await rm(folder,{recursive:true,force:true});
 }
});
