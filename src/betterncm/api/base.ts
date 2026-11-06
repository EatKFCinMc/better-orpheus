declare const BETTERNCM_API_KEY: string;
declare const BETTERNCM_API_PATH: string;
export function betterncmFetch(
  relPath: string,
  option: RequestInit & { ignoreApiKey?: boolean } = {}
) {
  const { ignoreApiKey, ...init } = option;
  const headers = new Headers(init.headers);
  if (!ignoreApiKey) headers.set("BETTERNCM_API_KEY", BETTERNCM_API_KEY);
  return fetch(BETTERNCM_API_PATH + relPath, { ...init, headers });
}
