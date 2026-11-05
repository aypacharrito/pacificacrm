export type QuoteDetails={name:string;phone:string;email:string;product:string;address:string;city:string;state:string;zip:string;dateOfBirth:string;renewalDate:string;vin:string;currentCarrier:string;contactPermission:boolean};
export type QuoteLink={id:string;leadId:number|null;source:string;createdAt:string;expiresAt:string;revoked?:boolean};
export type QuoteSubmission={id:string;linkId:string;leadId:number|null;source:string;submittedAt:string;status:"pending"|"accepted"|"dismissed";details:QuoteDetails;consentText:string;reviewedAt?:string;acceptedLeadId?:number;requestNotes?:string};
export type QuoteIntakeState={links:QuoteLink[];submissions:QuoteSubmission[]};
export type QuoteRequestEvidence={id:string;requestedAt:string;source:string};
export const emptyQuoteIntake=():QuoteIntakeState=>({links:[],submissions:[]});
export const quoteConsentText=(business:string)=>`I am requesting an insurance quote from ${business} for myself or someone I am authorized to represent. I authorize the agency to use these details to prepare a quote and contact me personally about this request. This does not enroll me in automated marketing.`;
export const phoneKey=(value:string)=>value.replace(/\D/g,"").replace(/^1(?=\d{10}$)/,"");
export function exactDate(value:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const time=Date.parse(value+"T00:00:00Z");return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
}
export function validBirthDate(value:string,now=new Date()){
 if(!exactDate(value))return false;
 const year=Number(value.slice(0,4));return year>=now.getUTCFullYear()-120&&value<=now.toISOString().slice(0,10);
}
export function cleanQuoteDetails(raw:unknown,existingContact:boolean,now=new Date()):QuoteDetails{
 const body=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};
 const text=(key:string,max=160)=>typeof body[key]==="string"?String(body[key]).trim().slice(0,max):"";
 if(body.contactPermission!==true)throw Error("Confirm that you are requesting a quote before submitting.");
 if(text("website"))throw Error("Unable to submit this request.");
 const dateOfBirth=text("dateOfBirth",20),renewalDate=text("renewalDate",20),vin=text("vin",30).toUpperCase(),phone=phoneKey(text("phone",30));
 if(!validBirthDate(dateOfBirth,now))throw Error("Enter a complete, valid date of birth.");
 if(renewalDate&&(!exactDate(renewalDate)||renewalDate<now.toISOString().slice(0,10)||Date.parse(renewalDate)>now.getTime()+2*366*86400000))throw Error("Enter an upcoming renewal date within two years, or leave it blank.");
 if(vin&&!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))throw Error("Enter all 17 VIN characters, or leave this field blank.");
 const name=text("name",100),email=text("email",200).toLowerCase(),product=text("product",40);
 if(!existingContact&&name.split(/\s+/).length<2)throw Error("Enter your first and last name.");
 if((phone||!existingContact)&&!/^\d{10}$/.test(phone))throw Error("Enter a valid 10-digit US phone number.");
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error("Check the email address.");
 if(!existingContact&&!['Auto','Home','Renters','Life','Commercial','Home & Auto'].includes(product))throw Error("Choose the insurance you are interested in.");
 const address=text("address"),city=text("city",100),state=text("state",2).toUpperCase(),zip=text("zip",10);
 if(!existingContact&&(!address||!city||!state||!zip))throw Error("Enter your full address so the agency can prepare your quote.");
 if(state&&!/^[A-Z]{2}$/.test(state))throw Error("Use the two-letter state abbreviation.");
 if(zip&&!/^\d{5}(-\d{4})?$/.test(zip))throw Error("Enter a valid ZIP code.");
 return {name,phone,email,product,address,city,state,zip,dateOfBirth,renewalDate,vin,currentCarrier:text("currentCarrier",100),contactPermission:true};
}
/** Intake data is server-owned; ordinary workspace saves cannot create or erase it. */
export function cleanQuoteIntake(raw:unknown):QuoteIntakeState{
 const value=raw&&typeof raw==='object'?raw as Partial<QuoteIntakeState>:{};
 return {links:Array.isArray(value.links)?value.links.filter(x=>x&&typeof x.id==='string').slice(-100):[],submissions:Array.isArray(value.submissions)?value.submissions.filter(x=>x&&typeof x.id==='string'&&x.details).slice(-500):[]};
}
