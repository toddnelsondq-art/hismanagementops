(function () {
  const DEVICE_KEY = 'dqops-kiosk-device-token';
  const SESSION_KEY = 'dqops-kiosk-session';
  const PROFILE_KEY = 'dqops-kiosk-profile';
  const TENANT_KEY = 'dqops-tenant-id';
  const INACTIVITY_MS = 5 * 60 * 1000;
  const state = {
    enabled: false,
    token: '',
    profile: null,
    authMode: '',
    availableTenants: [],
    storageBucket: 'dailyops-uploads',
    tenant: { id: 'his-management', name: 'HIS Management Group Inc', logoUrl: 'assets/his-management.png', appName: 'HIS OPS', subtitle: 'Daily operations' }
  };

  window.dailyOpsAuth = state;
  window.dailyOpsAuthReady = start();

  function isNativeApp() {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  }

  function apiUrl(path) {
    return isNativeApp() && String(path).startsWith('/api/') ? `https://dqops.net${path}` : path;
  }

  function isHostedSite() {
    return isNativeApp() || (!['localhost', '127.0.0.1', ''].includes(window.location.hostname) && window.location.protocol !== 'file:');
  }

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }

  function overlayCard(content) {
    document.querySelector('#authOverlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'authOverlay';
    overlay.innerHTML = `<div class="auth-card"><img class="auth-logo" src="${escapeHtml(state.tenant.logoUrl)}" alt="${escapeHtml(state.tenant.name)}"><h2>${escapeHtml(state.tenant.appName || 'DQ OPS')}</h2>${content}</div>`;
    document.body.append(overlay);
    return overlay;
  }

  function blockHostedApp(message) {
    overlayCard(`<p>${escapeHtml(message)}</p>`);
    return new Promise(() => {});
  }

  async function request(path, options = {}, token = '') {
    const selectedTenant = state.profile?.tenantId || localStorage.getItem(TENANT_KEY) || '';
    const response = await fetch(apiUrl(path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(selectedTenant ? { 'X-DQOPS-Tenant': selectedTenant } : {}),
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || payload.message || 'Request failed');
      error.status = response.status;
      error.code = payload.code || '';
      throw error;
    }
    return payload;
  }

  function isExpiredPasswordSession(error) {
    return error?.status === 401 || /not signed in|invalid.*token|expired.*token|jwt.*expired/i.test(String(error?.message || ''));
  }

  async function clearPasswordSession() {
    state.token = '';
    state.profile = null;
    state.authMode = '';
    localStorage.removeItem('dailyops-current-user');
    await state.client?.auth?.signOut?.({ scope: 'local' }).catch(() => {});
  }

  async function loadSupabaseLibrary() {
    if (window.supabase?.createClient) return true;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    return Boolean(window.supabase?.createClient);
  }

  function beginInactivityLogout() {
    let timer;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        sessionStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(PROFILE_KEY);
        window.location.reload();
      }, INACTIVITY_MS);
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach(name => window.addEventListener(name, reset, { passive: true }));
    reset();
  }

  async function showKioskLogin(deviceToken) {
    let kiosk;
    try {
      kiosk = await request('/api/kiosk/employees', { cache: 'no-store' }, deviceToken);
    } catch (error) {
      localStorage.removeItem(DEVICE_KEY);
      return showPasswordLogin(error.message);
    }
    const employees = kiosk.employees || [];
    const overlay = overlayCard(`
      <p class="auth-subtitle">${escapeHtml(kiosk.location?.name || 'Store tablet')}</p>
      <form id="kioskLoginForm">
        <p id="authMessage">Select your name and enter your four-digit PIN.</p>
        <label>Your name<select id="kioskUser">${employees.map(user => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)}</option>`).join('')}</select></label>
        <label>PIN<input id="kioskPin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" placeholder="4-digit PIN"></label>
        <button id="kioskLoginBtn" type="submit">Start shift</button>
      </form>
      ${employees.length ? '' : '<p class="hint">No employees at this store have a PIN yet. Ask a manager to add one.</p>'}
      <button id="managerLoginBtn" class="ghost auth-secondary" type="button">Manager sign in</button>
      <button id="resetTabletBtn" class="auth-text-button" type="button">Change this tablet's store</button>
    `);
    overlay.querySelector('#managerLoginBtn').onclick = () => showPasswordLogin();
    overlay.querySelector('#resetTabletBtn').onclick = () => {
      if (window.confirm('Remove this tablet setup? A manager will need to enroll it again.')) {
        localStorage.removeItem(DEVICE_KEY);
        showPasswordLogin();
      }
    };
    const form = overlay.querySelector('#kioskLoginForm');
    form.onsubmit = async event => {
      event.preventDefault();
      const button = overlay.querySelector('#kioskLoginBtn');
      const message = overlay.querySelector('#authMessage');
      const pin = overlay.querySelector('#kioskPin').value;
      if (!/^\d{4}$/.test(pin)) { message.textContent = 'Enter your four-digit PIN.'; return; }
      button.disabled = true;
      button.textContent = 'Signing in…';
      try {
        const result = await request('/api/kiosk/login', { method: 'POST', body: JSON.stringify({ userId: overlay.querySelector('#kioskUser').value, pin }) }, deviceToken);
        sessionStorage.setItem(SESSION_KEY, result.token);
        sessionStorage.setItem(PROFILE_KEY, JSON.stringify(result.profile));
        window.location.reload();
      } catch (error) {
        message.textContent = error.message;
        overlay.querySelector('#kioskPin').value = '';
        button.disabled = false;
        button.textContent = 'Start shift';
      }
    };
    overlay.querySelector('#kioskPin').focus();
    return new Promise(() => {});
  }

  function showEnrollment() {
    const overlay = overlayCard(`
      <p class="auth-subtitle">Set up this store tablet</p>
      <form id="enrollForm">
        <p id="authMessage">Enter the setup code generated by a manager in DQ OPS.</p>
        <label>Setup code<input id="enrollmentCode" inputmode="text" maxlength="8" autocomplete="off" placeholder="8-character code"></label>
        <button id="enrollBtn" type="submit">Connect tablet</button>
      </form>
      <button id="backToLoginBtn" class="ghost auth-secondary" type="button">Back to manager sign in</button>
    `);
    overlay.querySelector('#backToLoginBtn').onclick = () => showPasswordLogin();
    overlay.querySelector('#enrollForm').onsubmit = async event => {
      event.preventDefault();
      const button = overlay.querySelector('#enrollBtn');
      const message = overlay.querySelector('#authMessage');
      button.disabled = true;
      try {
        const result = await request('/api/kiosk/enroll', { method: 'POST', body: JSON.stringify({ code: overlay.querySelector('#enrollmentCode').value }) });
        localStorage.setItem(DEVICE_KEY, result.token);
        return showKioskLogin(result.token);
      } catch (error) {
        message.textContent = error.message;
        button.disabled = false;
      }
    };
    overlay.querySelector('#enrollmentCode').focus();
    return new Promise(() => {});
  }

  async function showPasswordLogin(message = 'Sign in with the email and password provided by your manager.') {
    const overlay = overlayCard(`
      <p class="auth-subtitle">Management sign in</p>
      <form id="authForm">
        <p id="authMessage">${escapeHtml(message)}</p>
        <label>Email<input id="authEmail" type="email" placeholder="you@example.com" autocomplete="email"></label>
        <label>Password<input id="authPassword" type="password" placeholder="Password or temporary password" autocomplete="current-password"></label>
        <button id="authPasswordBtn" type="submit">Sign in</button>
      </form>
      <button id="setupTabletBtn" class="ghost auth-secondary" type="button">Set up a store tablet</button>
      <p class="hint">Employee PIN sign-in works only on a tablet enrolled to a store.</p>
    `);
    overlay.querySelector('#setupTabletBtn').onclick = showEnrollment;
    const button = overlay.querySelector('#authPasswordBtn');
    overlay.querySelector('#authForm').onsubmit = async event => {
      event.preventDefault();
      const email = overlay.querySelector('#authEmail').value.trim();
      const password = overlay.querySelector('#authPassword').value;
      if (!email || !password) { overlay.querySelector('#authMessage').textContent = 'Enter your email and password.'; return; }
      button.disabled = true;
      button.textContent = 'Signing in…';
      const { error } = await state.client.auth.signInWithPassword({ email, password });
      if (error) {
        overlay.querySelector('#authMessage').textContent = error.message;
        button.disabled = false;
        button.textContent = 'Sign in';
        return;
      }
      window.location.reload();
    };
    overlay.querySelector('#authEmail').focus();
    return new Promise(() => {});
  }

  function isPasswordRecoveryUrl() {
    return /(?:^|[&#?])type=recovery(?:&|$)/i.test(`${window.location.search}${window.location.hash}`);
  }

  function showPasswordRecovery() {
    const overlay = overlayCard(`
      <p class="auth-subtitle">Choose a new password</p>
      <form id="passwordRecoveryForm">
        <p id="authMessage">Enter a new password with at least eight characters.</p>
        <label>New password<input id="recoveryPassword" type="password" minlength="8" autocomplete="new-password"></label>
        <label>Confirm password<input id="recoveryPasswordConfirm" type="password" minlength="8" autocomplete="new-password"></label>
        <button id="recoveryPasswordBtn" type="submit">Save new password</button>
      </form>
    `);
    overlay.querySelector('#passwordRecoveryForm').onsubmit = async event => {
      event.preventDefault();
      const message = overlay.querySelector('#authMessage');
      const button = overlay.querySelector('#recoveryPasswordBtn');
      const password = overlay.querySelector('#recoveryPassword').value;
      const confirmation = overlay.querySelector('#recoveryPasswordConfirm').value;
      if (password.length < 8) { message.textContent = 'Use at least eight characters.'; return; }
      if (password !== confirmation) { message.textContent = 'The passwords do not match.'; return; }
      button.disabled = true;
      button.textContent = 'Saving…';
      const { error } = await state.client.auth.updateUser({ password });
      if (error) {
        message.textContent = error.message;
        button.disabled = false;
        button.textContent = 'Save new password';
        return;
      }
      window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search.replace(/([?&])type=recovery(&|$)/, '$1').replace(/[?&]$/, '')}`);
      window.location.reload();
    };
    overlay.querySelector('#recoveryPassword').focus();
    return new Promise(() => {});
  }

  async function start() {
    try {
      const rememberedTenant = localStorage.getItem(TENANT_KEY) || '';
      const response = await fetch(apiUrl('/api/public-config'), {
        cache: 'no-store',
        headers: rememberedTenant ? { 'X-DQOPS-Tenant': rememberedTenant } : {}
      });
      if (!response.ok) return isHostedSite() ? blockHostedApp('Hosted login is not connected yet.') : state;
      const config = await response.json();
      state.enabled = Boolean(config.authEnabled);
      state.storageBucket = config.storageBucket || state.storageBucket;
      state.tenant = { ...state.tenant, ...(config.tenant || {}) };
      if (!state.enabled) return isHostedSite() ? blockHostedApp('Hosted login is not configured yet.') : state;

      const kioskSession = sessionStorage.getItem(SESSION_KEY);
      const kioskProfile = sessionStorage.getItem(PROFILE_KEY);
      if (kioskSession && kioskProfile) {
        try {
          const verified = await request('/api/kiosk/session-profile', { method: 'POST', body: '{}' }, kioskSession);
          state.token = kioskSession;
          state.profile = verified.profile;
          state.tenant = { ...state.tenant, ...(verified.tenant || {}) };
          state.authMode = 'kiosk';
          if (state.profile?.tenantId) localStorage.setItem(TENANT_KEY, state.profile.tenantId);
          localStorage.setItem('dailyops-current-user', state.profile.id);
          beginInactivityLogout();
          return state;
        } catch {
          sessionStorage.removeItem(SESSION_KEY);
          sessionStorage.removeItem(PROFILE_KEY);
        }
      }

      await loadSupabaseLibrary();
      const passwordRecoveryRequested = isPasswordRecoveryUrl();
      state.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      const { data, error: sessionError } = await state.client.auth.getSession();
      if (sessionError) await clearPasswordSession();
      if (passwordRecoveryRequested) {
        if (data?.session) return showPasswordRecovery();
        await clearPasswordSession();
        return showPasswordLogin('That password reset link has expired. Ask an administrator to send another one.');
      }
      if (data?.session) {
        try {
          state.token = data.session.access_token;
          const accepted = await request('/api/session-profile', { method: 'POST', body: '{}' }, state.token);
          state.profile = accepted.profile;
          state.tenant = { ...state.tenant, ...(accepted.tenant || {}) };
          state.availableTenants = accepted.availableTenants || [];
          state.authMode = 'password';
          if (state.profile?.tenantId) localStorage.setItem(TENANT_KEY, state.profile.tenantId);
          localStorage.setItem('dailyops-current-user', state.profile.id);
          return state;
        } catch (error) {
          if (!isExpiredPasswordSession(error)) throw error;
          await clearPasswordSession();
          const deviceToken = localStorage.getItem(DEVICE_KEY);
          return deviceToken ? showKioskLogin(deviceToken) : showPasswordLogin('Your session expired. Please sign in again.');
        }
      }

      const deviceToken = localStorage.getItem(DEVICE_KEY);
      return deviceToken ? showKioskLogin(deviceToken) : showPasswordLogin();
    } catch (error) {
      return isHostedSite() ? blockHostedApp(error.message || 'Hosted login could not start.') : state;
    }
  }

  window.dailyOpsSignOut = async function () {
    if (state.authMode === 'kiosk') {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(PROFILE_KEY);
    } else if (state.client) {
      await state.client.auth.signOut();
    }
    localStorage.removeItem('dailyops-current-user');
    window.location.reload();
  };
})();
