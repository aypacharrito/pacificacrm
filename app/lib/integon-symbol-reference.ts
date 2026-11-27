// Local reference to the five public SS5 attachments in SERFF GMMX-134286985 (CA 24-2128).
// Only the selected file is read; no table, masked key, or file is sent to a server.
const sheets = [
  {sourceFile: 'SS5_Pre90.pdf', years:[1981,1989], pages: 504, size: 563361, sha256: '67be10a8619e34a695af4bcbce2b3d342566e1cdc7205114c83e3553704c1c0e'},
  {sourceFile: 'SS5_1990_2010.pdf', years:[1990,2010], pages: 1124, size: 1178646, sha256: 'f97af7570f0258dea1bf7cc50720bce3e3e29e261504c400e10d6b0ef0214635'},
  {sourceFile: 'SS5_2011_2015.pdf', years:[2011,2015], pages: 752, size: 719448, sha256: 'a16f7d7749e2946e22383c8ef5751e98c5c92cdd82fcc6d1624d3248202641d4'},
  {sourceFile: 'SS5_2016_2020.pdf', years:[2016,2020], pages: 905, size: 869558, sha256: '1c07b988205696480d44cee1644e46d7f5107ae88f61ed266ef7c81dbabaabd8'},
  {sourceFile: 'SS5_2021_.pdf', years:[2021,2025], pages: 662, size: 645005, sha256: '46d673dcf65a5f45fcc366e51e95c452cc9db3848bc4a9ef1c833f488e5ba192'},
] as const;

export type SymbolReferenceResult =
  | {state:'matched'; symbolSet5:string; make:string; model:string; sourceFile:string; page:number; filing:'GMMX-134286985'; stateTracking:'24-2128'}
  | {state:'missing' | 'ambiguous' | 'invalid-source'; sourceFile?:string; reason?:string};
export type SymbolReferenceProgress = {page:number; totalPages:number};

type TextItem = {str:string; transform:number[]; width?:number};
type Row = {maskedKey:string; year:string; make:string; model:string; symbolSet5:string};
type LocatedRow = {row:Row; page:number};

function abortIfNeeded(signal?:AbortSignal) {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('Lookup canceled', 'AbortError');
}

// Geometry is based on the five column headers, not a flattened page string. A model can contain spaces,
// and text extraction can split a single cell into several items.
export function parseSymbolPage(items:TextItem[], previousColumns?:number[]): {recognized:boolean; rows:Row[]; columns?:number[]} {
  const entries = items.filter(item => typeof item.str === 'string' && item.str.trim() &&
    Number.isFinite(item.transform?.[4]) && Number.isFinite(item.transform?.[5]))
    .map(item => ({value:item.str.trim(), x:item.transform[4], y:item.transform[5]}));
  const lines:{y:number; entries:typeof entries}[] = [];
  for (const item of entries.sort((a,b) => b.y-a.y || a.x-b.x)) {
    const line = lines.find(row => Math.abs(row.y-item.y) <= 1.2);
    if (line) line.entries.push(item);
    else lines.push({y:item.y,entries:[item]});
  }
  const names = ['VIN','Year','Make','Model','SymbolSet5'];
  let headerIndex = -1;
  let positions:number[] = [];
  for (const [index,line] of lines.entries()) {
    const found = names.map(name => line.entries.find(item => item.value === name)?.x);
    if (found.every(x => typeof x === 'number') && found.every((x,i) => i === 0 || x! > found[i-1]!)) {
      headerIndex = index;
      positions = found as number[];
      break;
    }
  }
  if (headerIndex < 0 && previousColumns) positions = previousColumns;
  const validColumns = positions.length === 5 &&
    positions.every((x,i) => x > [40,125,155,190,270][i] && x < [80,155,200,250,345][i]);
  if (!validColumns) return {recognized:false,rows:[]};
  const boundaries = positions.slice(0,-1).map((x,i) => (x+positions[i+1])/2);
  const rows:Row[] = [];
  for (const line of lines.slice(headerIndex+1)) {
    const columns:string[][] = [[],[],[],[],[]];
    const coordinates:number[][] = [[],[],[],[],[]];
    for (const item of line.entries.sort((a,b) => a.x-b.x)) {
      const column = boundaries.findIndex(limit => item.x < limit);
      const index = column < 0 ? 4 : column;
      columns[index].push(item.value);
      coordinates[index].push(item.x);
    }
    const [maskedKey,year,make,model,symbolSet5] = columns.map((parts,index) =>
      index < 2 || index === 4 ? parts.join('').replace(/\s+/g,'').toUpperCase() : parts.join(' ').trim().toUpperCase());
    if (/^[A-Z0-9*&]{10}$/.test(maskedKey) && maskedKey.includes('*') && /^(?:19|20)\d{2}$/.test(year) &&
        [0,1,2,3,4].every(index => coordinates[index].length && Math.abs(coordinates[index][0]-positions[index]) <= 9)) {
      rows.push({maskedKey,year,make,model,symbolSet5});
    }
  }
  return {recognized:rows.length > 0,rows,columns:positions};
}

