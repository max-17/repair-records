'use client';
import {useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import {Plus,Trash2} from 'lucide-react';
import type {CategoryDefinition,CategoryField} from '@/lib/types';
import {api} from '@/lib/api';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
type DraftField=CategoryField&{optionsText:string};
const draftFields=(fields:CategoryField[])=>fields.map(field=>({...field,optionsText:(field.options||[]).join('\n')}));
const presets:CategoryField[]=[{id:'memory',label:'RAM / Xotira',type:'text'},{id:'color',label:'Rang',type:'text'},{id:'condition',label:'Holati',type:'select',options:['Yangi','Ishlatilgan']}];
export function CategoryEditor({mode,definitions,initialName='',onClose,onSaved}:{mode:'create'|'edit';definitions:CategoryDefinition[];initialName?:string;onClose:()=>void;onSaved:(name:string)=>void}){
 const [name,setName]=useState(initialName);
 const [fields,setFields]=useState<DraftField[]>(()=>draftFields(definitions.find(d=>d.name===initialName)?.fields||[]));
 const [error,setError]=useState('');
 const save=useMutation({mutationFn:()=>api('/api/categories',{method:mode==='edit'?'PUT':'POST',body:JSON.stringify({name:name.trim(),fields:fields.map(({optionsText,...field})=>({...field,...(field.type==='select'?{options:optionsText.split('\n').map(s=>s.trim()).filter(Boolean)}:{options:undefined})}))})}),onSuccess:()=>onSaved(name.trim())});
 function addField(preset?:CategoryField){if(fields.length>=20)return;setFields(current=>[...current,...draftFields([preset||{id:'field_'+crypto.randomUUID().replaceAll('-','').slice(0,12),label:'',type:'text'}])]);}
 function editField(index:number,patch:Partial<DraftField>){setFields(current=>current.map((field,i)=>i===index?{...field,...patch}:field));setError('');}
 return <Dialog open onOpenChange={open=>{if(!open&&!save.isPending)onClose();}}><DialogContent className="category-fields-dialog"><DialogTitle>{mode==='create'?'Yangi turkum':'Turkum maydonlari'}</DialogTitle><DialogDescription>Har bir mahsulotda asosiy maydonlar bo‘ladi. Quyidagi xususiyatlarni mahsulotda to‘ldirish ixtiyoriy.</DialogDescription>
  <form className="category-fields-form" onSubmit={event=>{event.preventDefault();if(fields.some(field=>!field.label.trim()||(field.type==='select'&&!field.optionsText.trim()))){setError('Maydon nomini va tanlov variantlarini to‘ldiring.');return;}save.mutate();}}>
   {mode==='create'?<label>Turkum nomi<Input required maxLength={60} value={name} onChange={e=>setName(e.target.value)} placeholder="Masalan, Kabellar"/></label>:<label>Turkum<select className="input" required value={name} onChange={e=>{setName(e.target.value);setFields(draftFields(definitions.find(d=>d.name===e.target.value)?.fields||[]));setError('');}}><option value="">Turkumni tanlang</option>{definitions.map(d=><option key={d.name} value={d.name}>{d.name}</option>)}</select></label>}
   <div className="category-fields-title"><h3>Ixtiyoriy maydonlar</h3><span>{fields.length}/20</span></div>
   <div className="category-field-presets">{presets.filter(preset=>!fields.some(field=>field.id===preset.id)).map(preset=><Button key={preset.id} type="button" variant="outline" disabled={fields.length>=20||save.isPending} onClick={()=>addField(preset)}><Plus size={14}/>{preset.label}</Button>)}</div>
   <div className="category-field-definitions">{fields.map((field,index)=><section className="category-field-definition" key={field.id}><div className="category-definition-row"><label>Maydon nomi<Input required maxLength={80} value={field.label} onChange={e=>editField(index,{label:e.target.value})} placeholder="Masalan, Uzunlik"/></label><label>Turi<select className="input" value={field.type} disabled={field.id==='memory'} onChange={e=>editField(index,{type:e.target.value as CategoryField['type']})}><option value="text">Matn</option><option value="number">Son</option><option value="select">Tanlov</option></select></label><Button type="button" variant="ghost" aria-label={`${field.label||'Maydon'}ni olib tashlash`} onClick={()=>setFields(current=>current.filter((_,i)=>i!==index))}><Trash2 size={17}/></Button></div>{field.type==='select'&&<label>Tanlovlar (har biri yangi qatorda)<textarea className="input" required rows={3} maxLength={2500} value={field.optionsText} onChange={e=>editField(index,{optionsText:e.target.value})} placeholder={'Yangi\nIshlatilgan'}/></label>}</section>)}</div>
   {!fields.length&&<p className="category-empty-note">Hozircha qo‘shimcha maydon yo‘q. Masalan, rang yoki uzunlik qo‘shishingiz mumkin.</p>}
   <Button type="button" variant="outline" disabled={fields.length>=20||save.isPending} onClick={()=>addField()}><Plus size={16}/>Maydon qo‘shish</Button>
   {error&&<p className="form-error" role="alert">{error}</p>}{save.isError&&<p className="form-error" role="alert">{save.error.message}</p>}
   <div className="form-actions"><Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>Bekor qilish</Button><Button type="submit" disabled={save.isPending||!name.trim()}>{save.isPending?'Saqlanmoqda…':mode==='create'?'Turkum yaratish':'Saqlash'}</Button></div>
  </form>
 </DialogContent></Dialog>;
}
