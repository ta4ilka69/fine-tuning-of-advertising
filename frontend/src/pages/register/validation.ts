export function validateLogin(value: string) {
  if (!value.length) return 'Введите логин';
  if (value.length < 3 || value.length > 32) return 'Логин должен содержать от 3 до 32 символов';
  if (/[^A-Za-z0-9_.-]/.test(value)) return 'Используйте латиницу, цифры, точку, дефис и\u00a0_';
  return null;
}

export function validatePassword(value: string) {
  const length = Array.from(value).length;
  if (!length) return 'Введите пароль';
  return length < 12 || length > 128 ? 'Пароль должен содержать от 12 до 128 символов' : null;
}
