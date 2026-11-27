import test from "node:test";
import assert from "node:assert/strict";
import {cleanDocumentLeadExtraction,documentLeadCompletenessScore,documentLeadHasUsefulData,documentLeadImportedFields,documentLeadName,reviewedDocumentLeadFields} from "../app/lib/document-lead.ts";
import {parseAamvaBarcode,parseInsuranceDeclarationText,parseLicenseOcrText} from "../app/lib/local-document-parser.ts";

test("document scans are cleaned without inventing missing fields",()=>{
  const extraction=cleanDocumentLeadExtraction({firstName:"  Maya ",lastName:" Chen ",address:" 10 Main St ",policyNumber:12345,otherFields:[{label:"Height",value:"5-07"},{label:"",value:"ignored"}]});
  assert.equal(documentLeadName(extraction),"Maya Chen");
  assert.equal(extraction.policyNumber,"12345");
  assert.equal(extraction.phone,"");
  assert.deepEqual(extraction.otherFields,[{label:"Height",value:"5-07"}]);
});

test("license identifiers stay in dedicated editable fields and out of general document context",()=>{
  const extraction=cleanDocumentLeadExtraction({documentType:"Driver license",fullName:"Maya Chen",address:"10 Main St",city:"Pasadena",state:"CA",zip:"91101",licenseNumber:"D1234567",otherFields:[{label:"DL",value:"D1234567"},{label:"Extra",value:"D1234567"},{label:"Document note",value:"DL ****4567"},{label:"Class",value:"C"}]});
  assert.equal(extraction.licenseNumber,"D1234567");
  assert.deepEqual(documentLeadImportedFields(extraction),{"Document type":"Driver license","Full name":"Maya Chen","Street address":"10 Main St",City:"Pasadena",State:"CA",ZIP:"91101"});
});

test("corrected license draft fields replace OCR values before saving general details",()=>{
  const read=cleanDocumentLeadExtraction({documentType:"Driver license",fullName:"Maya Chin",address:"10 Main St",licenseNumber:"D1234567",otherFields:[{label:"DL",value:"D1234567"}]});
  const fields=reviewedDocumentLeadFields(documentLeadImportedFields(read),{name:"Maya Chen",address:"10 Main Street",city:"Pasadena",state:"CA",zip:"91101",dateOfBirth:"1990-01-02",policyNumber:"",policyEffectiveDate:"",policyExpirationDate:"",vin:""});
  assert.equal(fields["Full name"],"Maya Chen");assert.equal(fields["Street address"],"10 Main Street");assert.equal(fields["Date of birth"],"1990-01-02");
  assert.doesNotMatch(JSON.stringify(fields),/Maya Chin|D1234567/);
});

test("empty vision responses are rejected while partial IDs remain usable",()=>{
  assert.equal(documentLeadHasUsefulData(cleanDocumentLeadExtraction({})),false);
  assert.equal(documentLeadHasUsefulData(cleanDocumentLeadExtraction({licenseNumber:"D0000000"})),true);
});

test("complete document reads outrank partial OCR results",()=>{
  const partial=cleanDocumentLeadExtraction({fullName:"Test Person"});
  const complete=cleanDocumentLeadExtraction({fullName:"Test Person",dateOfBirth:"1990-01-01",address:"123 Example St",city:"Example",state:"CA",zip:"90000",licenseNumber:"D0000000",licenseExpiration:"2030-01-01"});
  assert.ok(documentLeadCompletenessScore(complete)>=8);
  assert.ok(documentLeadCompletenessScore(complete)>documentLeadCompletenessScore(partial));
});

test("local PDF417 parsing fills a driver-license lead without a paid API",()=>{
  const extraction=parseAamvaBarcode("@\nANSI 636014\nDCSDOE\nDACJANE\nDADMARIE\nDAG123 MAIN ST\nDAIPASADENA\nDAJCA\nDAK911010000\nDAQD1234567\nDBA10302030\nDBB01021990\nDBCF\nDAYBRN");
  assert.equal(extraction.fullName,"Jane Marie Doe");assert.equal(extraction.city,"Pasadena");assert.equal(extraction.licenseNumber,"D1234567");assert.equal(extraction.dateOfBirth,"1990-01-02");
});

test("local OCR parser handles the supplied California license layout",()=>{
  const extraction=parseLicenseOcrText("California\nLN ORTIZ SANDOVAL\nFN OSCAR HECTOR\n12635 VANOWEN ST APT 11\nN HOLLYWOOD, CA 91605\nDOB 10301999\nRSTR NONE\nSEX M HAIR BLK\nEYES BRN\nHGT 5'-06\nWGT 180 lb\nEXP 10302028");
  assert.equal(extraction.fullName,"Oscar Hector Ortiz Sandoval");assert.equal(extraction.address,"12635 Vanowen St Apt 11");assert.equal(extraction.city,"N Hollywood");assert.equal(extraction.dateOfBirth,"1999-10-30");
});

test("declaration parser captures policy, insured, vehicles, premium, and renewal",()=>{
  const extraction=parseInsuranceDeclarationText("New Auto Policy Declarations Policy Number CAAP0001394639 From: 09/01/2026 To: 03/01/2027 Mercury Insurance Company Named Insured SULEN CHAVEZ 13190 ROAD 29 MADERA, CA 93638-5915 (818) 438-1446 losprotectores@att.net Listed Drivers SULEN CHAVEZ - 15 Years License Experience ALEJANDRO CARRANZA - 20 Years License Experience Excluded Drivers Vehicles 2021 BMW 330I SED 4DR, VIN: WBA5R1C06MFK55877 2018 BMW X5 SDRIVE35I UTL 4X2 4D, VIN: 5UXKR2C50J0Z14587 Total 6 Month Policy Premium $ 838.58");
  assert.equal(extraction.policyNumber,"CAAP0001394639");assert.equal(extraction.fullName,"Sulen Chavez");assert.equal(extraction.policyExpirationDate,"2027-03-01");assert.equal(extraction.policyPremium,"838.58");assert.equal(extraction.policyTermMonths,"6");assert.equal(extraction.vin,"WBA5R1C06MFK55877");assert.equal(extraction.otherFields.filter(field=>/VIN$/.test(field.label)).length,2);
});

test("monthly billing is stored separately and never projected into policy premium",()=>{
  const extraction=parseInsuranceDeclarationText("Auto Policy Declarations Policy Number AUTO123456 From: 09/01/2026 To: 03/01/2027 Payment Plan Monthly Monthly Payment $ 145.22");
  assert.equal(extraction.policyPremium,"");
  assert.equal(extraction.billingFrequency,"Monthly");
  assert.equal(extraction.installmentAmount,"145.22");
  assert.equal(documentLeadImportedFields(extraction)["Installment amount"],"145.22");
});
