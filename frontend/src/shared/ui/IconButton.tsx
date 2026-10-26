import { ActionIcon, type ActionIconProps } from '@mantine/core';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import type { ActionIntent } from './AppButton';

type IconButtonProps = Omit<ActionIconProps, 'color' | 'variant' | 'children'> &
  Omit<ComponentPropsWithRef<'button'>, keyof ActionIconProps | 'aria-label'> & {
    label: string;
    children: ReactNode;
    intent?: ActionIntent;
  };

const variants = { primary: 'filled', secondary: 'default', quiet: 'subtle', danger: 'filled' } as const;

export function IconButton({ label, intent = 'quiet', loading, disabled, ...props }: IconButtonProps) {
  return (
    <ActionIcon
      type="button"
      {...props}
      variant={variants[intent]}
      color={intent === 'danger' ? 'red.8' : 'teal'}
      aria-label={label}
      aria-busy={loading || undefined}
      loading={loading}
      disabled={disabled || loading}
    />
  );
}
