import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildInvoiceWorkbook } from '../../lib/invoice-workbook';

export const prerender = false;

class InvalidInvoiceError extends Error {}

function text(value: unknown, label: string, maxLength: number) {
	if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
		throw new InvalidInvoiceError(`Revisa el campo ${label}.`);
	}
	return value.trim();
}

function formatInvoiceDate(value: string) {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) throw new InvalidInvoiceError('Revisa la fecha.');
	const [, year, month, day] = match;
	const date = new Date(Number(year), Number(month) - 1, Number(day));
	if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
		throw new InvalidInvoiceError('Revisa la fecha.');
	}
	return `${day}/${month}/${year}`;
}

function safeFilename(value: string) {
	return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60);
}

export const POST: APIRoute = async ({ request }) => {
	if (Number(request.headers.get('content-length')) > 12000) {
		return Response.json({ message: 'Solicitud demasiado grande.' }, { status: 413 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return Response.json({ message: 'Los datos enviados no son válidos.' }, { status: 400 });
	}
	if (!body || typeof body !== 'object') return Response.json({ message: 'Los datos enviados no son válidos.' }, { status: 400 });

	try {
		const data = body as Record<string, unknown>;
		const invoiceNumber = text(data.invoiceNumber, 'número de factura', 24);
		const date = formatInvoiceDate(text(data.invoiceDate, 'fecha', 10));
		const customerName = text(data.customerName, 'cliente', 120);
		const taxId = text(data.taxId, 'CIF / NIF', 32);
		const address = text(data.address, 'dirección', 180);
		const brand = text(data.brand, 'marca', 60);
		const model = text(data.model, 'modelo', 80);
		const registration = text(data.registration, 'matrícula', 16);
		const mileage = text(data.mileage, 'kilometraje', 24).replace(/\s*km\s*$/i, '').trim();
		if (!/\d/.test(mileage) || !/^[\d., ]+$/.test(mileage)) throw new InvalidInvoiceError('Revisa el kilometraje.');
		const price = Number(data.price);
		if (!Number.isFinite(price) || price <= 0 || price > 100_000_000) throw new InvalidInvoiceError('Revisa el precio.');

		const template = await readFile(join(process.cwd(), 'src', 'data', 'plantilla.xlsx'));
		const file = await buildInvoiceWorkbook(template, {
			invoiceNumber,
			date,
			customerName,
			taxId,
			address,
			brand,
			model,
			registration,
			mileage,
			price,
		});
		const filename = `FACTURA_${safeFilename(invoiceNumber)}_${safeFilename(`${brand}_${model}_${registration}`)}.xlsx`;
		return new Response(file, {
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename="${filename}"`,
				'Cache-Control': 'no-store',
			},
		});
	} catch (error) {
		if (error instanceof InvalidInvoiceError) return Response.json({ message: error.message }, { status: 400 });
		return Response.json({ message: 'No se pudo generar la factura Excel.' }, { status: 500 });
	}
};