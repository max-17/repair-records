"use client";
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const buttonVariants=cva('button',{variants:{variant:{default:'button-primary',outline:'button-outline',ghost:'button-ghost'},size:{default:'',sm:'button-sm',icon:'button-icon'}},defaultVariants:{variant:'default',size:'default'}});
function Button({className,variant,size,...props}:ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) { return <ButtonPrimitive className={cn(buttonVariants({variant,size}),className)} {...props}/>; }
export { Button, buttonVariants };
