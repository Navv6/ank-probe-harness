import test from 'node:test';import assert from 'node:assert/strict';import {add} from '../src/calc.mjs';
test('add local',()=>assert.equal(add(2,3),5));
