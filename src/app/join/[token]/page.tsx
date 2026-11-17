import {TelegramLogin} from '@/components/telegram-login';
export const metadata={title:'Xodim sifatida kirish',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;return <main className="staff-join-page"><h1>Do‘konga xush kelibsiz</h1><p>Egasi yuborgan taklif orqali Telegram hisobingizni tasdiqlang.</p><TelegramLogin invite={token}/></main>;}
