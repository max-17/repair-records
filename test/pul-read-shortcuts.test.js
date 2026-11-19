import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pulReadShortcut} from '../src/pul-read-shortcuts.js';
test('exact report shortcuts resolve local calendar dates without model inference',()=>{
 assert.deepEqual(pulReadShortcut('  Bugungi   hisobot! ','2026-11-19'),{action:'report',start_date:'2026-11-19',end_date:'2026-11-19'});
 assert.deepEqual(pulReadShortcut('Kechagilik analitika','2026-03-01'),{action:'report',start_date:'2026-02-28',end_date:'2026-02-28'});
 assert.deepEqual(pulReadShortcut('qarz daftar','2026-11-19'),{action:'list',record_kind:'debt'});
 for(const text of ['Bugungi hisobot faqat naqd','Ali bugun qancha sotdi','qarz yoz','Bugungi hisobotni o‘chir','kecha foyda qancha'])assert.equal(pulReadShortcut(text,'2026-11-19'),null);
});
