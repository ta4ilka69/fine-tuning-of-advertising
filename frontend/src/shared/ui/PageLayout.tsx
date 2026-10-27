import type { ReactNode } from 'react';
import { AppHeader, type AppHeaderProps } from './AppHeader';
import { PageContainer } from './PageContainer';
import classes from './PageLayout.module.css';

type PageLayoutProps = {
  header: AppHeaderProps;
  children: ReactNode;
  className?: string;
};

export function PageLayout({ header, children, className }: PageLayoutProps) {
  return (
    <div className={classes.page}>
      <AppHeader {...header} />
      <main id="main-content" tabIndex={-1} className={[classes.main, className].filter(Boolean).join(' ')}>
        <PageContainer>{children}</PageContainer>
      </main>
    </div>
  );
}
