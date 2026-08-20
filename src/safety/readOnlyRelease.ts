export class ReadOnlyReleaseError extends Error {
  readonly code = 'READ_ONLY_RELEASE';
}

export function isReadOnlyRelease(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.READ_ONLY_RELEASE === 'true';
}

/** Mandatory guard for every future business mutation service or HTTP route. */
export function assertBusinessMutationAllowed(env: Readonly<Record<string, string | undefined>> = process.env): void {
  if (isReadOnlyRelease(env)) throw new ReadOnlyReleaseError('Business mutations are disabled during read-only release.');
}
