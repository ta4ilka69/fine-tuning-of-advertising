import { RequestError } from '../../shared/api/errors';

export function actionError(error: unknown) {
  if (error instanceof RequestError) {
    if (error.status === 401 && error.code === 'INVALID_CREDENTIALS') return 'Неверный логин или пароль';
    if (error.kind === 'network') return 'Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.';
    if (error.status === 429) return error.retryAfterSeconds === undefined
      ? 'Слишком много попыток. Попробуйте позже.'
      : `Слишком много попыток. Повторите через ${error.retryAfterSeconds} с.`;
    if (error.status === 400 || error.status === 422) return 'Проверьте логин и пароль и попробуйте ещё раз.';
    if (error.status !== undefined && error.status >= 500) return 'Сервис временно недоступен. Попробуйте позже.';
    if (error.kind === 'invalid-response') return 'Не удалось получить ответ от сервиса. Попробуйте позже.';
  }
  return 'Не удалось выполнить действие. Попробуйте ещё раз.';
}
