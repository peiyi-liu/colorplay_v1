export type SignInInput = Readonly<{
  email: string;
  password: string;
}>;

export type AuthSession = Readonly<{
  userId: string;
  email: string;
}>;

export type AuthErrorCode =
  'AUTH_INVALID_CREDENTIALS' | 'AUTH_NETWORK' | 'AUTH_UNKNOWN';

export class AuthRepositoryError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthRepositoryError';
  }
}

export type AuthStateListener = (session: AuthSession | null) => void;

export interface AuthRepository {
  signIn(input: SignInInput): Promise<AuthSession>;
  signOut(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
  onAuthStateChange(listener: AuthStateListener): () => void;
}
