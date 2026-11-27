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

export type PhotoQuality = 'good' | 'needs_fix' | 'unfit';
export type PhotoImprovement = 'clutter';

export type Photo = {
  id: string;
  listingId: string;
  fileName: string;
  mimeType: 'image/jpeg' | 'image/png';
  sizeBytes: number;
  status: 'processing' | 'ready' | 'failed';
  contentUrl: string | null;
  thumbnailUrl: string | null;
  quality: PhotoQuality | null;
  qualityReason: string | null;
  qualityLabel?: string | null;
  scene?: string | null;
  description?: string | null;
  improvementType?: PhotoImprovement | null;
  improvementLabel?: string | null;
  editInstruction?: string | null;
  error: Problem | null;
};

export type PhotoMutation = { version: number; photo: Photo };

export type PhotoCorrection = { id: string; photoId: string; improvementType: PhotoImprovement } & (
  | { status: 'processing' }
  | { status: 'ready'; previewUrl: string }
  | { status: 'failed'; error: Problem }
);

export type ListingOverview = ListingSummary & { isApartments: boolean; photos: Photo[] };

export type GenerationResult = {
  score?: number;
  why?: { plus: boolean; text: string }[];
  channels: ChannelResult[];
};

export type ChannelResult = {
  channelVersionId: string;
  channel: { id: string; name: string };
  title: string;
  text: string;
  score: number;
  scoreReason: string;
  photoIds: string[];
  photos?: { top: { photo_id: string; why: string }[] };
};

export type Listing = ListingOverview & {
  data: ListingData;
  result: GenerationResult | null;
  generationError: Problem | null;
  photoCorrection?: PhotoCorrection | null;
  photoCorrectionRevision?: number;
};

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
