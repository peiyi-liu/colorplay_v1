const textEncoder = new TextEncoder();

export const readClientIp = (request: Request): string => {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const [clientIp] = forwarded.split(',');
    if (clientIp?.trim()) return clientIp.trim();
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
};

export const hashClassroomJoinIp = async (
  request: Request,
  secret: string,
): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    textEncoder.encode(readClientIp(request)),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};
