/**
 * Egyptian phone numbers: friendly to type, canonical to store.
 *
 * The number on a delivery address is not decoration — it is how the courier
 * finds the door when the landmark runs out. So it has to be right, and it has
 * to be easy to enter: an Egyptian writes `0100 123 4567`, not `+201001234567`.
 *
 * DELIBERATELY NOT A GENERAL PHONE LIBRARY. `libphonenumber` is ~250 KB of
 * bundle to validate 200 countries when AKALT serves one, and a wrong answer
 * for Egypt is the only wrong answer that can hurt us today. What is here is
 * the Egyptian rule, stated once, plus an E.164 shape the database enforces so
 * a second country is a new branch rather than a migration.
 */

/** Egypt. The only country AKALT delivers in, and the only one assumed here. */
const EGYPT_DIALLING_CODE = '20';

/**
 * The four Egyptian mobile networks, by prefix after the leading zero.
 *
 * 010 Vodafone · 011 Etisalat · 012 Orange · 015 WE. Landlines are not
 * accepted: a courier needs to reach somebody who is at the door, and a
 * landline is the number of a room nobody is standing in.
 */
const MOBILE_PREFIXES = ['10', '11', '12', '15'];

/** Digits only. Anything a person might type between them is noise. */
function digitsOf(input: string): string {
  return input.replace(/[^\d]/g, '');
}

/**
 * Turns what somebody typed into E.164, or null if it is not a valid Egyptian
 * mobile number.
 *
 * Accepts every shape an Egyptian would reasonably write:
 *
 *   0100 123 4567     national, spaced
 *   01001234567       national
 *   1001234567        national, leading zero dropped
 *   +20 100 123 4567  international
 *   0020 100 1234567  international, 00 prefix
 *
 * Returns null rather than throwing, and null rather than guessing: a number
 * we cannot read is not a number we should store.
 */
export function toE164Egyptian(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  let digits = digitsOf(raw);

  // `00` is the international prefix in Egypt, and `+` survives as nothing
  // after the digit strip, so both arrive here as a leading country code.
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith(EGYPT_DIALLING_CODE) && digits.length > 10) {
    digits = digits.slice(EGYPT_DIALLING_CODE.length);
  }
  // National form: a leading zero the country code replaces.
  if (digits.startsWith('0')) digits = digits.slice(1);

  // What must remain is the network prefix and 8 subscriber digits: `10` for
  // Vodafone plus `01234567`. The prefix is the FIRST two digits once the
  // national zero is gone, not the two after the 1.
  if (digits.length !== 10) return null;
  if (!MOBILE_PREFIXES.includes(digits.slice(0, 2))) return null;

  return `+${EGYPT_DIALLING_CODE}${digits}`;
}

/** Whether a stored value is already canonical. */
export function isE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

/**
 * A stored number, written the way an Egyptian reads one.
 *
 * `+201001234567` → `0100 123 4567`. Shown rather than the E.164 form because
 * the person checking their own delivery address is checking it against the
 * number in their head, not against a standard.
 */
export function formatEgyptianPhone(e164: string): string {
  const digits = digitsOf(e164);
  if (!digits.startsWith(EGYPT_DIALLING_CODE) || digits.length !== 12) return e164;

  const national = `0${digits.slice(EGYPT_DIALLING_CODE.length)}`;
  return `${national.slice(0, 4)} ${national.slice(4, 7)} ${national.slice(7)}`;
}
