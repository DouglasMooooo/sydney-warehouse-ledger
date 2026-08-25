export class ReadOnlyReleaseError extends Error {
  readonly code = 'READ_ONLY_RELEASE';
}

export function isReadOnlyRelease(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.READ_ONLY_RELEASE === 'true';
}

export function isControlledWriteUat(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.READ_ONLY_RELEASE === 'false' && env.CONTROLLED_WRITE_UAT === 'true';
}

/** Mandatory production/UAT gate: false and missing both fail closed. */
export function assertReadOnlyRelease(env: Readonly<Record<string, string | undefined>> = process.env): void {
  if (!isReadOnlyRelease(env)) throw new ReadOnlyReleaseError('READ_ONLY_RELEASE=true is required for this deployment.');
}

/** Mandatory guard for every future business mutation service or HTTP route. */
export function assertBusinessMutationAllowed(env: Readonly<Record<string, string | undefined>> = process.env): void {
  if (!isControlledWriteUat(env)) throw new ReadOnlyReleaseError('Controlled business mutations require CONTROLLED_WRITE_UAT=true and READ_ONLY_RELEASE=false.');
}
