import { generation } from '../../shared/api/generation';
import { observedGeneration, photoRequirement, retainResult, type GenerationState } from './generation';
import { RequestError } from '../../shared/api/errors';
import { listings } from '../../shared/api/listings';
import type { ListingData } from '../../shared/api/listing-data';
import { photos } from '../../shared/api/photos';
import { photoCorrections } from '../../shared/api/photo-corrections';
import type { Listing } from '../../shared/api/types';

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
export type ListingDeletion = {
  listing: Listing;
  phase: 'confirm' | 'deleting' | 'uncertain' | 'checking' | 'conflict' | 'busy' | 'denied' | 'missing' | 'error' | 'deleted';
  error?: string;
};
export type PhotoState = {
  listingDeletion?: ListingDeletion;
  generation?: GenerationState;
  correction?: {
    phase?: 'sending' | 'checking';
    message?: string;
    pollError?: string;
    retryAt?: number;
    pollRetryAt?: number;
  };
  listing?: Listing;
  editing?: boolean;
  editSavedVersion?: number;
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

export function generationLocked(state: PhotoState) {
  return !!state.generation?.phase || state.listing?.status === 'generating';
}

export function hasPendingCorrection(listing: Listing | undefined) {
  return listing?.photoCorrection?.status === 'processing' || listing?.photoCorrection?.status === 'ready';
}

export function correctionLocked(state: PhotoState) {
  return !!state.correction?.phase || hasPendingCorrection(state.listing);
}

export function listingLocked(state: PhotoState) {
  return generationLocked(state) || correctionLocked(state);
}

type CorrectionAction = 'start' | 'retry' | 'apply' | 'discard';

export function correctionActionAvailable(state: PhotoState) {
  return state.verified && !state.inaccessible && !state.editing && !state.listingDeletion && !state.reading
    && !state.deleting && !state.uploads.some((entry) => entry.file) && !generationLocked(state) && !state.correction?.phase;
}

function correctionError(error: RequestError | undefined) {
  if (error?.status === 405 || error?.status === 501 || (error?.status === 404 && (!error.code || error.code === 'NOT_FOUND'))
    || error?.code === 'PHOTO_CORRECTION_UNAVAILABLE') return 'Исправление фотографий пока недоступно';
  if (error?.status === 409) return 'Состояние объявления изменилось. Проверьте фотографии перед новой попыткой';
  if (error?.status === 404) return 'Фотография или исправление больше недоступны';
  if (error?.status === 403) return 'Нет доступа к исправлению этой фотографии';
  if (error?.status === 422) return 'Сервер не может применить выбранную правку';
  return 'Не удалось подтвердить действие. Проверьте состояние фотографии перед новой попыткой';
}

function message(error: unknown) {
  if (!(error instanceof RequestError)) return 'Не удалось выполнить запрос. Попробуйте ещё раз.';
  if (error.status === 401) return 'Сессия завершилась. Проверяем доступ.';
  if (error.status === 403) return 'Нет доступа к этому объявлению.';
  if (error.status === 404) return 'Объявление не найдено или фотография больше недоступна.';
  if (error.code === 'PHOTO_CORRECTION_ACTIVE') return 'Завершите исправление фотографии перед изменением объявления.';
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
  private saving = false;
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private refreshNeeded = true;
  private metadataDirty = false;
  private reconcileDeletion?: string;
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
    if (this.state.generation?.phase === 'starting') {
      this.checkGeneration('uncertain', this.state.generation.warnings);
    } else if (this.state.generation?.phase === 'validating') {
      this.update({ generation: undefined });
    }
    if (this.state.correction?.phase === 'sending') {
      this.update({ correction: { phase: 'checking' } });
    }
    if (this.state.listingDeletion && ['deleting', 'checking'].includes(this.state.listingDeletion.phase)) {
      this.update({ listingDeletion: { ...this.state.listingDeletion, phase: 'uncertain', error: 'Запрос прерван. Сначала проверьте состояние объявления.' } });
    }
    this.controller?.abort();
    clearTimeout(this.timer);
    this.running = false;
  }

  add(files: File[]) {
    if (!this.active || this.state.listingDeletion || this.state.editing || !this.state.verified || listingLocked(this.state) || this.state.inaccessible) return;
    let count = this.count();
    const uploads = files.map((file): Upload => {
      const error = fileError(file) ?? (count >= 20 ? 'Можно добавить не больше 20 фотографий.' : undefined);
      if (!error) count++;
      return { key: ++this.sequence, name: file.name, ...(error ? { state: 'rejected', error } : { file, state: 'waiting' }) };
    });
    this.update({ uploads: [...this.state.uploads, ...uploads], announcement: `Выбрано файлов: ${files.length}. Отклонено: ${uploads.filter((entry) => entry.state === 'rejected').length}.` });
    void this.pump();
  }

  beginEdit() {
    if (!this.active || this.state.listingDeletion || this.running || !this.state.verified || this.state.inaccessible
      || listingLocked(this.state) || this.deletes.length || this.state.uploads.some((entry) => entry.file)) return;
    this.update({ editing: true, editSavedVersion: undefined });
    return this.state.listing;
  }

  endEdit() { this.update({ editing: false }); void this.pump(); }

  private interruptRead() {
    clearTimeout(this.timer);
    this.controller?.abort();
    this.running = false;
    this.update({ reading: false });
  }

  async reloadEdit(signal: AbortSignal) {
    if (!this.active || !this.state.editing || this.saving || this.pollDelay() > 0) throw new Error('Редактирование недоступно');
    this.interruptRead();
    this.running = true;
    const controller = new AbortController();
    this.controller = controller;
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const listing = await listings.get(this.id, controller.signal);
      if (controller.signal.aborted || signal.aborted) throw new DOMException('Отменено', 'AbortError');
      if (listing.version < (this.state.listing?.version ?? 0)) throw new RequestError('invalid-response', 200);
      const correction = this.state.correction;
      this.update({ listing, verified: true, inaccessible: false, paused: false, error: undefined,
        ...(correction && { correction: { message: correction.message, retryAt: correction.retryAt } }),
      });
      this.recheck(false);
      return listing;
    } finally {
      signal.removeEventListener('abort', cancel);
      if (this.controller === controller) { this.running = false; void this.pump(); }
    }
  }

  async saveEdit(data: ListingData, expectedVersion: number, signal: AbortSignal) {
    if (!this.active || !this.state.editing || this.saving || this.state.inaccessible || correctionLocked(this.state)) throw new Error('Редактирование недоступно');
    this.interruptRead();
    this.saving = true;
    try {
      const listing = await listings.update(this.id, data, expectedVersion, signal);
      if (signal.aborted || !this.active) throw new DOMException('Отменено', 'AbortError');
      this.update({ listing, verified: true, paused: false, error: undefined, editSavedVersion: listing.version });
      if (listing.version !== expectedVersion) this.clearGenerationFeedback();
      this.recheck(false);
      return listing;
    } catch (failure) {
      if (failure instanceof RequestError && failure.code === 'PHOTO_CORRECTION_ACTIVE') this.refreshNeeded = true;
      throw failure;
    } finally { this.saving = false; void this.pump(); }
  }

  beginListingDelete() {
    if (this.state.listingDeletion) return this.state.listingDeletion;
    if (!this.active || this.running || this.saving || this.state.editing || !this.state.verified || this.state.inaccessible
      || listingLocked(this.state) || !this.state.listing || this.deletes.length || this.state.uploads.some((entry) => entry.file)) return;
    clearTimeout(this.timer);
    const listing = this.state.listing;
    const deletion: ListingDeletion = { listing, phase: 'confirm' };
    this.update({ listingDeletion: deletion });
    return deletion;
  }

  cancelListingDelete() {
    const phase = this.state.listingDeletion?.phase;
    if (phase !== 'busy' && (!this.state.verified || phase === 'deleting' || phase === 'checking' || phase === 'uncertain' || phase === 'deleted')) return;
    if (phase === 'busy' && !this.state.verified && this.state.listing?.status !== 'generating') this.refreshNeeded = true;
    this.update({ listingDeletion: undefined });
    void this.pump();
  }

  async confirmListingDelete() {
    const deletion = this.state.listingDeletion;
    if (!this.active || !deletion || listingLocked(this.state) || !['confirm', 'error'].includes(deletion.phase)) return;
    const controller = new AbortController();
    this.controller = controller;
    this.recheck(false);
    this.update({ listingDeletion: { ...deletion, phase: 'deleting', error: undefined } });
    try {
      await listings.remove(this.id, deletion.listing.version, controller.signal);
      if (controller.signal.aborted || !this.active) return;
      this.update({ listingDeletion: { ...deletion, phase: 'deleted' } });
      this.recheck(false);
    } catch (failure) {
      if (controller.signal.aborted || !this.active) return;
      const status = failure instanceof RequestError ? failure.status : undefined;
      const code = failure instanceof RequestError ? failure.code : undefined;
      const phase = status === 401 ? 'uncertain' : status === 403 ? 'denied' : status === 404 ? 'missing'
        : status === 409 ? code === 'LISTING_BUSY' || code === 'PHOTO_CORRECTION_ACTIVE' ? 'busy' : 'conflict'
          : failure instanceof RequestError && failure.kind === 'http' && (status ?? 0) < 500 ? 'error' : 'uncertain';
      const error = phase === 'uncertain' ? 'Не удалось подтвердить удаление. Проверьте подключение и состояние объявления перед новой попыткой.'
        : phase === 'denied' ? 'У вас нет доступа к удалению этого объявления.'
          : phase === 'missing' ? 'Объявление больше недоступно. Вернитесь к списку.'
            : phase === 'conflict' ? 'Объявление изменилось в другом окне. Загрузите актуальную карточку и заново подтвердите удаление.'
              : phase === 'busy' ? code === 'PHOTO_CORRECTION_ACTIVE'
                ? 'Завершите исправление фотографии перед удалением объявления.'
                : 'Удаление недоступно, пока идёт генерация. Дождитесь её завершения и проверьте состояние.'
                : 'Не удалось удалить объявление. Данные сохранены. Повторите попытку вручную.';
      this.update({ listingDeletion: { ...deletion, phase, error }, ...(['denied', 'missing', 'conflict', 'uncertain', 'busy'].includes(phase) ? { verified: false } : {}) });
      if (status === 401) this.recheck(true);
    }
  }

  async checkListingDelete() {
    const deletion = this.state.listingDeletion;
    if (!this.active || this.running || !deletion || ['deleting', 'checking', 'deleted'].includes(deletion.phase)
      || this.pollDelay() > 0) return;
    clearTimeout(this.timer);
    const controller = new AbortController();
    this.controller = controller;
    this.recheck(false);
    this.update({ listingDeletion: { ...deletion, phase: 'checking', error: undefined } });
    try {
      const listing = await listings.get(this.id, controller.signal);
      if (controller.signal.aborted || !this.active) return;
      if (listing.version < deletion.listing.version) throw new RequestError('invalid-response', 200);
      this.update({ listing, verified: true, inaccessible: false, listingDeletion: { listing,
        phase: listing.status === 'generating' || hasPendingCorrection(listing) ? 'busy' : 'confirm',
        error: hasPendingCorrection(listing) ? 'Завершите исправление фотографии перед удалением объявления.'
          : listing.status === 'generating' ? 'Дождитесь завершения генерации и проверьте состояние.' : 'Актуальная карточка загружена. Проверьте данные и подтвердите удаление ещё раз.',
      } });
      this.recheck(false);
      void this.pump();
    } catch (failure) {
      if (controller.signal.aborted || !this.active) return;
      const status = failure instanceof RequestError ? failure.status : undefined;
      const phase = status === 404 ? deletion.phase === 'uncertain' ? 'deleted' : 'missing' : status === 403 ? 'denied' : 'uncertain';
      this.update({ listingDeletion: { ...deletion, phase, error: status === 403 ? 'У вас нет доступа к объявлению.'
        : status === 404 ? 'Объявление больше недоступно.' : 'Не удалось проверить состояние. Данные карточки сохранены. Повторите проверку вручную.' }, verified: false });
      if (status === 401) this.recheck(true);
    }
  }

  count() { return (this.state.listing?.photos.length ?? 0) + this.state.uploads.filter((entry) => entry.file).length; }

  dismiss(key: number) {
    if (listingLocked(this.state)) return;
    this.update({ uploads: this.state.uploads.filter((entry) => entry.key !== key || entry.state === 'uploading') });
  }

  remove(photoId: string) {
    if (!this.active || this.state.listingDeletion || this.state.editing || !this.state.verified || this.state.inaccessible || this.state.paused
      || listingLocked(this.state) || this.deletes.includes(photoId) || this.state.deleting === photoId
      || !this.state.listing?.photos.some((photo) => photo.id === photoId)) return;
    this.deletes.push(photoId);
    void this.pump();
  }

  refresh = () => {
    if (!this.active || this.state.listingDeletion || this.running || this.saving || this.pollDelay() > 0) return;
    this.refreshNeeded = true;
    void this.pump();
  };

  resume = () => {
    if (!this.active || this.state.listingDeletion || this.state.editing || !this.state.verified || this.state.inaccessible || listingLocked(this.state)) return;
    this.update({ paused: false, error: undefined, uploads: this.state.uploads.map((entry) => entry.state === 'error' ? { ...entry, state: 'waiting', error: undefined } : entry) });
    void this.pump();
  };

  refreshCorrection = () => {
    const listing = this.state.listing;
    if (listing?.photoCorrection !== undefined || listing?.photos.some((photo) => photo.improvementType)) this.refresh();
  };

  async changeCorrection(action: CorrectionAction, photoId: string, expectedCorrectionId?: string) {
    const { listing } = this.state;
    if (!this.active || !listing || this.running || this.saving || this.deletes.length || !correctionActionAvailable(this.state)
      || (this.state.correction?.retryAt ?? 0) > Date.now()) return;
    const correction = listing.photoCorrection;
    const photo = listing.photos.find((item) => item.id === photoId && item.status === 'ready');
    if (!photo || (action === 'start' ? correction !== null : correction?.id !== expectedCorrectionId || correction?.photoId !== photoId)) return;
    if ((action === 'retry' && correction?.status !== 'failed') || (action === 'apply' && correction?.status !== 'ready')) return;
    const improvement = action === 'retry' ? correction?.improvementType : photo.improvementType;
    if ((action === 'start' || action === 'retry') && !improvement) return;

    clearTimeout(this.timer);
    this.running = true;
    const controller = new AbortController();
    this.controller = controller;
    this.update({ correction: { phase: 'sending' } });
    try {
      const current = action === 'start' || action === 'retry'
        ? await photoCorrections.start(listing, photoId, improvement!, crypto.randomUUID(), expectedCorrectionId, controller.signal)
        : await photoCorrections.resolve(listing, correction!, action, controller.signal);
      if (controller.signal.aborted) return;
      if (action === 'apply') this.clearGenerationFeedback();
      this.update({ listing: current, correction: undefined, announcement: action === 'apply' ? 'Исправленная фотография применена.'
        : action === 'discard' ? 'Исходная фотография сохранена.' : 'Исправление фотографии запущено.' });
      this.recheck(false);
    } catch (failure) {
      if (controller.signal.aborted) return;
      const error = failure instanceof RequestError ? failure : undefined;
      if (error?.status === 401) {
        this.update({ verified: false, inaccessible: true, error: message(error), correction: { phase: 'checking' } });
        this.recheck(true);
      } else if (error?.status === 429) {
        const retryAt = Date.now() + (error.retryAfterSeconds ?? 1) * 1000;
        this.update({ correction: { retryAt, message: 'Слишком много запросов. Подождите и попробуйте снова' } });
      } else {
        this.refreshNeeded = true;
        this.update({ correction: { phase: 'checking', message: correctionError(error) } });
      }
    } finally {
      if (!controller.signal.aborted) {
        this.running = false;
        void this.pump();
      }
    }
  }

  async generate(channelIds: string[]) {
    const { listing, verified, inaccessible, editing, listingDeletion, uploads } = this.state;
    if (!this.active || !listing || !verified || inaccessible || editing || listingDeletion || this.running || this.saving
      || listingLocked(this.state) || this.deletes.length || uploads.some((entry) => entry.file)
      || !channelIds.length || photoRequirement(listing) || (this.state.generation?.retryAt ?? 0) > Date.now()) return;

    clearTimeout(this.timer);
    this.running = true;
    const controller = new AbortController();
    this.controller = controller;
    const { version } = listing;
    this.update({ generation: { phase: 'validating' } });
    try {
      const report = await generation.validate(this.id, version, controller.signal);
      if (controller.signal.aborted) return;
      if (!report.canGenerate) {
        this.update({ generation: { errors: report.errors, warnings: report.warnings } });
        return;
      }
      this.update({ generation: { phase: 'starting', warnings: report.warnings } });
      const accepted = await generation.start(this.id, version, channelIds, controller.signal);
      if (controller.signal.aborted) return;
      this.update({ listing: retainResult(accepted, listing), generation: { warnings: report.warnings } });
      this.recheck(false);
    } catch (failure) {
      if (controller.signal.aborted) return;
      const error = failure instanceof RequestError ? failure : undefined;
      const starting = this.state.generation?.phase === 'starting';
      const warnings = this.state.generation?.warnings;
      if (error?.status === 409) {
        this.checkGeneration(error.code === 'LISTING_BUSY' ? 'busy' : 'conflict', warnings);
      } else if (starting && (error?.kind !== 'http' || (error.status ?? 0) >= 500)) {
        this.checkGeneration('uncertain', warnings);
      } else if (error?.status === 403 || error?.status === 404) {
        this.checkGeneration('unavailable', warnings);
      } else if (error?.status === 401) {
        this.update({ verified: false, inaccessible: true, error: message(error), generation: undefined });
        this.recheck(true);
      } else if (error?.status === 422 && error.fieldErrors?.length) {
        this.update({ generation: { errors: error.fieldErrors, warnings } });
      } else if (error?.status === 429) {
        const retryAt = Date.now() + (error.retryAfterSeconds ?? 1) * 1000;
        this.update({ generation: { warnings, retryAt, message: 'Слишком много запросов. Подождите и повторите запуск' } });
      } else {
        this.update({ generation: { warnings, message: starting
          ? 'Не удалось запустить генерацию. Попробуйте ещё раз'
          : 'Не удалось проверить данные объявления. Попробуйте ещё раз' } });
      }
    } finally {
      if (!controller.signal.aborted) {
        this.running = false;
        void this.pump();
      }
    }
  }

  private checkGeneration(reconciliation: NonNullable<GenerationState['reconciliation']>, warnings: GenerationState['warnings']) {
    const messages = {
      uncertain: 'Не удалось подтвердить запуск. Проверьте состояние объявления',
      conflict: 'Объявление изменилось. Проверьте актуальные данные перед запуском',
      unavailable: 'Сервер не разрешил запустить генерацию. Попробуйте позже',
    };
    this.refreshNeeded = true;
    this.update({ generation: {
      phase: 'checking', reconciliation, warnings, message: reconciliation === 'busy' ? undefined : messages[reconciliation],
    } });
  }

  private clearGenerationFeedback() {
    if (this.state.generation) {
      const { retryAt, message } = this.state.generation;
      this.update({ generation: retryAt ? { retryAt, message } : undefined });
    }
  }

  private pollDelay() {
    return Math.max(0, (this.state.generation?.pollRetryAt ?? 0) - Date.now(), (this.state.correction?.pollRetryAt ?? 0) - Date.now());
  }

  private scheduleRead(delay: number) {
    this.timer = setTimeout(() => {
      this.refreshNeeded = true;
      void this.pump();
    }, Math.min(delay, 2 ** 31 - 1));
  }

  private async pump() {
    const deletionPhase = this.state.listingDeletion?.phase;
    if (!this.active || (deletionPhase && deletionPhase !== 'busy') || this.running || this.saving) return;
    clearTimeout(this.timer);
    if (this.metadataDirty && !this.state.inaccessible && !this.deletes.length && !this.state.uploads.some((entry) => entry.state === 'waiting')) this.refreshNeeded = true;
    const listing = this.state.listing;
    const read = this.refreshNeeded;
    const pollDelay = this.pollDelay();
    if (read && pollDelay > 0) {
      this.scheduleRead(pollDelay);
      return;
    }
    const mayWrite = !deletionPhase && !this.state.editing && !this.state.paused && this.state.verified && !this.state.inaccessible && !listingLocked(this.state);
    const deletion = !read && mayWrite ? this.deletes.shift() : undefined;
    const upload = !read && mayWrite && !deletion ? this.state.uploads.find((entry) => entry.state === 'waiting') : undefined;
    if (!read && !deletion && !upload) {
      const pollingGeneration = listing?.status === 'generating' && !this.state.inaccessible;
      const pollingCorrection = listing?.photoCorrection?.status === 'processing' && !this.state.inaccessible;
      if (pollingGeneration || pollingCorrection || (this.state.verified && !this.state.inaccessible && listing?.photos.some((photo) => photo.status === 'processing'))) {
        this.scheduleRead(pollingGeneration || pollingCorrection ? Math.max(2000, pollDelay) : 1500);
      }
      return;
    }
    this.running = true;
    const controller = new AbortController();
    this.controller = controller;
    this.refreshNeeded = false;
    if (read) this.metadataDirty = false;
    const launch = this.state.generation;
    this.update({ reading: read, deleting: deletion,
      ...(read && launch?.pollRetryAt && { generation: { ...launch, pollRetryAt: undefined } }),
      ...(upload ? {
        uploads: this.state.uploads.map((entry) => entry.key === upload.key ? { ...entry, state: 'uploading' } : entry),
        announcement: `Загружаем ${upload.name}.`,
      } : {}),
    });
    try {
      if (read) {
        const current = retainResult(await listings.get(this.id, controller.signal), listing);
        if (controller.signal.aborted) return;
        if (listing && current.version < listing.version) throw new RequestError('invalid-response', 200);
        const removed = this.reconcileDeletion && !current.photos.some((photo) => photo.id === this.reconcileDeletion) ? this.reconcileDeletion : undefined;
        this.reconcileDeletion = undefined;
        let available = 20 - current.photos.length;
        const uploads = this.state.uploads.map((entry): Upload => {
          if (!entry.file) return entry;
          if (available-- > 0) return entry;
          return { key: entry.key, name: entry.name, state: 'rejected', error: 'Можно добавить не больше 20 фотографий. Проверьте обновлённую галерею.' };
        });
        const launch = this.state.generation;
        const checked = launch?.phase === 'checking';
        const confirmed = launch?.reconciliation === 'uncertain' && observedGeneration(current, listing);
        const correction = this.state.correction;
        this.update({ listing: current, uploads, verified: true, inaccessible: false,
          ...(removed ? { removed } : {}),
          ...(correction && { correction: { message: correction.message, retryAt: correction.retryAt } }),
          ...(launch && { generation: { ...launch,
            ...(checked && { phase: undefined, reconciliation: undefined, message: confirmed ? undefined : launch.message }),
            pollError: undefined, pollRetryAt: undefined,
          } }),
          ...(listing?.status === 'generating' && current.status !== 'generating' && !uploads.some((entry) => entry.file) ? { paused: false, error: undefined } : {}),
          ...(current.status === 'generating' && (this.state.editing || uploads.some((entry) => entry.file)) ? { paused: true, error: 'Очередь приостановлена до завершения генерации.' } : {}),
          announcement: removed ? 'Фотография удалена.' : current.photos.some((photo) => photo.status === 'processing') ? 'Фотографии обрабатываются.' : 'Состояние фотографий обновлено.',
        });
      } else if (deletion) {
        const result = await photos.remove(this.id, deletion, listing!.version, controller.signal);
        if (controller.signal.aborted) return;
        this.metadataDirty = true;
        this.clearGenerationFeedback();
        this.update({ listing: { ...listing!, version: result.version, status: 'draft', photos: listing!.photos.filter((photo) => photo.id !== deletion),
          ...(listing!.photoCorrection?.photoId === deletion && { photoCorrection: null }) },
          removed: deletion, announcement: 'Фотография удалена.', error: undefined });
      } else if (upload) {
        const result = await photos.upload(this.id, upload.file!, listing!.version, controller.signal);
        if (controller.signal.aborted) return;
        if (listing!.photos.some((photo) => photo.id === result.photo.id) || listing!.photos.length >= 20) throw new RequestError('invalid-response', 201);
        this.metadataDirty = true;
        this.clearGenerationFeedback();
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
      if (read && correctionLocked(this.state) && !inaccessible) {
        const retryAfter = failure instanceof RequestError ? failure.retryAfterSeconds : undefined;
        this.update({ verified: false, correction: { ...this.state.correction,
          pollError: 'Не удалось проверить исправление. Проверьте подключение и попробуйте снова',
          pollRetryAt: retryAfter ? Date.now() + retryAfter * 1000 : undefined,
        } });
        return;
      }
      if (read && generationLocked(this.state) && !inaccessible) {
        const retryAfter = failure instanceof RequestError ? failure.retryAfterSeconds : undefined;
        this.update({ verified: false, generation: { ...this.state.generation,
          pollRetryAt: retryAfter ? Date.now() + Math.max(listing?.status === 'generating' ? 2 : 0, retryAfter) * 1000 : undefined,
          pollError: 'Не удалось обновить состояние. Проверьте подключение и попробуйте ещё раз' } });
        return;
      }
      if (deletion && !inaccessible) this.reconcileDeletion = deletion;
      this.deletes = [];
      this.update({ paused: true, verified: false, inaccessible, error,
        ...(inaccessible && deletionPhase === 'busy' && { listingDeletion: undefined }),
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
