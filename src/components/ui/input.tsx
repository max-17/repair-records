'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

type InputProps = React.ComponentProps<'input'>;

// Keep the native number input's validation, keyboard and min/max behavior.
export function NumberInput({className,onChange,...props}:Omit<InputProps,'type'>) {
 return <input {...props} type="number" className={cn('input number-input',className)} onChange={event=>{
  const value=event.currentTarget.value;
  const normalized=value.replace(/^(-?)0+(?=\d)/,'$1');
  if(normalized!==value)event.currentTarget.value=normalized;
  onChange?.(event);
 }}/>;
}

export function Input({className,type,...props}:InputProps) {
 if(type==='number')return <NumberInput className={className} {...props}/>;
 return <input type={type} className={cn('input',className)} {...props}/>;
}
