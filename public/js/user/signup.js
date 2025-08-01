// public/js/user/signup.js
// Client-side validation and SweetAlert2 integration for signup form

document.addEventListener('DOMContentLoaded', function () {
  const form = document.querySelector('form[action="/signup"]');
  if (!form) return;

  form.onsubmit = async function (e) {
    e.preventDefault();
    // Basic client-side validation
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const phone = form.phoneNumber.value.trim();
    const password = form.password.value;
    const confirmPassword = form.confirmPassword.value;
    const terms = form.terms.checked;

    if (!name || !email || !phone || !password || !confirmPassword) {
      Swal.fire('Error', 'Please fill in all fields.', 'error');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      Swal.fire('Error', 'Please enter a valid email address.', 'error');
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      Swal.fire('Error', 'Please enter a valid 10-digit phone number.', 'error');
      return;
    }
    if (password.length < 6) {
      Swal.fire('Error', 'Password must be at least 6 characters.', 'error');
      return;
    }
    if (password !== confirmPassword) {
      Swal.fire('Error', 'Passwords do not match.', 'error');
      return;
    }
    if (!terms) {
      Swal.fire('Error', 'You must agree to the Terms & Privacy Policy.', 'error');
      return;
    }

    // Prepare data for AJAX
    const formData = {
      name,
      email,
      phoneNumber: phone,
      password,
      confirmPassword
    };

    try {
      const res = await fetch('/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json().catch(() => ({ message: 'Signup failed.' }));
      if (res.ok && data.success) {
        await Swal.fire('Success', data.message || 'Signup successful! Please log in.', 'success');
        if (data.redirect) {
          window.location.href = data.redirect;
        } else {
          window.location.href = '/login';
        }
      } else {
        Swal.fire('Error', data.message || 'Signup failed. Please try again.', 'error');
      }
    } catch (err) {
      Swal.fire('Error', 'Server error. Please try again later.', 'error');
    }
  };
});
