import { Anchor, Menu } from '@mantine/core';
import { AppButton } from './AppButton';
import type { AppHeaderProps } from './AppHeader';
import classes from './AppHeader.module.css';

export default function MemberActions(props: Exclude<AppHeaderProps, { variant: 'guest' }>) {
  return (
    <>
      {props.variant === 'admin' && (
        <nav className={classes.navigation} aria-label="Основная навигация">
          <Anchor href={props.listingsHref} aria-current={props.currentSection === 'listings' ? 'page' : undefined}>Мои объявления</Anchor>
          <Anchor href={props.channelsHref} aria-current={props.currentSection === 'channels' ? 'page' : undefined}>Площадки</Anchor>
        </nav>
      )}
      <Menu position="bottom-end" width={240} returnFocus>
        <Menu.Target>
          <AppButton intent="secondary" aria-label={`Меню пользователя: ${props.userName}`} className={classes.account}>
            <span className={classes.userName}>{props.userName}</span>
            <span className={classes.desktopIcon} aria-hidden="true">▾</span>
            <span className={classes.mobileIcon} aria-hidden="true">☰</span>
          </AppButton>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>{props.userName}</Menu.Label>
          <Menu.Item component="a" href={props.listingsHref}>Мои объявления</Menu.Item>
          {props.variant === 'admin' && <Menu.Item component="a" href={props.channelsHref}>Площадки</Menu.Item>}
          <Menu.Divider />
          <Menu.Item onClick={props.onLogout}>Выйти</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
}
