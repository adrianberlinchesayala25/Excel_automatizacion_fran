import { defineMiddleware } from 'astro:middleware';
import { isValidSession } from './lib/auth';

export const onRequest = defineMiddleware(({ url, cookies, redirect }, next) => {
	const path = url.pathname;
	if (path.startsWith('/_astro/') || path === '/favicon.ico' || path === '/favicon.svg') return next();

	const authenticated = isValidSession(cookies.get('auth_session')?.value, import.meta.env.APP_SESSION_SECRET);
	if (path === '/api/login') return next();
	if (path === '/login') return authenticated ? redirect('/') : next();
	if (!authenticated) return redirect('/login');
	return next();
});