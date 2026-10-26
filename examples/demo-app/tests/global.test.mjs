import test from 'node:test';import assert from 'node:assert/strict';import {add,multiply} from '../src/calc.mjs';
test('core workflow global',()=>assert.equal(multiply(add(1,2),3),9));
