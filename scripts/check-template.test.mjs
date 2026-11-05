import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import JSZip from 'jszip';
import XlsxPopulate from 'xlsx-populate';
import { buildInvoiceWorkbook } from '../src/lib/invoice-workbook.ts';
import {
	clearLoginAttempts,
	createSessionToken,
	hashPassword,
	isLoginLocked,
	isValidSession,
	loginLockoutSeconds,
	matchesPassword,
	recordFailedLogin,
} from '../src/lib/auth.ts';

test('invoice values replace template data and preserve each target cell style', async () => {
	const template = await readFile(new URL('../src/data/plantilla.xlsx', import.meta.url));
	const original = await XlsxPopulate.fromDataAsync(template);
	const originalSheet = original.sheet(0);
	const targets = ['J8', 'J11', 'C11', 'C12', 'C13', 'C17', 'C21', 'J17', 'J34', 'J36'];
	const styleKeys = ['bold', 'italic', 'fontSize', 'fontFamily', 'horizontalAlignment', 'verticalAlignment', 'wrapText', 'numberFormat'];
	const styles = Object.fromEntries(targets.map((address) => [address, originalSheet.cell(address).style(styleKeys)]));
	const generated = await buildInvoiceWorkbook(template, {
		invoiceNumber: 'FTEST', date: '05/11/2026', customerName: 'Cliente de prueba', taxId: 'B12345678',
		address: 'Calle de prueba 1', brand: 'RENAULT', model: 'CAPTUR', modelYear: 2020, registration: '6732-JKM', mileage: '123.456', price: 2500.5,
	});
	const result = await XlsxPopulate.fromDataAsync(generated);
	const sheet = result.sheet(0);
	const expected = {
		J8: 'FTEST', J11: '05/11/2026', C11: 'Cliente de prueba', C12: 'B12345678',
		C13: 'Calle de prueba 1', C17: 'RENAULT CAPTUR AÑO 2020 MATRICULA 6732-JKM', C21: 'KILOMETRAJE 123.456KM',
		J17: 2500.5, J34: 2500.5, J36: 2500.5,
	};
	for (const [address, value] of Object.entries(expected)) {
		assert.equal(sheet.cell(address).value(), value, `${address} value`);
		assert.deepEqual(sheet.cell(address).style(styleKeys), styles[address], `${address} style`);
	}
	const inputZip = await JSZip.loadAsync(template);
	const outputZip = await JSZip.loadAsync(generated);
	const drawingPath = 'xl/drawings/drawing1.xml';
	const originalDrawing = await inputZip.file(drawingPath).async('string');
	const outputDrawing = await outputZip.file(drawingPath).async('string');
	assert.equal(outputDrawing, originalDrawing.replace('<a:t>Cliente</a:t>', '<a:t>Cliente:</a:t>'));
});

test('password verifier is salted base64 and session tokens are signed and expire', () => {
	const now = Date.now();
	const hash = hashPassword('correct');
	assert.match(hash, /^[A-Za-z0-9+/]{64}$/);
	assert.notEqual(hash, 'correct');
	assert.equal(matchesPassword('correct', hash), true);
	assert.equal(matchesPassword('incorrect', hash), false);
	assert.equal(matchesPassword('correct', 'not-a-hash'), false);
	const token = createSessionToken('a-test-secret', now);
	assert.equal(isValidSession(token, 'a-test-secret', now + 1000), true);
	assert.equal(isValidSession(`${token}x`, 'a-test-secret', now), false);
	assert.equal(isValidSession(token, 'another-secret', now), false);
	assert.equal(isValidSession(token, 'a-test-secret', now + 8 * 60 * 60 * 1000 + 1), false);
});

test('three failed logins lock an identifier for fifteen minutes', () => {
	const identifier = 'auth-lockout-test';
	const now = Date.now();
	clearLoginAttempts(identifier);
	assert.equal(recordFailedLogin(identifier, now), false);
	assert.equal(recordFailedLogin(identifier, now + 1000), false);
	assert.equal(recordFailedLogin(identifier, now + 2000), true);
	assert.equal(isLoginLocked(identifier, now + 3000), true);
	assert.equal(loginLockoutSeconds(identifier, now + 3000), 899);
	assert.equal(isLoginLocked(identifier, now + 15 * 60 * 1000 + 2000), false);
});