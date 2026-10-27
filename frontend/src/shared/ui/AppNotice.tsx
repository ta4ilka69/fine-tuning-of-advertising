import { Alert, Loader } from '@mantine/core';
import type { ReactNode } from 'react';
import classes from './AppNotice.module.css';

type AppNoticeProps = {
  tone: 'success' | 'error' | 'warning' | 'info' | 'loading';
  title: string;
  children?: ReactNode;
  onClose?: () => void;
};

export function AppNotice({ tone, title, children, onClose }: AppNoticeProps) {
  return (
    <Alert
      className={classes.notice}
      classNames={{ title: classes.content, message: classes.content, icon: classes.content, closeButton: `${classes.content} ${classes.closeButton}` }}
      data-tone={tone}
      title={title}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      aria-busy={tone === 'loading' || undefined}
      icon={tone === 'loading' ? <Loader size="sm" aria-hidden="true" /> : undefined}
      withCloseButton={Boolean(onClose)}
      onClose={onClose}
      closeButtonLabel={`Закрыть уведомление «${title}»`}
    >
      {children}
    </Alert>
  );
}
