import {cleanDocumentLeadExtraction} from './document-lead';
export const contactIntakeFields=['address','zip','dateOfBirth','licenseNumber','licenseState','licenseExpiration','policyNumber','policyEffectiveDate','policyExpirationDate','vin','vehicle'] as const;
export type ContactIntakeDetails=Partial<Record<typeof contactIntakeFields[number],string>>;
const aliases:Record<string,string>={streetaddress:'address',address:'address',zipcode:'zip',postalcode:'zip',zip:'zip',dob:'dateOfBirth',dateofbirth:'dateOfBirth',birthdate:'dateOfBirth',dl:'licenseNumber',dlnumber:'licenseNumber',driverlicensenumber:'licenseNumber',driverslicensenumber:'licenseNumber',licensenumber:'licenseNumber',licensestate:'licenseState',driverlicensestate:'licenseState',licenseexpiration:'licenseExpiration',driverlicenseexpiration:'licenseExpiration',policynumber:'policyNumber',policyeffectivedate:'policyEffectiveDate',policyexpirationdate:'policyExpirationDate',vin:'vin',vehicleidentificationnumber:'vin',vehicle:'vehicle'};
export function contactIntakeDetails(value:ContactIntakeDetails&{otherFields?:Array<{label:string;value:string}>}){
 const fields:Record<string,string>={};
 for(const item of value.otherFields||[]){const key=aliases[String(item.label).toLowerCase().replace(/[^a-z]/g,'')];if(key&&!fields[key])fields[key]=String(item.value||'').trim().slice(0,240)}
 for(const key of contactIntakeFields)if(value[key])fields[key]=String(value[key]).trim().slice(0,240);
 const clean=cleanDocumentLeadExtraction(fields);
 return Object.fromEntries(contactIntakeFields.map(key=>[key,key==='vehicle'?fields.vehicle||'':clean[key]])) as Record<typeof contactIntakeFields[number],string>;
}
export function contactIntakeCanSave(value:ContactIntakeDetails&{name?:string;phone?:string;email?:string;otherFields?:Array<{label:string;value:string}>}){
 const details=contactIntakeDetails(value);return Boolean(value.phone?.trim()||value.email?.trim()||(value.name?.trim()&&(details.licenseNumber||details.address||details.dateOfBirth)));
}
export function contactIntakePatch(value:ContactIntakeDetails&{otherFields?:Array<{label:string;value:string}>}){return Object.fromEntries(Object.entries(contactIntakeDetails(value)).filter(([,v])=>Boolean(v))) as ContactIntakeDetails;}
