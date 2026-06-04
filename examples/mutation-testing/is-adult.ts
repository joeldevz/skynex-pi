/**
 * Returns whether a person of the given age is an adult (18+).
 *
 * The boundary `>= 18` is the interesting part: a classic off-by-one bug
 * would be `> 18` (excluding 18-year-olds). A test suite that never checks
 * exactly 18 cannot tell the two apart — that is precisely the kind of gap
 * mutation testing is designed to surface.
 */
export const isAdult = (age: number): boolean => age >= 18;
