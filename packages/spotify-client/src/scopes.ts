export const SPOTIFY_PLAYBACK_SCOPE = "user-read-playback-state" as const;
export const SPOTIFY_MODIFY_PLAYBACK_SCOPE =
  "user-modify-playback-state" as const;

export const SPOTIFY_PLAYBACK_SCOPES = Object.freeze([
  SPOTIFY_PLAYBACK_SCOPE,
  SPOTIFY_MODIFY_PLAYBACK_SCOPE,
] as const);

const REQUIRED_SCOPE_SET = new Set<string>(SPOTIFY_PLAYBACK_SCOPES);

export function normalizeSpotifyScopes(
  value: readonly unknown[],
  path: string,
  details: string[],
  allowLegacyReadOnly: boolean,
): readonly string[] | undefined {
  const scopes = new Set<string>();
  value.forEach((scope, index) => {
    if (typeof scope !== "string" || scope.trim().length === 0) {
      details.push(`${path}[${index}]: must be a non-empty string`);
      return;
    }
    if (!REQUIRED_SCOPE_SET.has(scope)) {
      details.push(`${path}[${index}]: unsupported scope`);
      return;
    }
    if (scopes.has(scope)) {
      details.push(`${path}[${index}]: duplicate scope`);
      return;
    }
    scopes.add(scope);
  });
  if (details.length > 0) return undefined;
  if (
    allowLegacyReadOnly &&
    scopes.size === 1 &&
    scopes.has(SPOTIFY_PLAYBACK_SCOPE)
  ) {
    return Object.freeze([SPOTIFY_PLAYBACK_SCOPE]);
  }
  if (
    scopes.size !== SPOTIFY_PLAYBACK_SCOPES.length ||
    !SPOTIFY_PLAYBACK_SCOPES.every((scope) => scopes.has(scope))
  ) {
    details.push(
      `${path}: must grant exactly ${SPOTIFY_PLAYBACK_SCOPES.join(", ")}`,
    );
    return undefined;
  }
  return SPOTIFY_PLAYBACK_SCOPES;
}

export function hasRequiredSpotifyScopes(scopes: readonly string[]): boolean {
  return (
    scopes.length === SPOTIFY_PLAYBACK_SCOPES.length &&
    SPOTIFY_PLAYBACK_SCOPES.every((scope) => scopes.includes(scope))
  );
}
