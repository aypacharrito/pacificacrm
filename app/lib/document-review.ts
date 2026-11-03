import {cleanDocumentLeadExtraction,documentLeadName,type DocumentLeadExtraction} from "./document-lead";
export function documentMissingFields(value:DocumentLeadExtraction){
 if(!/licen[cs]e|identification|\bid card\b/i.test(value.documentType)&&!value.licenseNumber)return [];
 return [["Full name",documentLeadName(value)],["Date of birth",value.dateOfBirth],["Street address",value.address],["City",value.city],["State",value.state],["ZIP",value.zip],["License number",value.licenseNumber],["License state",value.licenseState],["Expiration date",value.licenseExpiration]].filter(([,data])=>!data).map(([label])=>label);
}
/** Combine only visible values. Barcode fields outrank OCR; conflicts remain reviewable. */
export function combineDocumentReads(primary:DocumentLeadExtraction,secondary:DocumentLeadExtraction){
 const result=cleanDocumentLeadExtraction(primary),other=new Map(result.otherFields.map(item=>[item.label.toLowerCase(),item]));
 for(const key of Object.keys(result) as Array<keyof DocumentLeadExtraction>){if(key==="otherFields")continue;if(!result[key])result[key]=secondary[key];else if(secondary[key]&&result[key]!==secondary[key]&&["firstName","lastName","fullName","dateOfBirth","address","city","state","zip","licenseNumber","licenseState","licenseExpiration","policyNumber","vin"].includes(key)){const label=`Review ${key}`;other.set(label,{label,value:`Read 1: ${result[key]}; read 2: ${secondary[key]}`})}}
 for(const item of secondary.otherFields)if(!other.has(item.label.toLowerCase()))other.set(item.label.toLowerCase(),item);result.otherFields=[...other.values()].slice(0,80);return result;
}
