import test from 'node:test';
import assert from 'node:assert/strict';
import {percentChange, minutesByCategory, classify} from '../src/metrics.js';
test('comparison never invents growth from zero', () => { assert.equal(percentChange(10, 0), null); assert.equal(percentChange(12, 10), 20); });
test('duration aggregation uses elapsed time', () => { assert.deepEqual(minutesByCategory([{start:'2026-01-01T00:00:00Z',end:'2026-01-01T00:30:00Z',category:'Study'}]),{Study:30}); });
test('browser is not presumed entertainment', () => { assert.equal(classify('Chrome', 'YouTube'), 'Other'); assert.equal(classify('VS Code'), 'Development'); });
