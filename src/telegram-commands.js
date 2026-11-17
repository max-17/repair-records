export const staffCommands=[{command:'start',description:'Bot haqida va buyruqlar'},{command:'pul',description:'Sotuv, xizmat, qarz va hisobot'},{command:'tamirlash',description:'Ta’mirlash buyurtmalari'}];
export async function registerStaffCommands({token,chatIds=[],fetcher=fetch}){
 const call=async(method,body)=>{const response=await fetcher(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});const result=await response.json();if(!response.ok||!result.ok)throw new Error('TELEGRAM_COMMAND_SETUP_FAILED');return result.result;};
 for(const language_code of ['', 'uz','ru','en']){
  for(const scope of [{type:'default'},{type:'all_private_chats'}])await call('setMyCommands',{commands:staffCommands,scope,language_code});
  for(const chatId of chatIds)await call('deleteMyCommands',{scope:{type:'chat',chat_id:chatId},language_code}).catch(()=>{});
 }
 return call('getMyCommands',{scope:{type:'all_private_chats'}});
}
