import {documentLeadCompletenessScore,documentLeadHasUsefulData,type DocumentLeadExtraction} from "./document-lead";
import {bestDocumentExtraction,parseAamvaBarcode,parseInsuranceDeclarationText} from "./local-document-parser";

export type LocalScanResult={extraction:DocumentLeadExtraction;method:"PDF417 barcode"|"PDF text"|"local OCR"};
type Progress=(label:string)=>void;

let barcodeReady=false;
async function scanBarcode(file:File){
  const {prepareZXingModule,readBarcodes}=await import("zxing-wasm/reader");
  if(!barcodeReady){await prepareZXingModule({fireImmediately:true,overrides:{locateFile:(path,prefix)=>path.endsWith(".wasm")?"/scanner/zxing_reader.wasm":`${prefix}${path}`}});barcodeReady=true}
  const results=await readBarcodes(file,{formats:["PDF417"],tryHarder:true,maxNumberOfSymbols:1});
  return results[0]?.text||"";
}

async function pdfText(file:File){
  const pdfjs=await import("pdfjs-dist");pdfjs.GlobalWorkerOptions.workerSrc="/scanner/pdf.worker.min.mjs";
  const document=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;let text="";
  try{
    for(let number=1;number<=document.numPages;number+=1){const page=await document.getPage(number);const content=await page.getTextContent();text+=content.items.map(item=>"str" in item?`${item.str}${item.hasEOL?"\n":" "}`:"").join("")+"\n"}
    return text;
  }finally{await document.destroy()}
}

async function imageVariants(file:File){
  const bitmap=await createImageBitmap(file);try{const largest=Math.max(bitmap.width,bitmap.height);const scale=Math.min(1,2600/largest);const width=Math.round(bitmap.width*scale);const height=Math.round(bitmap.height*scale);const rotations=bitmap.height>bitmap.width*1.08?[0,-90] as const:[0] as const;return rotations.map(rotation=>{const canvas=document.createElement("canvas");canvas.width=rotation?height:width;canvas.height=rotation?width:height;const context=canvas.getContext("2d");if(!context)throw new Error("Image preparation failed");context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";if(rotation){context.translate(0,canvas.height);context.rotate(-Math.PI/2)}context.drawImage(bitmap,0,0,width,height);return canvas.toDataURL("image/jpeg",.94)})}finally{bitmap.close()}
}

async function ocr(file:File,progress:Progress){
  const {createWorker}=await import("tesseract.js");
  const worker=await createWorker("eng",1,{workerPath:"/scanner/tesseract-worker.min.js",langPath:"/scanner",corePath:"/scanner/tesseract-core",logger:event=>{if(event.status==="recognizing text")progress(`Reading ${Math.round((event.progress||0)*100)}%`)}});
  try{let best={text:"",score:-1};for(const image of await imageVariants(file)){const result=await worker.recognize(image);const extraction=bestDocumentExtraction(result.data.text);const score=documentLeadCompletenessScore(extraction);if(score>best.score)best={text:result.data.text,score}}return best.text}finally{await worker.terminate()}
}

export async function scanDocumentLocally(file:File,progress:Progress=()=>{}):Promise<LocalScanResult>{
  const isPdf=file.type==="application/pdf"||/\.pdf$/i.test(file.name);
  if(isPdf){progress("Reading PDF");const rawText=await pdfText(file);const extraction=parseInsuranceDeclarationText(rawText);if(documentLeadHasUsefulData(extraction))return {extraction,method:"PDF text"};throw new Error("No policy details were found in this PDF")}
  progress("Checking barcode");try{const rawText=await scanBarcode(file);if(rawText){const extraction=parseAamvaBarcode(rawText);if(documentLeadHasUsefulData(extraction))return {extraction,method:"PDF417 barcode"}}}catch{}
  progress("Reading photo");const rawText=await ocr(file,progress);const extraction=bestDocumentExtraction(rawText);if(!documentLeadHasUsefulData(extraction))throw new Error("The document was not clear enough. Try the license back barcode or a flatter, sharper photo.");return {extraction,method:"local OCR"};
}
