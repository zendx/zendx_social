let csrf = '';
export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), 'X-CSRF-Token': csrf, ...options.headers },
    body: options.body instanceof FormData ? options.body : options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Invalid API response');
  } catch {
    const error = new Error('The sign-in service returned an invalid response. Make sure the Node API is running and /api requests are routed to it. For local development, run npm run dev and open http://localhost:5173.');
    error.status = response.status;
    throw error;
  }
  if (!response.ok) { const error = new Error(result.error || 'Something went wrong. Please try again.'); error.status = response.status; throw error; }
  if (result.csrf) csrf = result.csrf;
  return result;
}
