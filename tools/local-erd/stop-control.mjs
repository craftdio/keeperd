import { createHmac, timingSafeEqual } from 'node:crypto';

export const validStopNonce = (value) =>
    typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);

export function stopProof(token, purpose, nonce) {
    return createHmac('sha256', token)
        .update(`keeperd-stop-v1:${purpose}:${nonce}`)
        .digest('hex');
}

export function matchesStopProof(token, purpose, nonce, candidate) {
    if (typeof candidate !== 'string' || !/^[a-f0-9]{64}$/.test(candidate))
        return false;
    return timingSafeEqual(
        Buffer.from(candidate, 'hex'),
        Buffer.from(stopProof(token, purpose, nonce), 'hex')
    );
}
