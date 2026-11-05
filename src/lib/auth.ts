import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const PASSWORD_HASH_ITERATIONS = 310_000;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BYTES = 32;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 3;

interface LoginAttempts {
	count: number;
	startedAt: number;
	lockedUntil: number;
}

const loginAttempts = new Map<string, LoginAttempts>();

export function hashPassword(password: string, salt = randomBytes(PASSWORD_SALT_BYTES)) {
	const derivedKey = pbkdf2Sync(password, salt, PASSWORD_HASH_ITERATIONS, PASSWORD_HASH_BYTES, 'sha256');
	return Buffer.concat([salt, derivedKey]).toString('base64');
}

export function matchesPassword(candidate: string, encodedHash: string) {
	if (!/^[A-Za-z0-9+/]{64}$/.test(encodedHash)) return false;
	const stored = Buffer.from(encodedHash, 'base64');
	if (stored.length !== PASSWORD_SALT_BYTES + PASSWORD_HASH_BYTES) return false;
	const salt = stored.subarray(0, PASSWORD_SALT_BYTES);
	const expected = stored.subarray(PASSWORD_SALT_BYTES);
	const actual = pbkdf2Sync(candidate, salt, PASSWORD_HASH_ITERATIONS, PASSWORD_HASH_BYTES, 'sha256');
	return timingSafeEqual(actual, expected);
}

export function isLoginLocked(identifier: string, now = Date.now()) {
	const attempts = loginAttempts.get(identifier);
	if (!attempts) return false;
	if (attempts.lockedUntil > now) return true;
	if (attempts.lockedUntil || now - attempts.startedAt >= LOGIN_WINDOW_MS) loginAttempts.delete(identifier);
	return false;
}

export function recordFailedLogin(identifier: string, now = Date.now()) {
	if (isLoginLocked(identifier, now)) return true;
	const previous = loginAttempts.get(identifier);
	const attempts = previous && now - previous.startedAt < LOGIN_WINDOW_MS
		? previous
		: { count: 0, startedAt: now, lockedUntil: 0 };
	attempts.count += 1;
	if (attempts.count >= MAX_LOGIN_ATTEMPTS) attempts.lockedUntil = now + LOGIN_LOCKOUT_MS;
	loginAttempts.set(identifier, attempts);
	return attempts.lockedUntil > now;
}

export function loginLockoutSeconds(identifier: string, now = Date.now()) {
	const attempts = loginAttempts.get(identifier);
	return attempts ? Math.max(1, Math.ceil((attempts.lockedUntil - now) / 1000)) : 0;
}

export function clearLoginAttempts(identifier: string) {
	loginAttempts.delete(identifier);
}

export function createSessionToken(secret: string, issuedAt = Date.now()) {
	const timestamp = issuedAt.toString(36);
	const signature = createHmac('sha256', secret).update(timestamp).digest('hex');
	return `${timestamp}.${signature}`;
}

export function isValidSession(token: string | undefined, secret: string | undefined, now = Date.now()) {
	if (!token || !secret) return false;
	const [timestamp, signature, extra] = token.split('.');
	if (!timestamp || !signature || extra || !/^[a-z0-9]+$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(signature)) return false;
	const issuedAt = Number.parseInt(timestamp, 36);
	if (!Number.isSafeInteger(issuedAt) || issuedAt > now || now - issuedAt > SESSION_TTL_MS) return false;
	const expected = createHmac('sha256', secret).update(timestamp).digest();
	return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}