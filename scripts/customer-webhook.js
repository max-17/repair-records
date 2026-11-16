import 'dotenv/config';
// Registers only the public customer bot. The staff bot keeps its own webhook.
try{
 const env=process.env;
 for(const name of ['SHOP_TELEGRAM_BOT_TOKEN','SHOP_TELEGRAM_WEBHOOK_SECRET','TELEGRAM_APP_URL','SHOP_ADMIN_CHAT_ID'])if(!env[name])throw new Error(`Missing ${name}`);
 if(env.SHOP_TELEGRAM_BOT_TOKEN===env.TELEGRAM_BOT_TOKEN)throw new Error('Configure separate customer and staff bot tokens before registering this webhook.');
 if(!/^-?\d+$/.test(env.SHOP_ADMIN_CHAT_ID))throw new Error('Configure SHOP_ADMIN_CHAT_ID as the Telegram chat number.');
 if(!/^[A-Za-z0-9_-]{1,256}$/.test(env.SHOP_TELEGRAM_WEBHOOK_SECRET))throw new Error('Configure SHOP_TELEGRAM_WEBHOOK_SECRET using letters, numbers, underscore or hyphen (up to 256 characters).');
 const base=new URL(env.TELEGRAM_APP_URL);
 if(base.protocol!=='https:')throw new Error('TELEGRAM_APP_URL must use HTTPS.');
 const response=await fetch(`https://api.telegram.org/bot${env.SHOP_TELEGRAM_BOT_TOKEN}/setWebhook`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:new URL('/api/customer-bot/webhook',base).href,secret_token:env.SHOP_TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message','callback_query']}),signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok||!result.ok)throw new Error('Telegram rejected customer webhook setup. Verify the bot token and public HTTPS deployment.');
 console.log('Customer bot webhook registered. The staff bot webhook is unchanged.');
}catch(error){const message=error instanceof Error?error.message:'';console.error(/^(Missing |Configure |TELEGRAM_APP_URL |Telegram rejected)/.test(message)?message:'Customer webhook setup failed. Check configuration and network access.');process.exitCode=1;}
