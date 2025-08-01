// admin/category.js - Handles add/edit/delete/block/unblock category operations

document.addEventListener('DOMContentLoaded', function () {
  // Add Category Form
  const addCategoryForm = document.getElementById('addCategoryForm');
  if (addCategoryForm) {
    addCategoryForm.onsubmit = handleAddCategory;
  }

  // Edit Category Form
  const editCategoryForm = document.getElementById('editCategoryForm');
  if (editCategoryForm) {
    editCategoryForm.onsubmit = handleEditCategory;
  }

  // Block/Unblock Category Buttons
  document.querySelectorAll('.block-category-btn').forEach(btn => {
    btn.addEventListener('click', handleBlockUnblockCategory);
  });
});

// Helper Functions
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

async function handleApiRequest(url, options = {}) {
  try {
    const defaultHeaders = {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/json'
    };

    const response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({
      success: false,
      message: 'Invalid server response'
    }));

    if (!response.ok) {
      throw new Error(data.message || 'Request failed');
    }

    return { success: true, data };
  } catch (error) {
    console.error('API request failed:', error);
    return {
      success: false,
      message: error.message || 'An error occurred. Please try again.'
    };
  }
}

// Form Handlers
async function handleAddCategory(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  
  try {
    setButtonLoading(submitBtn, true, 'Adding...');
    
    const formData = new FormData(form);
    const { success, data, message } = await handleApiRequest('/admin/categories/add', {
      method: 'POST',
      body: formData,
      headers: {}
    });

    if (success) {
      await Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: data.message || 'Category added successfully',
        timer: 1500,
        timerProgressBar: true,
        showConfirmButton: false
      });
      window.location.reload();
    } else {
      throw new Error(message);
    }
  } catch (error) {
    await Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.message || 'Failed to add category. Please try again.',
      confirmButtonText: 'OK'
    });
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

async function handleEditCategory(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  const categoryId = formData.get('categoryId');
  
  try {
    setButtonLoading(submitBtn, true, 'Saving...');
    
    const { success, data, message } = await handleApiRequest(`/admin/categories/edit/${categoryId}`, {
      method: 'POST',
      body: formData,
      headers: {}
    });

    if (success) {
      await Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: data.message || 'Category updated successfully',
        timer: 1500,
        timerProgressBar: true,
        showConfirmButton: false
      });
      window.location.reload();
    } else {
      throw new Error(message);
    }
  } catch (error) {
    await Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.message || 'Failed to update category. Please try again.',
      confirmButtonText: 'OK'
    });
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

async function handleBlockUnblockCategory(e) {
  const btn = e.currentTarget;
  const categoryId = btn.getAttribute('data-category-id');
  const isBlocked = btn.getAttribute('data-blocked') === 'true';
  const action = isBlocked ? 'unblock' : 'block';
  const actionText = isBlocked ? 'Unblock' : 'Block';
  
  try {
    setButtonLoading(btn, true, 'Processing...');
    
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
          const { success, data, message } = await handleApiRequest(`/admin/categories/${action}`, {
            method: 'POST',
            body: JSON.stringify({ id: categoryId })
          });
          
          if (!success) throw new Error(message);
          return data;
        } catch (error) {
          Swal.showValidationMessage(`Request failed: ${error.message}`);
          return false;
        }
      },
      allowOutsideClick: () => !Swal.isLoading()
    });

    if (result.isConfirmed) {
      await Swal.fire({
        icon: 'success',
        title: 'Success!',
        text: result.value?.message || `Category ${action}ed successfully`,
        timer: 1500,
        timerProgressBar: true,
        showConfirmButton: false
      });
      window.location.reload();
    }
  } catch (error) {
    await Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.message || `Failed to ${action} category. Please try again.`,
      confirmButtonText: 'OK'
    });
  } finally {
    setButtonLoading(btn, false);
  }
}

// Helper for edit modal
function openEditModal(id, categoryName, description) {
  document.getElementById('editCategoryId').value = id;
  document.getElementById('editCategoryName').value = categoryName;
  document.getElementById('editCategoryDescription').value = description;
  const editModal = new bootstrap.Modal(document.getElementById('editCategoryModal'));
  editModal.show();
}

// Make openEditModal available globally
window.openEditModal = openEditModal;
