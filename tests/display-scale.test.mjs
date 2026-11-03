import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {cleanDisplayScale} from '../app/lib/display-scale.ts';
import {cleanWorkspaceProfile} from '../app/lib/workspace-profile.ts';
import {appearanceBootstrap,appearanceCacheKey,applyWorkspaceAppearance} from '../app/lib/workspace-appearance.ts';

test('size boundaries reject invalid data and retain old accessibility presets',()=>{
 for(const [value,expected] of [[-200,80],[0,80],[82,80],[83,85],[99,100],[125,125],[10000,125],[NaN,90],[Infinity,90],['125',90],[null,90]])assert.equal(cleanDisplayScale(value),expected);
 assert.equal(cleanDisplayScale(undefined,'extra-large'),115);
 assert.equal(cleanDisplayScale(undefined,'comfortable'),85);
 assert.equal(cleanWorkspaceProfile({displayScale:120}).displayScale,120);
 assert.equal(cleanWorkspaceProfile({displayScale:500}).displayScale,125);
});

test('saving size restores the same text and spacing before the next first paint',()=>{
 const dom=new JSDOM('<html><body></body></html>',{url:'https://example.test',runScripts:'outside-only'});
 Object.assign(globalThis,{document:dom.window.document,localStorage:dom.window.localStorage});
 try{for(const size of [80,90,125]){
  applyWorkspaceAppearance('dark','large',size);
  assert.equal(JSON.parse(localStorage.getItem(appearanceCacheKey)).displayScale,size);
  document.documentElement.removeAttribute('style');
  dom.window.eval(appearanceBootstrap);
  assert.equal(document.documentElement.dataset.displayScale,String(size));
  assert.equal(document.documentElement.style.getPropertyValue('--workspace-text-scale'),String(size/100));
  assert.equal(document.documentElement.style.getPropertyValue('--workspace-space-scale'),String(size/100));
 }}finally{dom.window.close()}
});
