'use client';
import { useState } from 'react';
import { format,parseISO } from 'date-fns';
import { uz } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { CalendarDays } from 'lucide-react';
import { Calendar } from './ui/calendar';
import { Popover,PopoverContent,PopoverTrigger } from './ui/popover';
import { Button } from './ui/button';
import { shopDate,shiftDate } from '@/lib/sales-types';
export function AnalyticsRange({value,onChange}:{value:{from:string;to:string};onChange:(value:{from:string;to:string})=>void}){
 const [open,setOpen]=useState(false);const [draft,setDraft]=useState<DateRange|undefined>();
 const today=shopDate();
 function quick(days:number){onChange({from:shiftDate(today,1-days),to:today});setOpen(false);}
 return <Popover open={open} onOpenChange={next=>{setOpen(next);if(next)setDraft({from:parseISO(value.from),to:parseISO(value.to)});}}><PopoverTrigger render={<Button variant="outline" className="analytics-range-trigger"/>}><CalendarDays size={16}/>{format(parseISO(value.from),'dd.MM.yyyy')} — {format(parseISO(value.to),'dd.MM.yyyy')}</PopoverTrigger><PopoverContent className="analytics-range-popover" align="start"><div className="analytics-range-presets">{[[1,'Bugun'],[7,'Oxirgi 7 kun'],[30,'Oxirgi 30 kun']] .map(([days,label])=><Button key={days} variant="ghost" onClick={()=>quick(Number(days))}>{label}</Button>)}</div><Calendar mode="range" selected={draft} onSelect={setDraft} defaultMonth={draft?.from} locale={uz} numberOfMonths={1}/><div className="analytics-range-footer"><Button variant="outline" onClick={()=>setOpen(false)}>Bekor qilish</Button><Button disabled={!draft?.from||!draft?.to} onClick={()=>{if(draft?.from&&draft.to){onChange({from:format(draft.from,'yyyy-MM-dd'),to:format(draft.to,'yyyy-MM-dd')});setOpen(false);}}}>Tanlash</Button></div></PopoverContent></Popover>;
}
