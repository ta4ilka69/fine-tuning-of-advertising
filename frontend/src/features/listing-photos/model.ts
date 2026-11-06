import { RequestError } from '../../shared/api/errors';
import { listings } from '../../shared/api/listings';
import { photos } from '../../shared/api/photos';
import type { ListingOverview } from '../../shared/api/types';

export function fileError(file: Pick<File, 'type' | 'size'>) {
  if (!['image/jpeg', 'image/png'].includes(file.type)) return 'Выберите JPEG или PNG.';
  if (file.size < 1) return 'Файл пустой.';
  if (file.size > 15000000) return 'Файл больше 15 МБ (15 000 000 байт).';
  return undefined;
}

export type Upload = {
  key: number;
  name: string;
  file?: File;
  state: 'waiting' | 'uploading' | 'error' | 'uncertain' | 'rejected';
  error?: string;
};
export type PhotoState = {
  listing?: ListingOverview;
  uploads: Upload[];
  deleting?: string;
  reading: boolean;
  paused: boolean;
  verified: boolean;
  inaccessible: boolean;
  error?: string;
  announcement: string;
  removed?: string;
};

function message(error: unknown) {
  if (!(error instanceof RequestError)) return 'Не удалось выполнить запрос. Попробуйте ещё раз.';
  if (error.status === 401) return 'Сессия завершилась. Проверяем доступ.';
  if (error.status === 403) return 'Нет доступа к этому объявлению.';
  if (error.status === 404) return 'Объявление не найдено или фотография больше недоступна.';
  if (error.status === 409) return error.code === 'LISTING_BUSY'
    ? 'Идёт генерация. Дождитесь её завершения.'
    : 'Объявление изменилось. Очередь остановлена, загружаем текущую версию.';
  if (error.status === 413) return 'Файл слишком большой. Выберите файл до 15 МБ.';
  if (error.status === 415) return 'Сервер не распознал JPEG или PNG. Выберите другой файл.';
  if (error.status === 422) return 'Сервер не смог принять фотографию. Проверьте файл и лимит 20 фото.';
  if (error.status === 429) return 'Слишком много запросов. Подождите и продолжите очередь вручную.';
  return error.message;
}

export class PhotoManager {
  private state: PhotoState = { uploads: [], reading: false, paused: false, verified: false, inaccessible: false, announcement: '' };
  private listeners = new Set<() => void>();
  private active = false;
  private running = false;
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private refreshNeeded = true;
  private sequence = 0;
  private deletes: string[] = [];

  private id: string;
  private recheck: (unauthorized: boolean) => void;

  constructor(id: string, recheck: (unauthorized: boolean) => void) { this.id = id; this.recheck = recheck; }

  snapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<PhotoState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  start() { this.active = true; this.refreshNeeded = true; void this.pump(); }
  stop() {
    this.active = false;
    this.controller?.abort();
    clearTimeout(this.timer);
    this.running = false;
  }

  add(files: File[]) {
    if (!this.active || !this.state.verified || this.state.listing?.status === 'generating' || this.state.inaccessible) return;
    let count = this.count();
    const uploads = files.map((file): Upload => {
      const error = fileError(file) ?? (count >= 20 ? 'Можно добавить не больше 20 фотографий.' : undefined);
      if (!error) count++;
      return { key: ++this.sequence, name: file.name, ...(error ? { state: 'rejected', error } : { file, state: 'waiting' }) };
    });
    this.update({ uploads: [...this.state.uploads, ...uploads], announcement: `Выбрано файлов: ${files.length}. Отклонено: ${uploads.filter((entry) => entry.state === 'rejected').length}.` });
    void this.pump();
  }

  count() { return (this.state.listing?.photos.length ?? 0) + this.state.uploads.filter((entry) => entry.file).length; }

  dismiss(key: number) {
    this.update({ uploads: this.state.uploads.filter((entry) => entry.key !== key || entry.state === 'uploading') });
  }

  remove(photoId: string) {
    if (!this.active || !this.state.verified || this.state.inaccessible || this.state.paused
      || this.state.listing?.status === 'generating' || this.deletes.includes(photoId) || this.state.deleting === photoId
      || !this.state.listing?.photos.some((photo) => photo.id === photoId)) return;
    this.deletes.push(photoId);
    void this.pump();
  }

  refresh = () => {
    if (!this.active || this.running) return;
    this.refreshNeeded = true;
    void this.pump();
  };

