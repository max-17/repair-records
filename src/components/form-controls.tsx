'use client';
import {Children,cloneElement,isValidElement,useId,useState,type ReactNode,type ReactElement} from 'react';
import {uz} from 'date-fns/locale/uz';
import {CalendarIcon} from 'lucide-react';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from './ui/select';
import {Field,FieldLabel} from './ui/field';
import {Popover,PopoverTrigger,PopoverContent} from './ui/popover';
import {Calendar} from './ui/calendar';
import {Button} from './ui/button';
export function FormField({children,className=''}:{children:ReactNode;className?:string}){
 const generated=useId(),parts=Children.toArray(children),index=parts.findIndex(isValidElement);
 const control=parts[index] as ReactElement<{id?:string}>|undefined,id=control?.props.id||generated;
 return <Field className={'app-form-field '+className}><FieldLabel htmlFor={id}>{parts.slice(0,index)}</FieldLabel>{control?cloneElement(control,{id}):null}{parts.slice(index+1)}</Field>;
}
export function FormSelect({children,value,defaultValue,onValueChange,disabled,name,id,required,'aria-label':label}:{children:ReactNode;value?:string;defaultValue?:string;onValueChange?:(value:string)=>void;disabled?:boolean;name?:string;id?:string;required?:boolean;'aria-label'?:string}){
 const [internal,setInternal]=useState(defaultValue||'');
 const items=Children.toArray(children).filter(isValidElement).map(child=>{const option=child as ReactElement<{value?:string;children:ReactNode}>;return {value:option.props.value??String(option.props.children),label:option.props.children};});
 return <Select items={items} value={value??internal} onValueChange={v=>{if(v!==null){setInternal(v);onValueChange?.(v);}}} disabled={disabled} name={name} required={required}><SelectTrigger id={id} aria-label={label} className="select-trigger app-form-select"><SelectValue/></SelectTrigger><SelectContent className="select-content app-form-options" alignItemWithTrigger={false}>{items.map(item=><SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>;
}
export function DateControl({value,onValueChange,id,disabled,'aria-label':label}:{value:string;onValueChange:(value:string)=>void;id?:string;disabled?:boolean;'aria-label'?:string}){
 const [open,setOpen]=useState(false),selected=value?new Date(value+'T12:00:00'):undefined;
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger render={<Button id={id} disabled={disabled} variant="outline" type="button" className="app-date-control" aria-label={label}/>}><CalendarIcon size={16}/>{selected?value.split('-').reverse().join('.'):'Sana tanlang'}</PopoverTrigger><PopoverContent className="app-date-popover" align="start"><Calendar locale={uz} mode="single" selected={selected} defaultMonth={selected} onSelect={date=>{onValueChange(date?`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`:'');setOpen(false);}}/><Button variant="ghost" size="sm" onClick={()=>{onValueChange('');setOpen(false);}}>Sanani tozalash</Button></PopoverContent></Popover>;
}
