import 'server-only';
import { db, initialize, getProducts, getShop } from './db';
import { telegramCall, TelegramError, telegramEnvironment } from './telegram-api';
import { snapshot, postText, postButtons, needsRepost, splitText, type TelegramSnapshot } from './telegram-content';

type Draft={ids:number[];textIds:number[];photoCount:number;caption:boolean;target?:TelegramSnapshot};
type Posted=Draft&{snapshot?:TelegramSnapshot;postedAt:number;pending?:Draft;obsolete?:number[];warning?:string};
type Message={message_id:number};
export async function telegramStatus(){
 await initialize();const env=telegramEnvironment();
 const [channels,jobs,posts,bot]=await Promise.all([db.execute('SELECT * FROM telegram_channels ORDER BY rowid'),db.execute(`SELECT j.*,p.name FROM telegram_jobs j LEFT JOIN products p ON p.id=j.product_id ORDER BY j.rowid DESC LIMIT 100`),db.execute('SELECT product_id,channel_id,data FROM telegram_posts'),db.execute("SELECT value FROM metadata WHERE key='telegram-bot-username'")]);
 return {configured:!!env.token,baseUrlConfigured:!!env.baseUrl,development:!env.production,botUsername:String(bot.rows[0]?.value||''),channels:channels.rows,jobs:jobs.rows,posts:posts.rows.map(row=>{const data=JSON.parse(String(row.data)) as Posted;return {productId:String(row.product_id),channelId:String(row.channel_id),postedAt:data.postedAt,warning:data.warning||'',oldMessageId:data.obsolete?.[0],messageId:data.textIds[0]||data.ids[0]};})};
}
async function persist(productId:string,channelId:string,data:Posted){await db.execute({sql:'INSERT INTO telegram_posts(product_id,channel_id,data) VALUES(?,?,?) ON CONFLICT(product_id,channel_id) DO UPDATE SET data=excluded.data',args:[productId,channelId,JSON.stringify(data)]});}
export async function connectChannel(identifier:string){
 const env=telegramEnvironment();
 if(!env.token||!env.baseUrl)throw new Error('Avval bot tokeni va Mini App HTTPS manzilini serverda sozlang.');
 const url=new URL(env.baseUrl);if(url.protocol!=='https:')throw new Error('Mini App manzili HTTPS bo‘lsin.');
 if(!env.production&&(!env.channels?.length||!env.channels.includes(identifier)))throw new Error('Ishlab chiqishda faqat TELEGRAM_DEV_CHANNEL_IDS dagi test kanali ishlatiladi.');
 const bot=await telegramCall<{id:number;username:string}>('getMe');
 const chat=await telegramCall<{id:number;title:string;type:string}>('getChat',{chat_id:identifier});
 if(chat.type!=='channel')throw new Error('Telegram kanalini tanlang.');
 if(!env.production&&!env.channels?.includes(String(chat.id)))throw new Error('Test kanalining raqamini TELEGRAM_DEV_CHANNEL_IDS ga kiriting.');
 const member=await telegramCall<{status:string;can_post_messages?:boolean;can_edit_messages?:boolean}>('getChatMember',{chat_id:chat.id,user_id:bot.id});
 if(member.status!=='administrator'||!member.can_post_messages||!member.can_edit_messages)throw new Error('Botga kanalda xabar joylash va tahrirlash ruxsatlarini bering.');
 await initialize();
 const count=await db.execute('SELECT count(*) count FROM telegram_channels');if(Number(count.rows[0].count)>=5&&!(await db.execute({sql:'SELECT id FROM telegram_channels WHERE id=?',args:[String(chat.id)]})).rows.length)throw new Error('5 tagacha kanal ulash mumkin.');
 await telegramCall('setChatMenuButton',{menu_button:{type:'web_app',text:'Do‘kon',web_app:{url:url.origin}}});
 await db.batch([{sql:'INSERT INTO telegram_channels(id,title) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,enabled=1',args:[String(chat.id),chat.title]},{sql:"INSERT INTO metadata(key,value) VALUES('telegram-bot-username',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",args:[bot.username]}],'write');
 return {id:String(chat.id),title:chat.title};
}
async function editCall(method:string,payload:Record<string,unknown>){try{await telegramCall(method,payload);}catch(error){if(error instanceof TelegramError&&error.ambiguous)throw new TelegramError('Telegram tahriri tasdiqlanmadi. Qayta uriniladi.',false,60,true);throw error;}}
async function deleteOld(channelId:string,ids:number[]){if(!ids.length)return;for(let i=0;i<ids.length;i+=100)await telegramCall('deleteMessages',{chat_id:channelId,message_ids:ids.slice(i,i+100)});}
export async function processTelegramQueue(){
 const env=telegramEnvironment();if(!env.token||!env.baseUrl||(!env.production&&!env.channels?.length))return;
 await initialize();const owner=crypto.randomUUID(),now=Date.now();
 const lock=await db.execute({sql:'UPDATE telegram_lock SET owner=?,expires=? WHERE id=1 AND expires<?',args:[owner,now+600000,now]});if(!lock.rowsAffected)return;
 try{
  // A worker that died during a send must not blindly resend an unknown outcome.
  await db.execute("UPDATE telegram_jobs SET status='uncertain',error='Oldingi yuborish yakuni noma’lum. Kanalni tekshiring.' WHERE status='working'");
  const jobs=await db.execute({sql:"SELECT j.* FROM telegram_jobs j JOIN telegram_channels c ON c.id=j.channel_id WHERE c.enabled=1 AND j.status IN ('pending','failed') AND j.next_attempt<=? ORDER BY j.rowid LIMIT 3",args:[now]});
  for(const job of jobs.rows){
   if(Date.now()-now>45000)break;
   const productId=String(job.product_id),channelId=String(job.channel_id),revision=Number(job.revision);
   if(!env.production&&!env.channels?.includes(channelId))continue;
   await db.execute({sql:"UPDATE telegram_jobs SET status='working' WHERE product_id=? AND channel_id=?",args:[productId,channelId]});
   let sending=false;let completed='skipped';
   try{
    const row=await db.execute({sql:'SELECT data FROM telegram_posts WHERE product_id=? AND channel_id=?',args:[productId,channelId]});
    let state:Posted=row.rows.length?JSON.parse(String(row.rows[0].data)):{ids:[],textIds:[],photoCount:0,caption:false,postedAt:0};
    const product=(await getProducts(true)).find(p=>p.id===productId);
    if(!product?.published){
     const all=[...state.ids,...state.textIds,...(state.pending?.ids||[]),...(state.pending?.textIds||[]),...(state.obsolete||[])];
     try{await deleteOld(channelId,all);state={ids:[],textIds:[],photoCount:0,caption:false,postedAt:0};}catch{
      // Telegram cannot delete old posts. Remove sales buttons and mark unavailable.
      for(const id of state.textIds)await editCall('editMessageText',{chat_id:channelId,message_id:id,text:'Bu mahsulot katalogdan olib tashlangan.',reply_markup:{inline_keyboard:[]}});
      if(state.caption&&state.ids[0])await editCall('editMessageCaption',{chat_id:channelId,message_id:state.ids[0],caption:'Bu mahsulot katalogdan olib tashlangan.',reply_markup:{inline_keyboard:[]}});
      state.snapshot=undefined;state.warning='Eski postni Telegram o‘chirishga ruxsat bermadi. Kanalda qo‘lda o‘chiring.';
     }
     completed='posted';await persist(productId,channelId,state);
    }else if(state.snapshot||Number(job.allow_create)){
     const current=snapshot(product,await getShop(),env.baseUrl);
     const value=state.pending?.target||current;
     if(JSON.stringify(value)!==JSON.stringify(current))await db.execute({sql:'UPDATE telegram_jobs SET revision=revision+1 WHERE product_id=? AND channel_id=?',args:[productId,channelId]});
     const text=postText(value),buttons=postButtons(value,productId,String((await db.execute("SELECT value FROM metadata WHERE key='telegram-bot-username'")).rows[0]?.value||''));
     const caption=value.photos.length>0&&text.length<=1024;
     const parts=caption?(value.photos.length>1?['Do‘kon va aloqa']:[]):splitText(text);
     const replace=!state.snapshot||needsRepost(state.snapshot,value,state.postedAt)||state.photoCount!==value.photos.length||state.caption!==caption||state.textIds.length!==parts.length;
     if(replace){
      // Journal acknowledged sends, allowing a failed companion message to resume.
      const draft=state.pending||{ids:[],textIds:[],photoCount:value.photos.length,caption,target:value};state.pending=draft;
      await persist(productId,channelId,state);
      if(!draft.ids.length&&value.photos.length){
       sending=true;
       if(value.photos.length===1){const message=await telegramCall<Message>('sendPhoto',{chat_id:channelId,photo:value.photos[0],...(caption?{caption:text,reply_markup:buttons}:{})});draft.ids=[message.message_id];}
       else{const messages=await telegramCall<Message[]>('sendMediaGroup',{chat_id:channelId,media:value.photos.map((photo,index)=>({type:'photo',media:photo,...(index===0&&caption?{caption:text}:{})}))});draft.ids=messages.map(m=>m.message_id);}
       await persist(productId,channelId,state);sending=false;
      }
      for(let i=draft.textIds.length;i<parts.length;i++){
       sending=true;const message=await telegramCall<Message>('sendMessage',{chat_id:channelId,text:parts[i],link_preview_options:{is_disabled:true},...(i===parts.length-1?{reply_markup:buttons}:{})});draft.textIds.push(message.message_id);await persist(productId,channelId,state);sending=false;
      }
      const oldIds=[...new Set([...state.ids,...state.textIds,...(state.obsolete||[])])];
      state={...draft,snapshot:value,postedAt:Date.now(),obsolete:oldIds};await persist(productId,channelId,state);
      try{await deleteOld(channelId,oldIds);state.obsolete=[];}catch{state.warning='Yangi post joylandi. Eski postni Telegram cheklovi sabab qo‘lda o‘chiring.';
       // Retired posts still show the latest price/availability where editing is allowed.
       if(row.rows.length){const old=JSON.parse(String(row.rows[0].data)) as Posted;try{if(old.caption&&old.ids[0])await editCall('editMessageCaption',{chat_id:channelId,message_id:old.ids[0],caption:text.length<=1024?text:value.name});for(const id of old.textIds)await editCall('editMessageText',{chat_id:channelId,message_id:id,text:splitText(text)[0],reply_markup:buttons});}catch{/* The cleanup notice remains visible. */}}
      }
     }else if(JSON.stringify(state.snapshot)!==JSON.stringify(value)){
      if(value.photos.length)for(let i=0;i<value.photos.length;i++){
       const changed=state.snapshot!.photos[i]!==value.photos[i];
       if(changed)await editCall('editMessageMedia',{chat_id:channelId,message_id:state.ids[i],media:{type:'photo',media:value.photos[i],...(i===0&&caption?{caption:text}:{})},...(value.photos.length===1&&caption?{reply_markup:buttons}:{})});
      }
      if(caption)await editCall('editMessageCaption',{chat_id:channelId,message_id:state.ids[0],caption:text,...(value.photos.length===1?{reply_markup:buttons}:{})});
      for(let i=0;i<parts.length;i++)await editCall('editMessageText',{chat_id:channelId,message_id:state.textIds[i],text:parts[i],link_preview_options:{is_disabled:true},reply_markup:i===parts.length-1?buttons:{inline_keyboard:[]}});
      state.snapshot=value;
     }
     completed='posted';await persist(productId,channelId,state);
    }
    await db.execute({sql:"UPDATE telegram_jobs SET status=CASE WHEN revision=? THEN ? ELSE 'pending' END,allow_create=CASE WHEN revision=? THEN 0 ELSE allow_create END,attempts=0,error='' WHERE product_id=? AND channel_id=?",args:[revision,completed,revision,productId,channelId]});
   }catch(error){
    const ambiguous=error instanceof TelegramError?error.ambiguous:sending;
    const retryable=error instanceof TelegramError&&error.retryable;
    const attempts=Number(job.attempts)+1;
    await db.execute({sql:'UPDATE telegram_jobs SET status=?,attempts=?,next_attempt=?,error=? WHERE product_id=? AND channel_id=?',args:[ambiguous?'uncertain':'failed',attempts,retryable&&attempts<6?Date.now()+Math.max(error instanceof TelegramError?error.retryAfter*1000:60000,Math.min(3600000,2**attempts*10000)):8640000000000000,error instanceof Error?error.message:'Telegram xatosi',productId,channelId]});
   }
  }
 }finally{await db.execute({sql:"UPDATE telegram_lock SET owner='',expires=0 WHERE id=1 AND owner=?",args:[owner]});}
}
