import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSymbolPage,decideSymbolRows,lookupSelectedSymbolSheet} from '../app/lib/integon-symbol-reference.ts';

function item(str,x,y) {return {str,transform:[1,0,0,1,x,y]};}
function header(xs,y=710) {return ['VIN','Year','Make','Model','SymbolSet5'].map((name,index)=>item(name,xs[index],y));}
function row(xs,y,key,year,make,model,symbol) {
  return [key,year,make,model,symbol].map((value,index)=>item(value,xs[index],y));
}

test('PDF geometry preserves the filed columns on header and continuation pages',()=>{
  const xs=[56,141,170,224,307];
  const parsed=parseSymbolPage([item('2016_',292,746),...header(xs),
    ...row(xs,697,'WD3PE8CD*J','2018','MERZ','SPRINTER','CA1408'),
    ...row(xs,684.5,'19UDE2F3*G','2016','ACUR','ILX','ED0509')]);
  assert.deepEqual(parsed,{recognized:true,columns:xs,rows:[
    {maskedKey:'WD3PE8CD*J',year:'2018',make:'MERZ',model:'SPRINTER',symbolSet5:'CA1408'},
    {maskedKey:'19UDE2F3*G',year:'2016',make:'ACUR',model:'ILX',symbolSet5:'ED0509'},
  ]});
  assert.equal(parseSymbolPage([item('flattened text only',1,1)]).recognized,false);
  const ampersand=parseSymbolPage([...header(xs),...row(xs,697,'3FT&X21L*Y','2000','FORD','F250 SUPER','C41618')]);
  assert.deepEqual(ampersand.rows[0],{maskedKey:'3FT&X21L*Y',year:'2000',make:'FORD',model:'F250 SUPER',symbolSet5:'C41618'});
  const continuation=parseSymbolPage([item('page title',292,746),...row(xs,697,'1FTFW2K5*R','2024','FORD','F150','721011')],xs);
  assert.equal(continuation.recognized,true);
  assert.equal(continuation.rows[0].symbolSet5,'721011');
  assert.equal(parseSymbolPage([item('page title',292,746),...row(xs,697,'1FTFW2K5*R','2024','FORD','F150','721011')]).recognized,false);
});

test('same filed row collapses; conflicting symbol or model fails closed',()=>{
  const row={maskedKey:'12303312**',year:'1981',make:'MERZ',model:'280',symbolSet5:'AG2524'};
  const sourceFile='SS5_Pre90.pdf';
  assert.deepEqual(decideSymbolRows([{row,page:1},{row,page:2}],sourceFile),{
    state:'matched',symbolSet5:'AG2524',make:'MERZ',model:'280',sourceFile,page:1,
    filing:'GMMX-134286985',stateTracking:'24-2128',
  });
  assert.equal(decideSymbolRows([{row,page:1},{row:{...row,symbolSet5:'9E2627'},page:3}],sourceFile).state,'ambiguous');
  assert.equal(decideSymbolRows([],sourceFile).state,'missing');
});

test('invalid key, unknown file and cancellation fail before PDF worker starts',async()=>{
  const file=new File([new Uint8Array([1,2,3])],'SS5_2021_.pdf',{type:'application/pdf'});
  assert.equal((await lookupSelectedSymbolSheet(file,'1FTFW2K5*R-EXTRA','2024')).state,'invalid-source');
  assert.equal((await lookupSelectedSymbolSheet(file,'1FTFW2K5*R','2024')).state,'invalid-source');
  const controller=new AbortController(); controller.abort();
  await assert.rejects(lookupSelectedSymbolSheet(file,'1FTFW2K5*R','2024',{signal:controller.signal}),{name:'AbortError'});
});
