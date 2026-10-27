const elements = Object.fromEntries(['session', 'login', 'read', 'action', 'logout', 'feedback', 'result', 'purchase'].map(id => [id, document.getElementById(id)]));
let csrf = '', busy = false;
function setBusy(value) { busy = value; for (const key of ['login', 'read', 'action', 'logout']) elements[key].disabled = value || !csrf; }
async function call(path, method = 'GET') {
  const response = await fetch(path, {method, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    ...(method === 'POST' ? {headers: {'content-type': 'application/json', 'x-pact-csrf': csrf}, body: '{}'} : {})});
  const data = await response.json();
  if (!response.ok) {
    elements.purchase.hidden = true;
    if (data.purchase?.url) {
      const url = new URL(data.purchase.url);
      if (url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
        elements.purchase.href = url.href; elements.purchase.hidden = false;
      }
    }
    throw Error(data.error?.code || 'APP_UNAVAILABLE');
  }
  return data;
}
async function load() {
  setBusy(true);
  try {
    const data = await call('/api/session'); csrf = data.csrfToken;
    elements.session.textContent = data.authenticated ? `Signed in as ${data.walletAddress}. Licensing is checked per protected request.` : 'Signed out. Protected content remains denied.';
    if (data.message) elements.feedback.textContent = data.message;
  } catch { csrf = ''; elements.feedback.textContent = 'App session unavailable. Reload before retrying.'; }
  finally { setBusy(false); }
}
async function perform(work) {
  if (busy) return; setBusy(true); elements.feedback.textContent = ''; elements.result.textContent = ''; elements.purchase.hidden = true;
  try { await work(); }
  catch (error) { elements.feedback.textContent = `Access remains denied: ${/^[A-Z][A-Z0-9_]{0,79}$/.test(error.message) ? error.message : 'APP_UNAVAILABLE'}.`; }
  finally { setBusy(false); }
}
elements.login.addEventListener('click', () => void perform(async () => {
  const {loginUrl} = await call('/api/login/start', 'POST');
  const url = new URL(loginUrl);
  if (url.pathname !== '/connect' || url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw Error('APP_LOGIN_INVALID');
  window.location.assign(url.href);
}));
elements.read.addEventListener('click', () => void perform(async () => { const result = await call('/api/protected'); elements.result.textContent = JSON.stringify(result, null, 2); }));
elements.action.addEventListener('click', () => void perform(async () => { const result = await call('/api/action', 'POST'); elements.result.textContent = JSON.stringify(result, null, 2); }));
elements.logout.addEventListener('click', () => void perform(async () => {
  const data = await call('/api/logout', 'POST'); csrf = ''; elements.result.textContent = '';
  elements.feedback.textContent = data.grantRevocationConfirmed ? 'App session cleared and PACT grant revoked.' : 'Local session cleared. Remote grant revocation was not confirmed; the grant still has its hard expiry.';
  await load();
}));
void load();
