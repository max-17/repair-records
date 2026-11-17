import 'dotenv/config';
import {registerStaffCommands} from '../src/telegram-commands.js';
try{if(!process.env.TELEGRAM_BOT_TOKEN)throw new Error('MISSING_TOKEN');let chatIds=[];try{chatIds=Object.keys(JSON.parse(process.env.TELEGRAM_MASTERS||'{}'));}catch{}const commands=await registerStaffCommands({token:process.env.TELEGRAM_BOT_TOKEN,chatIds});console.log('Telegram commands registered: '+commands.map(c=>'/'+c.command).join(', '));}catch{console.error('Telegram command registration failed. Check the staff bot token and network.');process.exitCode=1;}
