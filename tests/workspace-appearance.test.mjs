import test from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {appearanceBootstrap, appearanceCacheKey, applyWorkspaceAppearance} from "../app/lib/workspace-appearance.ts";
import {cleanWorkspaceProfile, defaultWorkspaceProfile} from "../app/lib/workspace-profile.ts";

function boot(value, collapsed = "false") {
  const dom = new JSDOM('<html data-theme="dark"><head></head><body></body></html>', {url:"https://example.test", runScripts:"outside-only"});
  if (value !== null) dom.window.localStorage.setItem(appearanceCacheKey, value);
  dom.window.localStorage.setItem("pacifica:sidebar-collapsed", collapsed);
  dom.window.eval(appearanceBootstrap);
  return dom;
}
test("first paint restores both saved themes, text scale and collapsed sidebar without hydration", () => {
  for (const appearance of ["dark","light"]) {
    const dom = boot(JSON.stringify({appearance,displaySize:"extra-large"}), "true");
    try {
      assert.equal(dom.window.document.documentElement.dataset.theme, appearance);
      assert.equal(dom.window.document.documentElement.style.colorScheme, appearance);
      assert.equal(dom.window.document.documentElement.dataset.displaySize, "extra-large");
      assert.equal(dom.window.document.documentElement.dataset.sidebarCollapsed, "true");
    } finally {dom.window.close();}
  }
});
test("new workspaces follow the device, while an explicitly saved light preference survives", () => {
  assert.equal(defaultWorkspaceProfile.appearance,"system");
  assert.equal(cleanWorkspaceProfile({}).appearance,"system");
  assert.equal(cleanWorkspaceProfile({appearance:"light"}).appearance,"light");
  const dom = boot(null);
  try {assert.equal(dom.window.document.documentElement.dataset.theme,"dark");} finally {dom.window.close();}
});
test("invalid or unavailable browser storage cannot stop first paint", () => {
  for (const value of ["broken JSON", JSON.stringify({appearance:"purple",displaySize:"huge"})]) {
    const dom = boot(value,"true");
    try {assert.equal(dom.window.document.documentElement.dataset.theme,"dark");assert.equal(dom.window.document.documentElement.dataset.displaySize,"large");assert.equal(dom.window.document.documentElement.dataset.sidebarCollapsed,"true");} finally {dom.window.close();}
  }
  const dom = new JSDOM('<html><body></body></html>', {runScripts:"outside-only"});
  try {dom.window.eval(appearanceBootstrap);assert.equal(dom.window.document.documentElement.dataset.theme,"dark");} finally {dom.window.close();}
});
test("changing appearance writes a tiny cache for the next startup", () => {
  const dom = boot(null);
  Object.assign(globalThis,{document:dom.window.document,localStorage:dom.window.localStorage});
  try {
    applyWorkspaceAppearance("light","comfortable");
    const saved=JSON.parse(localStorage.getItem(appearanceCacheKey));assert.equal(saved.appearance,"light");assert.equal(saved.displaySize,"comfortable");assert.equal(saved.displayScale,85);assert.equal(saved.colorPalette,"system");assert.ok(localStorage.getItem(appearanceCacheKey).length<1000);
    document.documentElement.dataset.theme="dark";
    dom.window.eval(appearanceBootstrap);
    assert.equal(document.documentElement.dataset.theme,"light");
  } finally {dom.window.close();}
});
