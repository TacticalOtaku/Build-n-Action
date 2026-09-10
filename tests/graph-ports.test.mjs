import test from "node:test";
import assert from "node:assert/strict";
import {evaluateConditionGraph, validateConditionGraph} from "../scripts/services/condition-graph.mjs";
import {connectNodes} from "../scripts/services/blueprint-state.mjs";

const binary = type => ({version: 1, nodes: [{id:'a',type:'condition',filter:'a'}, {id:'b',type:'condition',filter:'b'}, {id:'gate',type}, {id:'result',type:'result'}], edges:[{from:'a',to:'gate',toPort:'a'}, {from:'b',to:'gate',toPort:'b'}, {from:'gate',to:'result'}]});
test('binary gates implement complete tri-state truth tables', () => {
  for (const a of [true,false,null]) for (const b of [true,false,null]) {
    const expected = {xor:a === null || b === null ? null : a !== b, nand:a === false || b === false ? true : a === null || b === null ? null : false, nor:a === true || b === true ? false : a === null || b === null ? null : true};
    for (const type of Object.keys(expected)) assert.equal(evaluateConditionGraph(binary(type), n => n.filter === 'a' ? a : b).result, expected[type], `${type}: ${a}, ${b}`);
  }
});
test('branch outputs invert only known values and support fan-out with memoization', () => {
  const g = {version:1,nodes:[{id:'c',type:'condition',filter:'a'},{id:'branch',type:'branch'},{id:'merge',type:'or'},{id:'result',type:'result'}],edges:[{from:'c',to:'branch'},{from:'branch',fromPort:'true',to:'merge'},{from:'branch',fromPort:'false',to:'merge'},{from:'merge',to:'result'}]};
  for (const value of [true,false,null]) { let calls=0; assert.equal(evaluateConditionGraph(g,()=>{calls++;return value;}).result,value === null ? null : true); assert.equal(calls,1); }
  g.edges[1].fromPort = 'invalid'; assert.equal(validateConditionGraph(g).valid,false);
});
test('named inputs reject missing/duplicate sockets and replace only the chosen input', () => {
  const g=binary('xor'); g.edges[1].toPort='a'; assert.equal(validateConditionGraph(g).valid,false);
  g.edges[1].toPort='b'; g.nodes.push({id:'c',type:'condition',filter:'c'});
  assert.equal(connectNodes(g,'c','gate','out','a'),true);
  assert.equal(g.edges.some(e=>e.from==='b' && e.toPort==='b'),true);
  assert.equal(g.edges.some(e=>e.from==='a'),false);
  assert.equal(connectNodes(g,'c','gate','out','invalid'),false);
});
