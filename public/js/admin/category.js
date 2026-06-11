// admin/category.js — category management with Cloudinary image upload

document.addEventListener('DOMContentLoaded', function () {

  // ── CLOUDINARY UPLOAD (same as products) ────────────
  async function uploadToCloudinary(file) {
    const sigRes = await fetch('/admin/cloudinary-signature');
    const sigData = await sigRes.json();

    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', sigData.apiKey);
    formData.append('timestamp', sigData.timestamp);
    formData.append('signature', sigData.signature);
    formData.append('folder', sigData.folder);

    const uploadRes = await fetch(
      `https://api.cloudinary.com/v1_1/${sigData.cloudName}/image/upload`,
      { method: 'POST', body: formData }
    );
    const uploadData = await uploadRes.json();

    if (uploadData.secure_url) return uploadData.secure_url;
    throw new Error('Cloudinary upload failed: ' + (uploadData.error?.message || 'unknown error'));
  }

  // ── IMAGE PREVIEW ────────────────────────────────────
  function setupPreview(inputId, previewImgId, previewWrapperId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('change', function () {
      const file = this.files[0];
      if (!file) return;
      const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowed.includes(file.type)) {
        Swal.fire({ icon: 'error', title: 'Error', text: 'Only JPEG, PNG, GIF or WebP allowed.' });
        this.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        Swal.fire({ icon: 'error', title: 'Error', text: 'Image must be under 5MB.' });
        this.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = function (e) {
        document.getElementById(previewImgId).src = e.target.result;
        document.getElementById(previewWrapperId).style.display = 'block';
      };
      reader.readAsDataURL(file);
    });
  }

  setupPreview('addCategoryImage', 'addPreviewImg', 'addImagePreview');
  setupPreview('editCategoryImage', 'editPreviewImg', 'editImagePreview');

  // ── HELPERS ──────────────────────────────────────────
  function setButtonLoading(btn, isLoading, loadingText = 'Processing...') {
    if (!btn) return;
    if (isLoading) {
      btn.dataset.originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${loadingText}`;
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.originalText || 'Submit';
    }
  }

  function validateCategoryName(name) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Category name is required');
    if (trimmed.length < 3) throw new Error('Category name must be at least 3 characters long');
    if (trimmed.length > 50) throw new Error('Category name cannot exceed 50 characters');
    if (name !== trimmed) throw new Error('Category name cannot start or end with spaces');
    const invalidChars = /[0-9_!@#$%^&*()\[\]{};:'"\\|<>\/=+]/;
    if (invalidChars.test(trimmed)) throw new Error('Category name can only contain letters, spaces, and hyphens');
    if (/\s{2,}|-{2,}/.test(trimmed)) throw new Error('Category name cannot contain consecutive spaces or hyphens');
    return trimmed;
  }

  // ── ADD CATEGORY ─────────────────────────────────────
  const addCategoryForm = document.getElementById('addCategoryForm');
  if (addCategoryForm) {
    addCategoryForm.onsubmit = async function (e) {
      e.preventDefault();
      const submitBtn = this.querySelector('button[type="submit"]');

      try {
        const name = validateCategoryName(document.getElementById('categoryName').value);
        const description = document.getElementById('categoryDescription').value.trim();
        const imageFile = document.getElementById('addCategoryImage').files[0];

        if (!imageFile) throw new Error('Please select a category image');

        setButtonLoading(submitBtn, true, 'Uploading image...');
        const imageUrl = await uploadToCloudinary(imageFile);

        setButtonLoading(submitBtn, true, 'Adding...');
        const response = await fetch('/admin/categories/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ name, description, image: imageUrl })
        });

        const data = await response.json().catch(() => ({ success: false, message: 'Invalid server response' }));
        if (response.ok && (data.success || data.message)) {
          await Swal.fire({ icon: 'success', title: 'Success!', text: data.message || 'Category added successfully', timer: 1500, timerProgressBar: true, showConfirmButton: false });
          window.location.reload();
        } else {
          throw new Error(data.message || 'Failed to add category');
        }
      } catch (error) {
        await Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'Failed to add category.', confirmButtonText: 'OK' });
      } finally {
        setButtonLoading(submitBtn, false);
      }
    };
  }

  // ── EDIT CATEGORY ────────────────────────────────────
  const editCategoryForm = document.getElementById('editCategoryForm');
  if (editCategoryForm) {
    editCategoryForm.onsubmit = async function (e) {
      e.preventDefault();
      const submitBtn = this.querySelector('button[type="submit"]');

      try {
        const categoryId = document.getElementById('editCategoryId').value;
        const name = validateCategoryName(document.getElementById('editCategoryName').value);
        const description = document.getElementById('editCategoryDescription').value.trim();
        const imageFile = document.getElementById('editCategoryImage').files[0];

        const payload = { name, description };

        if (imageFile) {
          setButtonLoading(submitBtn, true, 'Uploading image...');
          payload.image = await uploadToCloudinary(imageFile);
        }

        setButtonLoading(submitBtn, true, 'Saving...');
        const response = await fetch(`/admin/categories/edit/${categoryId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({ success: false, message: 'Invalid server response' }));
        if (response.ok && (data.success || data.message)) {
          await Swal.fire({ icon: 'success', title: 'Success!', text: data.message || 'Category updated successfully', timer: 1500, timerProgressBar: true, showConfirmButton: false });
          window.location.reload();
        } else {
          throw new Error(data.message || 'Failed to update category');
        }
      } catch (error) {
        await Swal.fire({ icon: 'error', title: 'Error', text: error.message || 'Failed to update category.', confirmButtonText: 'OK' });
      } finally {
        setButtonLoading(submitBtn, false);
      }
    };
  }

  // ── EDIT BUTTON — populate modal ─────────────────────
  document.querySelectorAll('.edit-category-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.getElementById('editCategoryId').value = this.getAttribute('data-category-id');
      document.getElementById('editCategoryName').value = this.getAttribute('data-category-name') || '';
      document.getElementById('editCategoryDescription').value = this.getAttribute('data-category-description') || '';

      const categoryImage = this.getAttribute('data-category-image');
      const currentImgWrap = document.getElementById('editCurrentImageWrap');
      const currentImg = document.getElementById('editCurrentImg');
      if (categoryImage) {
        currentImg.src = categoryImage;
        currentImgWrap.style.display = 'block';
      } else {
        currentImgWrap.style.display = 'none';
      }

      // Reset new image input + preview
      document.getElementById('editCategoryImage').value = '';
      document.getElementById('editImagePreview').style.display = 'none';

      new bootstrap.Modal(document.getElementById('editCategoryModal')).show();
    });
  });

  // ── BLOCK / UNBLOCK ───────────────────────────────────
  document.querySelectorAll('.block-category-btn').forEach(btn => {
    btn.addEventListener('click', async function () {
      const categoryId = this.getAttribute('data-category-id');
      const isBlocked = this.getAttribute('data-blocked') === 'true';
      const action = isBlocked ? 'unblock' : 'block';
      const actionText = isBlocked ? 'Unblock' : 'Block';

      try {
        setButtonLoading(this, true, 'Processing...');

        const result = await Swal.fire({
          title: `${actionText} Category`,
          text: `Are you sure you want to ${action} this category?`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: `Yes, ${actionText}`,
          cancelButtonText: 'Cancel',
          reverseButtons: true,
          showLoaderOnConfirm: true,
          preConfirm: async () => {
            try {
              const response = await fetch(`/admin/categories/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                body: JSON.stringify({ id: categoryId })
              });
              const data = await response.json().catch(() => ({}));
              if (!response.ok) throw new Error(data.message || `Failed to ${action} category`);
              return data;
            } catch (error) {
              Swal.showValidationMessage(`Request failed: ${error.message}`);
              return false;
            }
          },
          allowOutsideClick: () => !Swal.isLoading()
        });

        if (result.isConfirmed) {
          await Swal.fire({ icon: 'success', title: 'Success!', text: `Category ${action}ed successfully`, timer: 1500, timerProgressBar: true, showConfirmButton: false });
          window.location.reload();
        }
      } catch (error) {
        await Swal.fire({ icon: 'error', title: 'Error', text: error.message || `Failed to ${action} category.`, confirmButtonText: 'OK' });
      } finally {
        setButtonLoading(this, false);
      }
    });
  });

});