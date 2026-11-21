import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  createTransportDiagnostics,
  transportBoundaries,
} from '../../scripts/concurrency/capacity-transport-diagnostics';
// Every vendor class and fake transport below lives in one blocked Node child.
// No private .git program or fake CapacityScope is used by CI.
const program = String.raw`
import assert from 'node:assert/strict';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';
import { EventEmitter } from 'node:events';
const require=createRequire(import.meta.url), stop=()=>{throw Error('FORBIDDEN_RUNTIME_PORT');};
for(const name of ['node:net','node:tls']){const value=require(name);for(const key of ['connect','createConnection'])if(key in value)value[key]=stop;if(value.Server)value.Server.prototype.listen=stop;}
require('node:dgram').createSocket=stop;
for(const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])require('node:child_process')[key]=stop;
globalThis.fetch=stop;globalThis.WebSocket=stop;syncBuiltinESMExports();
const {capacityFixture}=await import('./tests/contracts/helpers/whole-site-capacity.ts');
const {syntheticLinuxRuntime}=await import('./tests/contracts/helpers/whole-site-linux-runtime.ts');
const {linuxScopeHelperNames}=await import('./scripts/concurrency/root-helper-contracts.ts');
const {parseCapacityScope}=await import('./scripts/concurrency/capacity-scope.ts');
const {sha256}=await import('./scripts/concurrency/local-runtime.ts');
const {createNativeTransport}=await import('./scripts/concurrency/capacity-native-transport.ts');
const f=await capacityFixture(),profile=syntheticLinuxRuntime(f.input.databaseIdentitySha256);
const receiptBytes=JSON.stringify({...f.receipt,executionProfileSha256:profile.profileSha});
const processCloseBytes=JSON.stringify({...f.processClose,functionalResultSha256:sha256(receiptBytes),executionProfileSha256:profile.profileSha});
const scope=parseCapacityScope({...f.input,functionalResultSha256:sha256(receiptBytes),functionalProcessCloseSha256:sha256(processCloseBytes),executionProfileSha256:profile.profileSha,helpers:Object.fromEntries(linuxScopeHelperNames.map(n=>[n,profile.hashes[n]]))},{receiptBytes,processCloseBytes,executionProfileAuthority:profile.authority});
const ordinary=parseCapacityScope(f.input,f.proof), signal=new AbortController().signal;
Object.defineProperty(process,'platform',{value:'darwin'});assert.equal(createNativeTransport(scope,signal,3,'fresh_registration-native_browser-3'),undefined);
Object.defineProperty(process,'platform',{value:'linux'});assert.equal(createNativeTransport(ordinary,signal,3,'fresh_registration-native_browser-3'),undefined);
assert.throws(()=>createNativeTransport({...scope},signal,3,'fresh_registration-native_browser-3'));
const aborted=new AbortController();aborted.abort();assert.throws(()=>createNativeTransport(scope,aborted.signal,3,'fresh_registration-native_browser-3'));
assert.throws(()=>createNativeTransport(scope,signal,60,'fresh_registration-native_browser-3'));
const Module=require('node:module'),fs=require('node:fs'),file=resolve('node_modules/.pnpm/playwright-core@1.65.1/node_modules/playwright-core/lib/coreBundle.js');
const originalCompile=Module.prototype._compile,mode=process.argv[1];let captured,compiled=0,launches=0,connects=0;
Module.prototype._compile=function(code,name){const result=Reflect.apply(originalCompile,this,[code,name]);if(name===file&&this.exports.playwright&&this.exports.Connection){compiled++;captured=this.exports;if(mode==='SHAPE')this.exports={...this.exports,FrameDispatcher:{}};else{this.exports.playwright.chromium.launchServer=async()=>{launches++;return {close:async()=>{}};};this.exports.playwright.chromium.connect=async()=>{connects++;return {};};}}return result;};
if(mode==='HASH'){const read=fs.readFileSync;fs.readFileSync=function(name,...args){return name===file?Buffer.from('changed'):Reflect.apply(read,this,[name,...args]);};syncBuiltinESMExports();}
const make=(s=signal,actors=3)=>createNativeTransport(scope,s,actors,'fresh_registration-native_browser-'+actors);
const leaf=async(lease,closed=true)=>{const rows=[];const journal={write:async(name,value)=>{assert.equal(name,'native-transport-diagnostics');rows.push(value);}};await lease.finish(journal,closed);await lease.finish(journal,closed);assert.equal(rows.length,1);return rows[0];};
if(mode==='HASH'||mode==='SHAPE'){
 const lease=make();assert.throws(()=>lease.browserType.launchServer({host:'127.0.0.1'}),/TRANSPORT_FACTORY_UNAVAILABLE/);lease.beforeClose();lease.closed(true);const value=await leaf(lease);assert.equal(value.collection,'UNAVAILABLE');assert.equal(value.provenance,null);assert.equal(launches,0);console.log(JSON.stringify({mode,passed:true,browserStarted:false}));
}else{
 const target=scope.appUrl;
 function fixture(index,poison=false){
  const C=captured,client=new C.Connection(),wire=[],cr=new C.CRConnection({attribution:{},instrumentation:{}},{send:m=>wire.push(m)},()=>{},{recentLogs:()=>[]}),session=cr.rootSession.createChildSession('synthetic-session-'+index),frame=new EventEmitter();
  Object.assign(frame,{guid:'synthetic-guid-'+index,_id:'synthetic-frame-'+index,url:()=> 'about:blank',name:()=>'',parentFrame:()=>null,_firedLifecycleEvents:new Set()});frame._page={mainFrame:()=>frame,delegate:poison?{}:{_mainFrameSession:{_client:session}}};frame.goto=(_p,url)=>session.send('Page.navigate',{url,frameId:frame._id}).then(()=>null);
  const parent={connection:{existingDispatcher:()=>undefined,registerDispatcher(){},sendCreate(){},maybeDisposeStaleDispatchers(){}},_dispatchers:new Map(),_guid:'scope'},server=new C.FrameDispatcher(parent,frame),clientFrame=new C.Frame(client,'Frame',frame.guid,{parentFrame:null,url:'about:blank',name:'',loadStates:[]});
  client.onmessage=m=>queueMicrotask(()=>server.goto(m.params,{}).then(result=>client.dispatch({id:m.id,result})));
  return {client,cr,session,frame,clientFrame,wire,page:{mainFrame:()=>clientFrame},send:(url=target)=>client.sendMessageToServer(clientFrame,'goto',{url,waitUntil:'load'},{timeout:0}),reply(){const m=wire.at(-1);cr._transport.onmessage({id:m.id,sessionId:'synthetic-session-'+index,result:{loaderId:'synthetic'}});}};
 }
 async function exercise({oldClose=false,poison=false,external=false,actors=3}={}){
  const lease=make(signal,actors);await lease.browserType.launchServer({host:'127.0.0.1'});await lease.browserType.connect('ws://127.0.0.1:61235/synthetic');const fixtures=Array.from({length:actors},(_,i)=>fixture(i,poison));fixtures.forEach((f,i)=>lease.bind(i,f.page));const tasks=fixtures.map(f=>f.send());await Promise.resolve();fixtures.forEach(f=>f.reply());assert.deepEqual(await Promise.all(tasks),Array.from({length:actors},()=>({})));assert.ok(fixtures.every(f=>f.wire.length===1));
  if(!poison){const later=fixtures[0].send(target+'/app');await Promise.resolve();fixtures[0].reply();await later;}
  const outside=()=>{};if(external)fixtures[0].cr._transport.onmessage=outside;
  if(oldClose)fixtures.forEach(f=>f.cr._onClose());lease.beforeClose();if(external)assert.equal(fixtures[0].cr._transport.onmessage,outside);if(!oldClose)fixtures.forEach(f=>f.cr._onClose());lease.closed(true);return leaf(lease);
 }
 const normal=await exercise();assert.equal(normal.collection,'OBSERVED');assert.equal(normal.resourcesClosed,true);assert.equal(normal.provenance.implementation,'PINNED_SAME_BYTES_ISOLATED_INSTANCE');assert.ok(normal.actors.every(r=>r.events.length===4));assert.equal(JSON.stringify(normal).includes('synthetic'),false);assert.equal(JSON.stringify(normal).includes('127.0.0.1'),false);
 assert.equal((await exercise({oldClose:true})).collection,'PARTIAL');assert.equal((await exercise({poison:true})).collection,'PARTIAL');assert.equal((await exercise({external:true})).collection,'PARTIAL');assert.equal(compiled,1);assert.equal(launches,4);assert.equal(connects,4);
 const sixty=await exercise({actors:60});assert.equal(sixty.collection,'OBSERVED');assert.equal(sixty.actors.length,60);assert.equal(sixty.actors.flatMap(r=>r.events).length,240);assert.ok(sixty.actors.every(r=>r.events.map(e=>e.kind).join(',')==='CLIENT_CHANNEL_SEND,SERVER_FRAME_GOTO_ENTER,CDP_NAVIGATE_SEND,CDP_RESPONSE_CALLBACK'));assert.equal(compiled,1);
 const identity=make();await identity.browserType.launchServer({host:'127.0.0.1'});const custom=fixture(0),receiver={},extra={},sentinel={originalThrow:true},promise=Promise.resolve('synthetic'),calls=[];let returned=promise,throwing=false,getters=0;
 custom.client.onmessage=function(...args){calls.push({receiver:this,args});if(throwing)throw sentinel;return returned;};identity.bind(0,custom.page);const held=custom.client.onmessage,message={method:'goto',guid:custom.frame.guid,params:{url:target}};
 assert.equal(Reflect.apply(held,receiver,[message,extra]),promise);assert.equal(calls.length,1);assert.equal(calls[0].receiver,receiver);assert.equal(calls[0].args[0],message);assert.equal(calls[0].args[1],extra);
 throwing=true;assert.throws(()=>Reflect.apply(held,receiver,[message,extra]),error=>error===sentinel);const malformed={method:'goto',guid:custom.frame.guid};Object.defineProperty(malformed,'params',{get(){getters++;throw Error('synthetic getter');}});assert.throws(()=>Reflect.apply(held,receiver,[malformed,extra]),error=>error===sentinel);assert.equal(getters,0);assert.equal(calls[2].receiver,receiver);assert.equal(calls[2].args[0],malformed);assert.equal(calls[2].args[1],extra);
 throwing=false;returned={originalReturn:true};assert.equal(Reflect.apply(held,receiver,[{method:'ignored'},extra]),returned);assert.equal(calls.length,4);identity.beforeClose();custom.cr._onClose();identity.closed(true);assert.equal((await leaf(identity)).collection,'PARTIAL');

 for(const duplicate of [false,true]){
  const lease=make();await lease.browserType.launchServer({host:'127.0.0.1'});const fixtures=Array.from({length:3},(_,i)=>fixture(i));fixtures.forEach((f,i)=>{f.frame.goto=()=>null;lease.bind(i,f.page);});await Promise.all(fixtures.map(f=>f.send()));
  const pending=fixtures.map(f=>f.session.send('Page.navigate',{url:target,frameId:f.frame._id}));pending.forEach(p=>p.catch(()=>{}));
  if(duplicate){await fixtures[0].send();fixtures.forEach(f=>f.reply());await Promise.all(pending);}
  lease.beforeClose();fixtures.forEach(f=>f.cr._onClose());await Promise.allSettled(pending);lease.closed(true);const value=await leaf(lease);assert.equal(value.collection,'PARTIAL');assert.ok(value.actors.every(r=>r.events.length===(duplicate?4:3)));
 }

 const first=make();await first.browserType.launchServer({host:'127.0.0.1'});const second=make();assert.throws(()=>second.browserType.launchServer({host:'127.0.0.1'}));second.beforeClose();second.closed(true);first.beforeClose();first.closed(true);
 const controller=new AbortController(),late=make(controller.signal);controller.abort();late.beforeClose();assert.throws(()=>late.browserType.launchServer({host:'127.0.0.1'}));late.closed(true);assert.equal((await leaf(late)).collection,'UNAVAILABLE');assert.equal(compiled,1);
 const writer=make();writer.beforeClose();let writes=0;await writer.finish({write:async()=>{writes++;throw Error('synthetic writer');}},false);await writer.finish({write:async()=>{writes++;}},false);assert.equal(writes,1);
 console.log(JSON.stringify({mode,passed:true,compiled,actualHookActors:sixty.actors.length,actualHookEvents:sixty.actors.flatMap(r=>r.events).length,callbackIdentityChecked:true,browserStarted:false,callbacksAreNotWire:true}));
}
`;
const run = (mode: string) => {
  const output = execFileSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', program, mode],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 20000,
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8' },
    },
  );
  const result: unknown = JSON.parse(output.trim());
  expect(result).toMatchObject({ mode, passed: true, browserStarted: false });
  return result;
};
describe('pinned isolated Native default transport', () => {
  it('uses the genuine profile, one cached class instance, four actual hooks and original close ordering', () => {
    expect(run('NORMAL')).toMatchObject({
      compiled: 1,
      actualHookActors: 60,
      actualHookEvents: 240,
      callbackIdentityChecked: true,
      callbacksAreNotWire: true,
    });
  });
  it.each(['HASH', 'SHAPE'])(
    'rejects %s before any fake browser call with no fallback',
    (mode) => {
      run(mode);
    },
  );
  it('bounds actor/event/privacy state and seals missing or late records honestly', () => {
    let n = 0;
    const owner = createTransportDiagnostics(60, { now: () => ++n });
    for (let i = 0; i < 60; i++) {
      expect(owner.register(i)).toBe(true);
      for (const kind of transportBoundaries)
        owner.record(i, kind, owner.stamp());
    }
    const packet = owner.seal();
    expect(packet).toMatchObject({
      collection: 'OBSERVED',
      sealed: true,
      overflow: false,
    });
    expect(packet.actors.flatMap((r) => r.events)).toHaveLength(240);
    owner.fail();
    owner.register(60);
    owner.record(0, 'CLIENT_CHANNEL_SEND', 0);
    expect(owner.snapshot()).toBe(packet);
    expect(Buffer.byteLength(JSON.stringify(packet))).toBeLessThanOrEqual(
      65536,
    );
    const bad = createTransportDiagnostics(1, {
      sink: () => {
        throw Error('PRIVATE_SINK');
      },
    });
    bad.register(0);
    bad.record(0, 'CLIENT_CHANNEL_SEND', 1);
    expect(bad.seal().collection).toBe('PARTIAL');
    expect(JSON.stringify(bad.snapshot())).not.toContain('PRIVATE_SINK');
  });
});
