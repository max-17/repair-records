import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const buildDir = resolve(process.argv[2] || '.next');
for (const route of ['server/app/page.js.nft.json', 'server/app/api/products/route.js.nft.json']) {
 const trace = JSON.parse(readFileSync(resolve(buildDir, route), 'utf8'));
 if (!trace.files.some(file => file.includes('node_modules/@libsql/client/'))) {
  throw new Error('Database client missing from deployment trace: ' + route);
 }
}
console.log('Database client is included in the storefront and products API deployment traces.');
