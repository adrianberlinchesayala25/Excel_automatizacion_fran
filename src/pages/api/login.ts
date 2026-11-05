import type { APIRoute } from 'astro';
import {
	clearLoginAttempts,
	createSessionToken,
	isLoginLocked,
	loginLockoutSeconds,
	matchesPassword,
	recordFailedLogin,
} from '../../lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
	const passwordHash = import.meta.env.APP_PASSWORD_HASH;
	const sessionSecret = import.meta.env.APP_SESSION_SECRET;
	if (!passwordHash || !sessionSecret) return Response.json({ message: 'Falta configurar el acceso.' }, { status: 503 });
	if (Number(request.headers.get('content-length')) > 4096) return Response.json({ message: 'Solicitud demasiado grande.' }, { status: 413 });
	const identifier = clientAddress || 'unknown';
	if (isLoginLocked(identifier)) {
		return Response.json({ message: 'Demasiados intentos. Espera 15 minutos.' }, {
			status: 429,
			headers: { 'Retry-After': String(loginLockoutSeconds(identifier)) },
		});
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ message: 'Solicitud no válida.' }, { status: 400 });
	}
	const password = body && typeof body === 'object' && 'password' in body ? body.password : undefined;
	if (typeof password !== 'string' || password.length > 256 || !matchesPassword(password, passwordHash)) {
		if (recordFailedLogin(identifier)) {
			return Response.json({ message: 'Demasiados intentos. Espera 15 minutos.' }, {
				status: 429,
				headers: { 'Retry-After': String(loginLockoutSeconds(identifier)) },
			});
		}
		return Response.json({ message: 'Credenciales no válidas.' }, { status: 401 });
	}
	clearLoginAttempts(identifier);

	cookies.set('auth_session', createSessionToken(sessionSecret), {
		httpOnly: true,
		secure: import.meta.env.PROD,
		sameSite: 'strict',
		path: '/',
		maxAge: 8 * 60 * 60,
	});
	return Response.json({ message: 'Acceso correcto.' });
};