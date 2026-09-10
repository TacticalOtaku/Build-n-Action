import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateContextCondition} from '../scripts/services/graph-ports.mjs';
import {evaluateBonusFilters} from '../scripts/services/filter-evaluator.mjs';
test('context conditions distinguish absence, presence and unavailable combat context', () => {
  assert.equal(evaluateContextCondition({predicate:'hasTarget'}, {target:null}), false);
  assert.equal(evaluateContextCondition({predicate:'hasTarget'}, {target:{actor:{}}}), true);
  assert.equal(evaluateContextCondition({predicate:'hasItem'}, {}), false);
  assert.equal(evaluateContextCondition({predicate:'hasItem'}, {item:{}}), true);
  assert.equal(evaluateContextCondition({predicate:'inCombat'}, {}, {}), null);
  assert.equal(evaluateContextCondition({predicate:'inCombat'}, {}, {combatActive:false}), false);
  assert.equal(evaluateContextCondition({predicate:'inCombat'}, {}, {combatActive:true}), true);
});
test('runtime context nodes participate in bonus filtering without typed filter storage', () => {
  const conditionGraph={version:1,enabled:true,nodes:[{id:'c',type:'context',predicate:'hasItem'},{id:'r',type:'result'}],edges:[{from:'c',to:'r'}]};
  for (const item of [null, {}]) {
    const bonuses=new Map([['bonus',{filters:{},conditionGraph}]]);
    evaluateBonusFilters(bonuses,{}, {item},{});
    assert.equal(bonuses.size,item ? 1 : 0);
  }
});
