import type { Metadata } from 'next';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import './globals.css';
import './inventory.css';
import './pos.css';
import './admin-touch.css';
import './workspace-layout.css';
import './inventory-layout.css';
import './checkout-layout.css';
import './labels-layout.css';
import './repairs-layout.css';
import { TelegramBridge } from '@/components/telegram-bridge';
import Providers from '@/components/providers';
export const metadata:Metadata={title:'TechSpace — Elektronika va aksessuarlar',description:'Mahsulotlarni ko‘ring, narxlarni solishtiring va do‘kon bilan to‘g‘ridan-to‘g‘ri bog‘laning.'};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="uz" data-theme="dark" suppressHydrationWarning data-scroll-behavior="smooth"><body><TelegramBridge/><Providers>{children}</Providers></body></html>;}
