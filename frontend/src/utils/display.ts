export function isPlaceholder(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") {
    const v = value.trim();
    return !v || v.startsWith("PLACEHOLDER");
  }
  if (Array.isArray(value)) {
    return value.length === 0 || value.every(isPlaceholder);
  }
  return false;
}

export function displayText(value: string | null | undefined, fallback = "Not yet provided"): string {
  if (!value || isPlaceholder(value)) return fallback;
  return value;
}

export function cleanList(values: string[] | undefined): string[] {
  return (values || []).filter((v) => !isPlaceholder(v));
}
