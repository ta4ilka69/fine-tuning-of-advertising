import { lazy, Suspense } from 'react';
import { LoadingState } from './LoadingState';
import { AppButton } from './AppButton';
import classes from './AppHeader.module.css';

type MemberHeader = {
  userName: string;
  listingsHref: string;
  onLogout: () => void;
};

export type AppHeaderProps =
  | { variant: 'guest'; onStart?: () => void }
  | ({ variant: 'user' } & MemberHeader)
  | ({ variant: 'admin'; channelsHref: string; currentSection?: 'listings' | 'channels' } & MemberHeader);

const MemberActions = lazy(() => import('./MemberActions'));

export function AppHeader(props: AppHeaderProps) {
  return (
    <>
      <a className={classes.skip} href="#main-content">К содержимому</a>
      <header className={classes.header}>
        <a className={classes.brand} href="/">
          <span className={classes.mark} aria-hidden="true">д.</span>
          <span>Докрутка объявления</span>
        </a>
        {props.variant === 'guest' ? (
          props.onStart && <AppButton className={classes.start} onClick={props.onStart}>Начать работу</AppButton>
        ) : (
          <Suspense fallback={<LoadingState label="Загружаем меню" />}>
            <MemberActions {...props} />
          </Suspense>
        )}
      </header>
    </>
  );
}
