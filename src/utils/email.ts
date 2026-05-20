const EMAIL_PATTERN = /^[^\s@]+@(?:[^\s@.]+\.)+[^\s@.]{2,}$/;

export function isValidEmail(email: string): boolean {
  if (email.length === 0) {
    return false;
  }

  if (email !== email.trim()) {
    return false;
  }

  if (email.includes("..")) {
    return false;
  }

  return EMAIL_PATTERN.test(email);
}
