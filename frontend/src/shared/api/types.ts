import type { ListingData } from './listing-data';

export type User = {
  id: string;
  login: string;
  role: 'agent' | 'admin';
};

export type Session = { user: User };
export type LoginRequest = { login: string; password: string };
export type RegisterRequest = { login: string; password: string };

export type ListingStatus = 'draft' | 'generating' | 'ready' | 'failed';

export type ListingSummary = {
  id: string;
  version: number;
  address: string | null;
  dealType: 'sale' | 'rent' | 'daily_rent' | null;
  objectType: 'flat' | 'room' | 'house' | null;
  price: number | null;
  status: ListingStatus;
  hasResult: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Photo = {
  id: string;
  listingId: string;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png';
  sizeBytes: number;
  status: 'processing' | 'ready' | 'failed';
  contentUrl: string | null;
  thumbnailUrl: string | null;
  error: Problem | null;
};

export type PhotoMutation = { version: number; photo: Photo };

export type ListingOverview = ListingSummary & { isApartments: boolean; photos: Photo[] };

export type GenerationResult = { channels: {
  channelVersionId: string;
  channel: { id: string; name: string };
  title: string;
  text: string;
  score: number;
  scoreReason: string;
  photoIds: string[];
}[] };

export type Listing = ListingOverview & { data: ListingData; result: GenerationResult | null; generationError: Problem | null };

export type ListingPage = { items: ListingSummary[]; nextCursor: string | null };

export type FieldIssue = { code: string; field: string; message: string };

export type Problem = {
  type: string;
  title: string;
  status: number;
  code: string;
  requestId: string;
  detail?: string;
  fieldErrors?: FieldIssue[];
  currentVersion?: number;
};
