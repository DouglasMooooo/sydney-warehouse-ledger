/** Only SH-* values are candidates for confirmed operational SH numbers. TH-* remains historical evidence. */
export function isOperationalShNumber(value: string): boolean {
  return /^SH-[A-Z0-9][A-Z0-9-]*$/.test(value.trim().toUpperCase());
}
