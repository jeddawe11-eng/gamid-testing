import test from "node:test";
import assert from "node:assert/strict";
import { createStatusMessage, SUCCESS_MESSAGE_MS } from "../dist/play-together/status-message.js";

function fixture() {
  const classes=new Set();
  const node={textContent:"",hidden:true,classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name),contains:name=>classes.has(name)}};
  const pending=new Map(); let next=0;
  const show=createStatusMessage(node,{setTimer:(callback,delay)=>{const id=++next;pending.set(id,{callback,delay});return id;},clearTimer:id=>pending.delete(id)});
  return {node,classes,pending,show};
}

test("success status disappears after five seconds without a reload",()=>{
  const {node,pending,show}=fixture();
  show("Session created.",true);
  assert.equal(node.hidden,false);
  assert.equal(pending.size,1);
  const timer=[...pending.values()][0];
  assert.equal(timer.delay,SUCCESS_MESSAGE_MS);
  timer.callback();
  assert.equal(node.textContent,"");
  assert.equal(node.hidden,true);
});

test("persistent errors do not receive a dismissal timer",()=>{
  const {node,pending,show}=fixture();
  show("The session could not be created.");
  assert.equal(node.hidden,false);
  assert.equal(pending.size,0);
});

test("a repeated message cancels the stale success timer",()=>{
  const {node,pending,show}=fixture();
  show("Session created.",true);
  const stale=[...pending.values()][0];
  show("A newer error must remain visible.");
  assert.equal(pending.size,0);
  stale.callback();
  assert.equal(node.textContent,"A newer error must remain visible.");
  assert.equal(node.hidden,false);
});
