import { Button, type ButtonProps } from '@mantine/core';
import type { ComponentPropsWithRef } from 'react';

export type ActionIntent = 'primary' | 'secondary' | 'quiet' | 'danger';

type AppButtonProps = Omit<ButtonProps, 'color' | 'variant'> &
  Omit<ComponentPropsWithRef<'button'>, keyof ButtonProps> & {
    intent?: ActionIntent;
  };

const variants = { primary: 'filled', secondary: 'default', quiet: 'subtle', danger: 'filled' } as const;

export function AppButton({ intent = 'primary', loading, disabled, ...props }: AppButtonProps) {
  return (
    <Button
      type="button"
      {...props}
      variant={variants[intent]}
      color={intent === 'danger' ? 'red.8' : 'teal'}
      disabled={disabled || loading}
      loading={loading}
      aria-busy={loading || undefined}
    />
  );
}
