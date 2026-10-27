import test from "node:test";
import assert from "node:assert/strict";
import { inspectNumbering, sortByQuestionNumber, sortBySourcePageNumber, type NumberedPage } from "../src/domain/ordering.ts";

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

test("respects the current manual order among equal and unassigned numbers", () => {
  const input = [
    page("continuation-b", 4, 9),
    page("continuation-a", 4, 1),
    page("cover-or-diagram", null, 0),
    page("another-unassigned", null, 2),
  ];
  assert.deepEqual(
    sortByQuestionNumber(input).map((item) => item.id),
    ["continuation-b", "continuation-a", "cover-or-diagram", "another-unassigned"],
  );
});

test("uses printed source-page order instead of question numbers", () => {
  const input = [
    { ...page("source-3", 1, 0), sourcePageNumber: 3 },
    { ...page("source-1", 2, 1), sourcePageNumber: 1 },
    { ...page("source-2", 2, 2), sourcePageNumber: 2 },
  ];
  assert.deepEqual(sortBySourcePageNumber(input).map((item) => item.id), ["source-1", "source-2", "source-3"]);
});

test("keeps duplicate printed page numbers stable and unresolved pages last", () => {
  const input = [
    { ...page("page-4-first", 2, 0), sourcePageNumber: 4 },
    { ...page("unresolved-a", 1, 1), sourcePageNumber: null },
    { ...page("page-2", 3, 2), sourcePageNumber: 2 },
    { ...page("page-4-second", 4, 3), sourcePageNumber: 4 },
    { ...page("unresolved-b", null, 4), sourcePageNumber: null },
  ];
  assert.deepEqual(sortBySourcePageNumber(input).map((item) => item.id), [
    "page-2", "page-4-first", "page-4-second", "unresolved-a", "unresolved-b",
  ]);
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
