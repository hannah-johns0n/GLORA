// public/js/user/login.js
// Client-side validation and SweetAlert2 for login form

document.addEventListener('DOMContentLoaded', function () {
  const form = document.querySelector('form[action="/login"]');
  if (!form) return;

  form.onsubmit = async function (e) {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;

    if (!email || !password) {
      Swal.fire('Error', 'Please fill in both email and password.', 'error');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      Swal.fire('Error', 'Please enter a valid email address.', 'error');
      return;
    }
    // Optionally, add password length check
    if (password.length < 6) {
      Swal.fire('Error', 'Password must be at least 6 characters.', 'error');
      return;
    }

    // Prepare data for AJAX
    const formData = { email, password };
    try {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = { message: 'Login failed. (Invalid server response)' };
      }

      if (res.ok && data.success) {
        await Swal.fire('Success', data.message || 'Login successful!', 'success');
        window.location.href = '/';
      } else {
        Swal.fire('Error', data.message || 'Login failed. Please try again.', 'error');
      }
    } catch (err) {
      Swal.fire('Error', 'Server error. Please try again later.', 'error');
    }
  };
});
