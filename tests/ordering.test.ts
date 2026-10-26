import test from "node:test";
import assert from "node:assert/strict";
import { inspectNumbering, sortByQuestionNumber, type NumberedPage } from "../src/domain/ordering.ts";

const page = (id: string, questionNumber: number | null, originalIndex: number): NumberedPage => ({
  id, questionNumber, originalIndex,
});

test("sorts question numbers numerically rather than lexically", () => {
  const input = [page("q10", 10, 0), page("q2", 2, 1), page("q1", 1, 2)];
  assert.deepEqual(sortByQuestionNumber(input).map((item) => item.id), ["q1", "q2", "q10"]);
});

test("leaves unassigned pages last and keeps their incoming order", () => {
  const input = [page("blank-a", null, 0), page("q3", 3, 1), page("blank-b", null, 2), page("q1", 1, 3)];
  assert.deepEqual(sortByQuestionNumber(input).map((item) => item.id), ["q1", "q3", "blank-a", "blank-b"]);
});

test("keeps duplicate numbers stable so a human can resolve them", () => {
  const input = [page("q4-first", 4, 1), page("q4-second", 4, 3), page("q2", 2, 2)];
  assert.deepEqual(sortByQuestionNumber(input).map((item) => item.id), ["q2", "q4-first", "q4-second"]);
});

test("reports duplicate numbers, gaps, and unassigned pages", () => {
  const report = inspectNumbering([
    page("q1", 1, 0),
    page("q3-a", 3, 1),
    page("q3-b", 3, 2),
    page("unknown", null, 3),
  ]);
  assert.deepEqual(report.duplicateNumbers, [3]);
  assert.deepEqual(report.missingNumbers, [2]);
  assert.deepEqual(report.unnumberedPageIds, ["unknown"]);
});

test("does not mutate the input when sorting", () => {
  const input = [page("q2", 2, 0), page("q1", 1, 1)];
  assert.deepEqual(sortByQuestionNumber(input).map((item) => item.id), ["q1", "q2"]);
  assert.deepEqual(input.map((item) => item.id), ["q2", "q1"]);
});
