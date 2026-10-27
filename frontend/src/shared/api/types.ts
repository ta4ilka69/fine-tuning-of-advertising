export type User = {
  id: string;
  login: string;
  role: 'agent' | 'admin';
};

export type Session = { user: User };
export type LoginRequest = { login: string; password: string };
export type RegisterRequest = { login: string; password: string };

export type ListingSummary = {
  id: string;
  version: number;
  address: string | null;
  dealType: 'sale' | 'long_term_rent' | 'short_term_rent' | null;
  propertyType: 'flat' | 'room' | 'house' | 'apartments' | null;
  price: { amount: string; currency: 'RUB' } | null;
  latestGenerationStatus: 'queued' | 'running' | 'succeeded' | 'failed' | null;
  generatedForVersion: number | null;
  createdAt: string;
  updatedAt: string;
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
