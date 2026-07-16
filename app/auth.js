(function () {
  const state = {
    enabled: false,
    token: '',
    profile: null,
    storageBucket: 'dailyops-uploads',
    tenant: {
      id: 'his-management',
      name: 'HIS Management Group Inc',
      logoUrl: 'assets/his-management.png',
      appName: 'HIS OPS',
      subtitle: 'Daily operations'
    }
  };

  window.dailyOpsAuth = state;
  window.dailyOpsAuthReady = start();

  function isHostedSite() {
    return !['localhost', '127.0.0.1', ''].includes(window.location.hostname) && window.location.protocol !== 'file:';
  }

  function blockHostedApp(message) {
    const overlay = makeOverlay(message);
    const input = overlay.querySelector('#authEmail');
    const password = overlay.querySelector('#authPassword');
    const button = overlay.querySelector('#authSendBtn');
    const passwordButton = overlay.querySelector('#authPasswordBtn');
    if (input) input.style.display = 'none';
    if (password) password.style.display = 'none';
    if (button) button.style.display = 'none';
    if (passwordButton) passwordButton.style.display = 'none';
    return new Promise(() => {});
  }

  function makeOverlay(message = 'Sign in with the email and password provided by your manager.') {
    let overlay = document.querySelector('#authOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'authOverlay';
    overlay.innerHTML = `
      <div class="auth-card">
        <img class="auth-logo" src="${state.tenant.logoUrl}" alt="${state.tenant.name}">
        <h2>${state.tenant.appName || 'Operations Hub'}</h2>
        <p class="auth-subtitle">Daily checklists, temperatures, maintenance, and operations</p>
        <p id="authMessage">${message}</p>
        <label>Email
          <input id="authEmail" type="email" placeholder="you@example.com" autocomplete="email">
        </label>
        <label>Password
          <input id="authPassword" type="password" placeholder="Password or temporary password" autocomplete="current-password">
        </label>
        <button id="authPasswordBtn">Sign in</button>
        <p class="hint">Users can only join after they have been created by an authorized manager.</p>
        <p class="auth-version">Login mode: email + password</p>
      </div>
    `;
    document.body.append(overlay);
    return overlay;
  }

  function setMessage(message) {
    const messageElement = document.querySelector('#authMessage');
    if (messageElement) messageElement.textContent = message;
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

  async function start() {
    try {
      const response = await fetch('/api/public-config', { cache: 'no-store' });
      if (!response.ok) {
        if (isHostedSite()) return blockHostedApp('Hosted login is not connected yet. Check the Netlify environment variables and redeploy the site.');
        return state;
      }
      const config = await response.json();
      state.enabled = Boolean(config.authEnabled);
      state.storageBucket = config.storageBucket || state.storageBucket;
      state.tenant = { ...state.tenant, ...(config.tenant || {}) };
      if (!state.enabled) {
        if (isHostedSite()) return blockHostedApp('Hosted login is not configured yet. Add SUPABASE_URL and SUPABASE_ANON_KEY in Netlify, then redeploy.');
        return state;
      }
      await loadSupabaseLibrary();
      const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
      state.client = client;

      const { data } = await client.auth.getSession();
      if (!data.session) {
        const overlay = makeOverlay();
        overlay.querySelector('#authPasswordBtn').onclick = async () => {
          const email = overlay.querySelector('#authEmail').value.trim();
          const password = overlay.querySelector('#authPassword').value;
          if (!email || !password) return setMessage('Enter your email and password.');
          const { error } = await client.auth.signInWithPassword({ email, password });
          if (error) return setMessage(error.message);
          window.location.reload();
        };
        return new Promise(() => {});
      }

      state.token = data.session.access_token;
      const accepted = await fetch('/api/session-profile', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.token}`,
          'Content-Type': 'application/json'
        },
        body: '{}'
      });
      if (!accepted.ok) {
        let message = 'This login is not attached to an active app user.';
        try {
          const payload = await accepted.json();
          message = payload.error || message;
        } catch {}
        const overlay = makeOverlay(message);
        overlay.querySelector('#authPasswordBtn').onclick = async () => {
          await client.auth.signOut();
          window.location.reload();
        };
        overlay.querySelector('#authPasswordBtn').textContent = 'Sign out and try another account';
        return new Promise(() => {});
      }
      const payload = await accepted.json();
      state.profile = payload.profile;
      window.localStorage.setItem('dailyops-current-user', payload.profile.id);
      document.querySelector('#authOverlay')?.remove();
      return state;
    } catch {
      if (isHostedSite()) return blockHostedApp('Hosted login could not start. Check that the Netlify function deployed and the Supabase settings are saved.');
      return state;
    }
  }

  window.dailyOpsSignOut = async function () {
    if (state.client) await state.client.auth.signOut();
    window.localStorage.removeItem('dailyops-current-user');
    window.location.reload();
  };
})();
