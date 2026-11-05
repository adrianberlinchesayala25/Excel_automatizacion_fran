import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = ({ cookies }) => {
	cookies.delete('auth_session', { path: '/' });
	return Response.json({ message: 'Sesión cerrada.' });
};