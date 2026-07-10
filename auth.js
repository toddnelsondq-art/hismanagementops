(function () {
  const state = {
    enabled: false,
    token: '',
    profile: null
  };

  window.dailyOpsAuth = state;
  window.dailyOpsAuthReady = start();

  function isHostedSite() {
    return !['localhost', '127.0.0.1', ''].includes(window.location.hostname) && window.location.protocol !== 'file:';
  }

  function blockHostedApp(message) {
    const overlay = makeOverlay(message);
    const input = overlay.querySelector('#authEmail');
    const button = overlay.querySelector('#authSendBtn');
    if (input) input.style.display = 'none';
    if (button) button.style.display = 'none';
    return new Promise(() => {});
  }

  function makeOverlay(message = 'Sign in with the email address that was invited to this app.') {
    let overlay = document.querySelector('#authOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'authOverlay';
    overlay.innerHTML = `
      <div class="auth-card">
        <img src="assets/his-management.png" alt="HIS Management Group Inc">
        <h2>HIS Operations Hub</h2>
        <p id="authMessage">${message}</p>
        <label>Email
          <input id="authEmail" type="email" placeholder="you@example.com" autocomplete="email">
        </label>
        <button id="authSendBtn">Send sign-in email</button>
        <p class="hint">Users can only join after they have been invited by an authorized manager.</p>
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
        overlay.querySelector('#authSendBtn').onclick = async () => {
          const email = overlay.querySelector('#authEmail').value.trim();
          if (!email) return setMessage('Enter the invited email address first.');
          const { error } = await client.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: window.location.origin }
          });
          setMessage(error ? error.message : 'Check your email for the sign-in link.');
        };
        return new Promise(() => {});
      }

      state.token = data.session.access_token;
      const accepted = await fetch('/api/accept-invite', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${state.token}`,
          'Content-Type': 'application/json'
        },
        body: '{}'
      });
      if (!accepted.ok) {
        const overlay = makeOverlay('This email is signed in, but it does not have an active invite.');
        overlay.querySelector('#authSendBtn').textContent = 'Send another sign-in email';
        overlay.querySelector('#authSendBtn').onclick = async () => {
          const email = overlay.querySelector('#authEmail').value.trim();
          if (!email) return setMessage('Enter the invited email address first.');
          await client.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
          setMessage('Check your email for the sign-in link.');
        };
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
})();
