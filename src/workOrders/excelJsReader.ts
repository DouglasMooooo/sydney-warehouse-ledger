import ExcelJS from 'exceljs';
import type { XlsxWorkbookData, XlsxWorkbookReader } from './xlsxParser.js';

export const MAX_WORK_ORDER_XLSX_BYTES = 5 * 1024 * 1024;

export class XlsxUploadError extends Error {
  constructor(readonly code: 'UNSUPPORTED_FILE_TYPE' | 'FILE_TOO_LARGE' | 'XLSX_DECODE_FAILED', message: string) {
    super(message);
  }
}

export class ExcelJsWorkbookReader implements XlsxWorkbookReader {
  async read(bytes: Uint8Array): Promise<XlsxWorkbookData> {
    if (bytes.byteLength > MAX_WORK_ORDER_XLSX_BYTES) {
      throw new XlsxUploadError('FILE_TOO_LARGE', `XLSX exceeds ${MAX_WORK_ORDER_XLSX_BYTES} bytes.`);
    }
    if (bytes.byteLength < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new XlsxUploadError('XLSX_DECODE_FAILED', 'File is not an XLSX ZIP package.');
    }
    try {
      const workbook = new ExcelJS.Workbook();
      const payload = Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0];
      await workbook.xlsx.load(payload);
      return {
        sheets: workbook.worksheets.map((sheet) => {
          const rows: unknown[][] = [];
          for (let rowNumber = 1; rowNumber <= sheet.actualRowCount; rowNumber += 1) {
            const source = sheet.getRow(rowNumber);
            const row: unknown[] = [];
            for (let column = 1; column <= Math.max(source.actualCellCount, sheet.actualColumnCount); column += 1) {
              row.push(cellValue(source.getCell(column).value));
            }
            rows.push(row);
          }
          return { name: sheet.name, rows };
        }),
      };
    } catch (error) {
      if (error instanceof XlsxUploadError) throw error;
      throw new XlsxUploadError('XLSX_DECODE_FAILED', 'Unable to decode XLSX workbook.');
    }
  }
}

export function validateXlsxUpload(fileName: string, size: number): void {
  if (!/\.xlsx$/i.test(fileName.trim())) {
    throw new XlsxUploadError('UNSUPPORTED_FILE_TYPE', 'Only .xlsx files are accepted.');
  }
  if (size <= 0) throw new XlsxUploadError('XLSX_DECODE_FAILED', 'XLSX file is empty.');
  if (size > MAX_WORK_ORDER_XLSX_BYTES) {
    throw new XlsxUploadError('FILE_TOO_LARGE', `XLSX exceeds ${MAX_WORK_ORDER_XLSX_BYTES} bytes.`);
  }
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;
  if ('result' in value) return cellValue(value.result ?? null);
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('text' in value) return value.text;
  return String(value);
}
