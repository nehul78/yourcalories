const KEY = 'yc.token';
let mem = null; // fallback when storage is blocked (private mode, embedded frames)
export const getToken = () => { try { return localStorage.getItem(KEY) || mem; } catch { return mem; } };
export const setToken = (t) => { mem = t || null; try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* private mode */ } };
let onAuthLost = () => {};
export const whenAuthLost = (fn) => { onAuthLost = fn; };

export async function api(method, url, body) {
  const headers = { 'x-tz-offset': String(new Date().getTimezoneOffset()) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (getToken()) headers.authorization = `Bearer ${getToken()}`;
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (res.status === 401 && getToken()) { setToken(null); onAuthLost(); }
  if (!res.ok) throw new Error(json?.error || 'Something went wrong.');
  return json;
}
export const GET = (u) => api('GET', u);
export const POST = (u, b = {}) => api('POST', u, b);
export const PUT = (u, b = {}) => api('PUT', u, b);
export const DEL = (u) => api('DELETE', u);

/** Fetch a protected file (photo / PDF) as an object URL. */
export async function blobUrl(url) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error('Could not load file.');
  return URL.createObjectURL(await res.blob());
}

export const ctx = { meta: null };