  resume = () => {
    if (!this.active || !this.state.verified || this.state.inaccessible || this.state.listing?.status === 'generating') return;
    this.update({ paused: false, error: undefined, uploads: this.state.uploads.map((entry) => entry.state === 'error' ? { ...entry, state: 'waiting', error: undefined } : entry) });
    void this.pump();
  };

  private async pump() {
    if (!this.active || this.running) return;
    clearTimeout(this.timer);
    const listing = this.state.listing;
    const read = this.refreshNeeded;
    const mayWrite = !this.state.paused && this.state.verified && !this.state.inaccessible && listing?.status !== 'generating';
    const deletion = !read && mayWrite ? this.deletes.shift() : undefined;
    const upload = !read && mayWrite && !deletion ? this.state.uploads.find((entry) => entry.state === 'waiting') : undefined;
    if (!read && !deletion && !upload) {
      if (this.state.verified && !this.state.inaccessible && listing?.photos.some((photo) => photo.status === 'processing')) {
        this.timer = setTimeout(() => { this.refreshNeeded = true; void this.pump(); }, 1500);
      }
      return;
    }
    this.running = true;
    const controller = new AbortController();
    this.controller = controller;
    this.refreshNeeded = false;
    this.update({ reading: read, deleting: deletion, ...(upload ? {
      uploads: this.state.uploads.map((entry) => entry.key === upload.key ? { ...entry, state: 'uploading' } : entry),
      announcement: `Загружаем ${upload.name}.`,
    } : {}) });
    try {
      if (read) {
        const current = await listings.get(this.id, controller.signal);
        if (controller.signal.aborted) return;
        if (listing && current.version < listing.version) throw new RequestError('invalid-response', 200);
        let available = 20 - current.photos.length;
        const uploads = this.state.uploads.map((entry): Upload => {
          if (!entry.file) return entry;
          if (available-- > 0) return entry;
          return { key: entry.key, name: entry.name, state: 'rejected', error: 'Можно добавить не больше 20 фотографий. Проверьте обновлённую галерею.' };
        });
        this.update({ listing: current, uploads, verified: true, inaccessible: false,
          ...(current.status === 'generating' ? { paused: true, error: 'Идёт генерация. Обновите состояние после её завершения.' } : {}),
          announcement: current.photos.some((photo) => photo.status === 'processing') ? 'Фотографии обрабатываются.' : 'Состояние фотографий обновлено.',
        });
      } else if (deletion) {
        const result = await photos.remove(this.id, deletion, listing!.version, controller.signal);
        if (controller.signal.aborted) return;
        this.update({ listing: { ...listing!, version: result.version, status: 'draft', photos: listing!.photos.filter((photo) => photo.id !== deletion) },
          removed: deletion, announcement: 'Фотография удалена.', error: undefined });
      } else if (upload) {
        const result = await photos.upload(this.id, upload.file!, listing!.version, controller.signal);
        if (controller.signal.aborted) return;
        if (listing!.photos.some((photo) => photo.id === result.photo.id) || listing!.photos.length >= 20) throw new RequestError('invalid-response', 201);
        this.update({ listing: { ...listing!, version: result.version, status: 'draft', photos: [...listing!.photos, result.photo] },
          uploads: this.state.uploads.filter((entry) => entry.key !== upload.key), announcement: `${upload.name}: файл загружен.`, error: undefined });
      }
      this.recheck(false);
    } catch (failure) {
      if (controller.signal.aborted) return;
      const error = message(failure);
      const status = failure instanceof RequestError ? failure.status : undefined;
      const uncertain = !read && (!(failure instanceof RequestError) || failure.kind !== 'http' || (status ?? 0) >= 500);
      const inaccessible = status === 401 || status === 403 || (read && status === 404);
      this.deletes = [];
      this.update({ paused: true, verified: false, inaccessible, error,
        uploads: this.state.uploads.map((entry) => entry.key === upload?.key ? {
          ...entry, state: uncertain ? 'uncertain' : 'error',
          ...(uncertain ? { file: undefined } : {}),
          error: uncertain ? `${error} Результат неизвестен. Сначала проверьте галерею после обновления; при необходимости выберите файл заново.` : error,
        } : entry), announcement: error,
      });
      if (status === 401) this.recheck(true);
      if (!read && !inaccessible) this.refreshNeeded = true;
    } finally {
      if (!controller.signal.aborted) {
        this.running = false;
        this.update({ reading: false, deleting: undefined });
        void this.pump();
      }
    }
  }
}
