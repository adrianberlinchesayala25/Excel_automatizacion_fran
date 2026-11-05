import JSZip from 'jszip';
import XlsxPopulate from 'xlsx-populate';

export interface InvoiceWorkbookData {
	invoiceNumber: string;
	date: string;
	customerName: string;
	taxId: string;
	address: string;
	brand: string;
	model: string;
	registration: string;
	mileage: string;
	price: number;
}

export async function buildInvoiceWorkbook(template: Buffer, invoice: InvoiceWorkbookData) {
	const workbook = await XlsxPopulate.fromDataAsync(template);
	const sheet = workbook.sheet(0);
	sheet.cell('J8').value(invoice.invoiceNumber);
	sheet.cell('J11').value(invoice.date);
	sheet.cell('C11').value(invoice.customerName);
	sheet.cell('C12').value(invoice.taxId);
	sheet.cell('C13').value(invoice.address);
	sheet.cell('C17').value(`${invoice.brand} ${invoice.model} MATRICULA ${invoice.registration}`);
	sheet.cell('C21').value(`KILOMETRAJE ${invoice.mileage}KM`);
	sheet.cell('J17').value(invoice.price);
	sheet.cell('J34').value(invoice.price);
	sheet.cell('J36').value(invoice.price);

	const archive = await JSZip.loadAsync(await workbook.outputAsync());
	const drawingPath = 'xl/drawings/drawing1.xml';
	const drawing = archive.file(drawingPath);
	if (!drawing) throw new Error('La plantilla no contiene el cuadro de texto del cliente.');
	const drawingXml = await drawing.async('string');
	const clientLabel = '<a:t>Cliente</a:t>';
	if (drawingXml.indexOf(clientLabel) === -1 || drawingXml.indexOf(clientLabel) !== drawingXml.lastIndexOf(clientLabel)) {
		throw new Error('No se pudo identificar el rótulo del cliente en la plantilla.');
	}
	archive.file(drawingPath, drawingXml.replace(clientLabel, '<a:t>Cliente:</a:t>'));
	return archive.generateAsync({ type: 'nodebuffer' });
}