export function decideSymbolRows(rows:LocatedRow[], sourceFile:string):SymbolReferenceResult {
  const unique = new Map<string,LocatedRow>();
  for (const item of rows) {
    const identity = [item.row.symbolSet5,item.row.make,item.row.model].join('\0');
    if (!unique.has(identity)) unique.set(identity,item);
  }
  if (!unique.size) return {state:'missing',sourceFile};
  if (unique.size > 1) return {state:'ambiguous',sourceFile,reason:'The filed sheet contains conflicting rows for this masked key and year.'};
  const {row,page} = [...unique.values()][0];
  return {state:'matched',symbolSet5:row.symbolSet5,make:row.make,model:row.model,
    sourceFile,page,filing:'GMMX-134286985',stateTracking:'24-2128'};
}

export async function lookupSelectedSymbolSheet(
  file:File, maskedKey:string, year:string|number,
  {signal,onProgress,pdfjsLoader}:{signal?:AbortSignal;onProgress?:(progress:SymbolReferenceProgress)=>void;
    pdfjsLoader?:()=>Promise<typeof import('pdfjs-dist')>} = {},
):Promise<SymbolReferenceResult> {
  const key = String(maskedKey).trim().toUpperCase();
  const modelYear = String(year).trim();
  if (!/^[A-Z0-9*&]{10}$/.test(key) || !key.includes('*') || !/^(?:19|20)\d{2}$/.test(modelYear)) {
    return {state:'invalid-source',reason:'Enter an exact ten-character filed masked key containing * and a four-digit model year. A literal & is accepted where the filing uses it.'};
  }
  abortIfNeeded(signal);
  if (!sheets.some(source => source.size === file.size)) {
    return {state:'invalid-source',reason:'The selected file size does not match an approved SS5 attachment.'};
  }
  const bytes = await file.arrayBuffer();
  abortIfNeeded(signal);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value => value.toString(16).padStart(2,'0')).join('');
  abortIfNeeded(signal);
  const sheet = sheets.find(source => source.sha256 === digest);
  if (!sheet) return {state:'invalid-source',reason:'Select one of the five exact public SS5 filing attachments.'};
  if (Number(modelYear) < sheet.years[0] || Number(modelYear) > sheet.years[1]) {
    return {state:'missing',sourceFile:sheet.sourceFile,reason:'This model year is outside the selected approved sheet.'};
  }
  const pdfjs = await (pdfjsLoader ? pdfjsLoader() : import('pdfjs-dist'));
  if (typeof window !== 'undefined') pdfjs.GlobalWorkerOptions.workerSrc = '/scanner/pdf.worker.min.mjs';
  abortIfNeeded(signal);
  const task = pdfjs.getDocument({data:new Uint8Array(bytes)});
  const cancel = () => { void task.destroy(); };
  signal?.addEventListener('abort',cancel,{once:true});
  let document:Awaited<typeof task.promise>|undefined;
  try {
    document = await task.promise;
    abortIfNeeded(signal);
    if (document.numPages !== sheet.pages) return {state:'invalid-source',sourceFile:sheet.sourceFile,reason:'The approved PDF page count did not match.'};
    onProgress?.({page:0,totalPages:document.numPages});
    const matches:LocatedRow[] = [];
    let columns:number[]|undefined;
    for (let pageNumber=1;pageNumber<=document.numPages;pageNumber++) {
      abortIfNeeded(signal);
      const page = await document.getPage(pageNumber);
      try {
        const text = await page.getTextContent();
        abortIfNeeded(signal);
        const parsed = parseSymbolPage(text.items as TextItem[],columns);
        if (!parsed.recognized) return {state:'invalid-source',sourceFile:sheet.sourceFile,reason:`Page ${pageNumber} did not have readable SS5 columns.`};
        columns = parsed.columns;
        for (const row of parsed.rows) {
          if (row.maskedKey !== key || row.year !== modelYear) continue;
          if (!/^[A-Z0-9]{6}$/.test(row.symbolSet5) || !row.make || !row.model) {
            return {state:'invalid-source',sourceFile:sheet.sourceFile,reason:`Page ${pageNumber} had an unreadable matching row.`};
          }
          matches.push({row,page:pageNumber});
        }
      } finally { page.cleanup(); }
      onProgress?.({page:pageNumber,totalPages:document.numPages});
    }
    return decideSymbolRows(matches,sheet.sourceFile);
  } catch(error) {
    abortIfNeeded(signal);
    throw error;
  } finally {
    signal?.removeEventListener('abort',cancel);
    await (document?.destroy() ?? task.destroy());
  }
}
