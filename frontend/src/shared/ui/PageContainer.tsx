import type { ComponentPropsWithoutRef } from 'react';
import classes from './PageContainer.module.css';

export function PageContainer({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={[classes.container, className].filter(Boolean).join(' ')} />;
}
