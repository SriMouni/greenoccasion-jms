export type FetchLike = typeof fetch;

export const buildUrl = (
  baseUrl: string,
  path: string,
  params: Record<string, string | number | boolean | undefined | null> = {}
) => {
  const url = new URL(path.replace(/^\//, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url;
};

export const requestJson = async <T>(
  provider: string,
  fetchImpl: FetchLike,
  url: URL,
  init?: RequestInit
): Promise<T> => {
  const response = await fetchImpl(url, init);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${provider} request failed: ${response.status} ${response.statusText}: ${body}`);
  }

  return await response.json() as T;
};