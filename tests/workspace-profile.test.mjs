import test from "node:test";
import assert from "node:assert/strict";
import {cleanWorkspaceProfile,defaultWorkspaceProfile} from "../app/lib/workspace-profile.ts";

test("new and legacy workspaces follow the system appearance",()=>{
  assert.equal(defaultWorkspaceProfile.appearance,"system");
  assert.equal(defaultWorkspaceProfile.displaySize,"large");
  assert.equal(cleanWorkspaceProfile({mode:"insurance"}).appearance,"system");
  assert.equal(cleanWorkspaceProfile({}).displaySize,"large");
});

test("dark mode is retained as an account preference",()=>{
  assert.equal(cleanWorkspaceProfile({appearance:"dark"}).appearance,"dark");
  assert.equal(cleanWorkspaceProfile({appearance:"light"}).appearance,"light");
  assert.equal(cleanWorkspaceProfile({appearance:"unknown"}).appearance,"system");
  assert.equal(cleanWorkspaceProfile({displaySize:"comfortable"}).displaySize,"comfortable");
  assert.equal(cleanWorkspaceProfile({displaySize:"extra-large"}).displaySize,"extra-large");
  assert.equal(cleanWorkspaceProfile({displaySize:"tiny"}).displaySize,"large");
});

test("client reminder settings are tenant-scoped and off by default",()=>{
  assert.equal(defaultWorkspaceProfile.clientRemindersEnabled,false);
  const profile=cleanWorkspaceProfile({clientRemindersEnabled:true,customerReminderSmsEnabled:true,ownerReminderSmsEnabled:true,ownerReminderPhone:" +1 (818) 555-0123 "});
  assert.equal(profile.clientRemindersEnabled,true);
  assert.equal(profile.customerReminderSmsEnabled,true);
  assert.equal(profile.ownerReminderSmsEnabled,true);
  assert.equal(profile.ownerReminderPhone,"+1 (818) 555-0123");
});
