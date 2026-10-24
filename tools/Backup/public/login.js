const form = document.getElementById('login-form');
const error = document.getElementById('login-error');
const submit = document.getElementById('login-submit');
form.addEventListener('submit', async event => {
  event.preventDefault();
  error.hidden = true; submit.disabled = true; submit.textContent = 'Signing in…';
  try {
    const response = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ username: form.elements.username.value, password: form.elements.password.value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Sign-in failed. Try again.');
    window.location.replace('/');
  } catch (failure) { error.textContent = failure.message; error.hidden = false; }
  finally { submit.disabled = false; submit.textContent = 'Sign in'; }
});
