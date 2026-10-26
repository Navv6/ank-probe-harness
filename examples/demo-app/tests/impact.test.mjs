import test from 'node:test';import assert from 'node:assert/strict';import {multiply} from '../src/calc.mjs';
test('multiply impact',()=>assert.equal(multiply(2,3),6));
