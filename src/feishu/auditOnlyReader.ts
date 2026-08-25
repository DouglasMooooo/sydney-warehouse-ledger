import { readRange, type ReadTypedTableInput } from './read.js';
import type { WarehouseSheetReader } from './sheetReader.js';
import type { FeishuCell, TypedSheetData } from './types.js';

export interface ReviewedSheetDimension {lastColumn:string;rowCount:number;numericColumns?:readonly string[]}

/** Read-only, positional reader for audit/migration tooling; it has no mutation dependency. */
export class AuditOnlyPositionalReader implements WarehouseSheetReader {
  constructor(private readonly spreadsheetUrl:string,private readonly dimensions:Readonly<Record<string,ReviewedSheetDimension>>){ }
  async readTable(input:Omit<ReadTypedTableInput,'spreadsheetUrl'>):Promise<TypedSheetData>{
    const sheetId=input.sheetId;if(!sheetId)throw new Error('Audit reader requires stable sheetId.');const dimension=this.dimensions[sheetId];if(!dimension)throw new Error(`Audit reader has no reviewed dimension for sheet ${sheetId}.`);
    const rows:Array<Array<string|number|boolean|null>>=[];let columns:string[]=[];
    for(let start=1;start<=dimension.rowCount;start+=250){const end=Math.min(start+249,dimension.rowCount),data=readRange({spreadsheetUrl:this.spreadsheetUrl,sheetId,range:`A${start}:${dimension.lastColumn}${end}`,include:['value']});
      for(const range of data.ranges){columns=range.col_indices;for(let index=0;index<range.cells.length;index++){const rowNumber=range.row_indices[index];if(rowNumber===undefined)continue;rows[rowNumber-1]=Array.from({length:columns.length},(_,column)=>scalar(range.cells[index]?.[column],columns[column]!,dimension));}}}
    const width=columns.length;for(let index=0;index<dimension.rowCount;index++)rows[index]??=Array(width).fill(null);while(rows.length>0&&rows.at(-1)?.every(value=>value===null||value===''))rows.pop();
    if(input.noHeader)return {name:sheetId,range:`A1:${dimension.lastColumn}${rows.length}`,columns,data:rows,dtypes:Object.fromEntries(columns.map(column=>[column,'string']))};
    const header=rows[0]??[],headers=Array.from({length:width},(_,index)=>String(header[index]??columns[index]??`col${index+1}`));return {name:sheetId,range:`A1:${dimension.lastColumn}${rows.length}`,columns:headers,data:rows.slice(1),dtypes:Object.fromEntries(headers.map(column=>[column,'string']))};
  }
  async healthCheck():Promise<boolean>{return true;}
}

function scalar(cell:FeishuCell|undefined,column:string,dimension:ReviewedSheetDimension):string|number|boolean|null{const value=cell?.value;if(value===undefined||value===null)return null;if(dimension.numericColumns?.includes(column)&&typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value)))return Number(value);return typeof value==='string'||typeof value==='number'||typeof value==='boolean'?value:String(value);}
