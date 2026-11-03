import {registerHooks} from 'node:module';
const sources={
'clerk-access':`export async function getPacificaAccess(){return {allowed:true,userId:'test',email:'owner@example.com'}}`,
'clerk-config':`export function isClerkConfigured(){return true}`,
'workspace-storage':`export function workspaceRedisConfig(){return {url:''}} export async function workspaceRedis(){return null} export async function readStoredWorkspace(){return globalThis.testWorkspace} export async function updateStoredWorkspace(id,update){globalThis.testWorkspace=update(globalThis.testWorkspace);return globalThis.testWorkspace} export async function saveWorkspaceChanges(id,before,after){globalThis.testWorkspace=after;return after}`,
'outbound-sms':`export async function sendOutboundSms(input){globalThis.testDeliveries.push(input);return {id:'SM-test',from:'8185550199',status:'queued'}} export async function outboundSmsStatus(){return {configured:true}}`,
'outbound-email':`export function inboundReplyAddress(){return ''} export function outboundEmailStatus(){return {configured:true}} export async function sendOutboundEmail(input){globalThis.testDeliveries.push(input);return {id:'email-test',provider:'test'}}`,
'phone-assignments':`export async function phoneAssignmentForWorkspace(){return null} export async function phoneAssignmentForNumber(){return {workspaceId:'test'}}`,
};
registerHooks({resolve(specifier,context,next){const name=specifier.split('/').at(-1)?.replace(/\.ts$/,'');if(sources[name])return {url:'data:text/javascript,'+encodeURIComponent(sources[name]),shortCircuit:true};return next(specifier,context)}});
registerHooks({resolve(specifier,context,next){if(specifier==='next/server')return {url:'data:text/javascript,export function after(callback){(globalThis.testAfterResponseJobs??=[]).push(callback)}',shortCircuit:true};return next(specifier,context)}});
