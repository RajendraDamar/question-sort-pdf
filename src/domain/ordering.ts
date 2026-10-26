/**
 * Pure domain rules: question numbers, not filenames or timestamps, determine
 * the primary sequence. Unassigned pages remain at the end.
 */
export interface NumberedPage {
  id: string;
  questionNumber: number | null;
  originalIndex: number;
}

export interface NumberingReport {
  unnumberedPageIds: string[];
  duplicateNumbers: number[];
  missingNumbers: number[];
}

export function sortByQuestionNumber<T extends NumberedPage>(pages: T[]): T[] {
  return [...pages].sort((a, b) => {
    if (a.questionNumber === null && b.questionNumber === null) return 0;
    if (a.questionNumber === null) return 1;
    if (b.questionNumber === null) return -1;
    // JavaScript sorting is stable: equal question numbers retain the
    // user's current order, including manually arranged continuation pages.
    return a.questionNumber - b.questionNumber;
  });
}

/** Gaps are review clues, not proof that a page is missing. */
export function inspectNumbering(pages: NumberedPage[]): NumberingReport {
  const assigned = pages.map((page) => page.questionNumber)
    .filter((value): value is number => value !== null && Number.isInteger(value) && value > 0);
  const counts = new Map<number, number>();
  for (const number of assigned) counts.set(number, (counts.get(number) ?? 0) + 1);

  const duplicateNumbers = [...counts.entries()]
    .filter(([, count]) => count > 1).map(([number]) => number).sort((a, b) => a - b);
  const missingNumbers: number[] = [];

  if (assigned.length > 1) {
    const min = Math.min(...assigned);
    const max = Math.max(...assigned);
    for (let number = min; number <= max; number += 1) {
      if (!counts.has(number)) missingNumbers.push(number);
      if (missingNumbers.length >= 100) break;
    }
  }

  return {
    unnumberedPageIds: pages.filter((page) => page.questionNumber === null).map((page) => page.id),
    duplicateNumbers,
    missingNumbers,
  };
}
