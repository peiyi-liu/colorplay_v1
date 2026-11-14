export type RpcResult = Readonly<{ data: unknown; error: unknown }>;
type StorageResult<T> = PromiseLike<
  Readonly<{ data: T | null; error: unknown }>
>;
export interface MediaUser {
  auth: {
    getUser(jwt: string): PromiseLike<
      Readonly<{
        data: { user: { id: string } | null };
        error: unknown;
      }>
    >;
  };
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
}
export interface MediaService {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<RpcResult>;
  storage: {
    from(bucket: string): {
      remove(paths: string[]): PromiseLike<Readonly<{ error: unknown }>>;
      download(path: string): StorageResult<Blob>;
      upload(
        path: string,
        bytes: Uint8Array,
        options: {
          cacheControl: string;
          contentType: string;
          upsert: boolean;
        },
      ): PromiseLike<Readonly<{ error: unknown }>>;
      createSignedUploadUrl(
        path: string,
        options: { upsert: boolean },
      ): StorageResult<{ token: string }>;
      createSignedUrls(
        paths: string[],
        expiresIn: number,
      ): StorageResult<
        {
          error?: string | null;
          signedUrl: string;
        }[]
      >;
    };
  };
}
export interface MediaProcessed {
  hasAlpha: boolean;
  height: number;
  width: number;
  manifestSha256: string;
  pixelSemanticSha256: string;
  processorVersion: string;
  sourceSha256: string;
  variants: readonly Readonly<{
    bytes: Uint8Array;
    height: number;
    width: number;
    kind: string;
    mimeType: string;
    sha256: string;
    qualityMode: string;
    structuralSimilarityDistortion: number | null;
  }>[];
}
export interface MediaHandlerDependencies {
  credentialsInvalid?: boolean;
  clients(
    authorization: string,
  ): Readonly<{ user: MediaUser; service: MediaService }>;
  process(
    input: Readonly<{
      bytes: Uint8Array;
      declaredMimeType: string;
      semanticRole: 'standard' | 'color_critical';
    }>,
  ): Promise<MediaProcessed>;
  processorFailure(error: unknown): string | null;
}
