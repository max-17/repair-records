import 'dotenv/config';
const env=process.env;
try {
 for(const name of ['TELEGRAM_BOT_TOKEN','TELEGRAM_WEBHOOK_SECRET','GOOGLE_GENERATIVE_AI_API_KEY','PUBLIC_BASE_URL'])if(!env[name])throw new Error(`Missing ${name}`);
 const masters=JSON.parse(env.TELEGRAM_MASTERS||'{}');
 if(!Object.keys(masters).length||Object.values(masters).some(v=>typeof v!=='string'||!v.trim()))throw new Error('Configure TELEGRAM_MASTERS with Telegram user IDs mapped to master IDs');
 const base=new URL(env.PUBLIC_BASE_URL);
 if(base.protocol!=='https:')throw new Error('PUBLIC_BASE_URL must use HTTPS');
 const response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:new URL('/api/telegram/webhook',base).href,secret_token:env.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message']})});
 const body=await response.json();
 if(!response.ok||!body.ok)throw new Error('Telegram rejected webhook setup. Verify the bot token and HTTPS deployment.');
 console.log('Telegram webhook registered.');
}catch(error){
 console.error(error.message.startsWith('Missing ')||error.message.startsWith('Configure ')||error.message.startsWith('PUBLIC_')||error.message.startsWith('Telegram rejected')?error.message:'Webhook setup failed. Check configuration and network access.');process.exitCode=1;
}
