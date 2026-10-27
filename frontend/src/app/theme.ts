import { createTheme, type CSSVariablesResolver } from '@mantine/core';
import classes from './theme.module.css';

const colors = {
  canvas: '#F5F7F3', surface: '#FFFFFF', ink: '#192F2A', muted: '#596861',
  border: '#DDE3DB', brand: '#285549', primary: '#087F5B', hover: '#066649',
  positive: '#E8F3ED', warning: '#7A4B00', warningBg: '#FFF4D8',
  error: '#B42318', errorBg: '#FFF0EE', disabled: '#E8ECE7',
};

export const theme = createTheme({
  primaryColor: 'teal',
  primaryShade: 8,
  defaultRadius: 'md',
  fontFamily: 'Inter Variable, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  fontSizes: { xs: '0.8125rem', sm: '0.875rem', md: '0.9375rem', lg: '1.125rem', xl: '1.5rem' },
  lineHeights: { xs: '1.53846', sm: '1.42857', md: '1.6', lg: '1.44444', xl: '1.33333' },
  spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem', xl: '2rem', xxl: '3rem' },
  radius: { sm: '0.375rem', md: '0.5rem', lg: '0.75rem', xl: '1rem' },
  breakpoints: { xs: '30em', sm: '43.75em', md: '62em', lg: '75em', xl: '90em' },
  colors: {
    teal: ['#F5F7F3', colors.positive, '#D3E9DC', '#B1D6C2', '#87BFA4', '#5BA886', '#3D9170', colors.brand, colors.primary, colors.hover],
    red: [colors.errorBg, '#FFE0DB', '#FFC4BC', '#F6A296', '#EB7E6E', '#DC5D4B', '#CC4130', '#BC2E20', colors.error, '#8E1C13'],
  },
  headings: {
    fontFamily: 'inherit', fontWeight: '600',
    sizes: {
      h1: { fontSize: '2rem', lineHeight: '1.25' },
      h2: { fontSize: '1.5rem', lineHeight: '1.33333' },
      h3: { fontSize: '1.125rem', lineHeight: '1.44444' },
    },
  },
  focusRing: 'auto',
  focusClassName: classes.focus,
  activeClassName: classes.active,
  components: {
    Button: { defaultProps: { size: 'md' }, classNames: { root: classes.button, label: classes.buttonLabel } },
    ActionIcon: { defaultProps: { size: 'input-md' }, classNames: { root: classes.iconButton } },
    Input: { defaultProps: { size: 'md' }, classNames: { input: classes.input } },
    InputWrapper: { classNames: { label: classes.label, description: classes.hint, error: classes.error } },
    TextInput: { defaultProps: { size: 'md' } },
    Textarea: { defaultProps: { size: 'md', minRows: 4 }, classNames: { input: classes.textarea } },
    Select: { defaultProps: { size: 'md', checkIconPosition: 'right' } },
    Checkbox: { classNames: { root: classes.choice, input: classes.choiceInput, label: classes.choiceLabel } },
    Switch: { classNames: { root: classes.choice, track: classes.switchTrack, label: classes.choiceLabel } },
    Alert: { defaultProps: { radius: 'md' }, classNames: { root: classes.alert, title: classes.label, message: classes.hint } },
    Menu: { classNames: { item: classes.menuItem } },
    Combobox: { classNames: { option: classes.option } },
    Loader: { defaultProps: { size: 'sm', type: 'oval' } },
    Paper: { defaultProps: { radius: 'lg', withBorder: true }, classNames: { root: classes.paper } },
    Container: { defaultProps: { size: '75rem' } },
    Anchor: { defaultProps: { c: 'var(--app-primary)', underline: 'hover' } },
    Badge: { defaultProps: { variant: 'light', tt: 'none', radius: 'sm', size: 'lg' } },
  },
});

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    ...Object.fromEntries(Object.entries(colors).map(([name, value]) => [`--app-${name}`, value])),
    '--app-control-height': '2.75rem',
    '--app-border-color': colors.border,
    '--app-border': `1px solid ${colors.border}`,
    '--app-page-width': '75rem',
    '--app-display-size': '3.5rem',
    '--app-display-line-height': '1.142857',
  },
  light: {
    '--mantine-color-body': colors.canvas,
    '--mantine-color-text': colors.ink,
    '--mantine-color-dimmed': colors.muted,
    '--mantine-color-error': colors.error,
    '--mantine-color-default-border': colors.border,
    '--mantine-color-default': colors.surface,
    '--mantine-color-default-hover': colors.positive,
    '--mantine-color-disabled': colors.disabled,
    '--mantine-color-disabled-color': colors.muted,
  },
  dark: {},
});
