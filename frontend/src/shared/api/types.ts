export type User = {
  id: string;
  login: string;
  role: 'agent' | 'admin';
};

export type Session = { user: User };
export type LoginRequest = { login: string; password: string };
export type RegisterRequest = { login: string; password: string };

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
