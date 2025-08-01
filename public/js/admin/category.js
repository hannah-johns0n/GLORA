// admin/category.js - Handles add/edit category with Fetch API for admin panel
document.addEventListener('DOMContentLoaded', function () {
  // Add Category
const addCategoryForm = document.getElementById('addCategoryForm');
if (addCategoryForm) {
  addCategoryForm.onsubmit = async function (e) {
    e.preventDefault();
    e.stopPropagation();
    console.log('Add category form submitted');
    
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    
    try {
      // Disable submit button and show loading state
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding...';
      
      // Get form data
      const formData = new FormData(this);
      const data = {
        name: formData.get('name'),
        description: formData.get('description')
      };
      console.log('Form data:', data);

      // Validate input
      const categoryName = data.name.trim();
      
      if (!categoryName) {
        console.error('Validation failed: Category name is required');
        throw new Error('Category name is required');
      }
      
      // Check minimum and maximum length
      if (categoryName.length < 3) {
        console.error('Validation failed: Category name is too short');
        throw new Error('Category name must be at least 3 characters long');
      }
      
      if (categoryName.length > 50) {
        console.error('Validation failed: Category name is too long');
        throw new Error('Category name cannot exceed 50 characters');
      }
      
      // Check if name starts with space
      if (data.name !== categoryName) {
        console.error('Validation failed: Category name cannot start or end with spaces');
        throw new Error('Category name cannot start or end with spaces');
      }
      
      // Check for numbers, underscores, or special characters (only allow letters, spaces, and hyphens)
      const invalidChars = /[0-9_!@#$%^&*()\[\]{};:'"\\|<>\/=+]/;
      if (invalidChars.test(categoryName)) {
        console.error('Validation failed: Category name contains invalid characters');
        throw new Error('Category name can only contain letters, spaces, and hyphens');
      }
      
      // Check for consecutive spaces or hyphens
      if (/\s{2,}|-{2,}/.test(categoryName)) {
        console.error('Validation failed: Category name contains consecutive spaces or hyphens');
        throw new Error('Category name cannot contain consecutive spaces or hyphens');
      }

      console.log('Sending request to /admin/categories/add');
      const response = await fetch('/admin/categories/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(data)
      });

      const responseData = await response.json().catch(() => ({
        success: false,
        message: 'Invalid server response'
      }));

      if (response.ok && responseData.success) {
        await Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: responseData.message || 'Category added successfully',
          timer: 1500,
          timerProgressBar: true,
          showConfirmButton: false
        });
        window.location.reload();
      } else {
        throw new Error(responseData.message || 'Failed to add category');
      }
    } catch (error) {
      console.error('Add category error:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'Failed to add category. Please try again.',
        confirmButtonText: 'OK'
      });
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
      }
    }
  };
}

  // Edit Category
const editCategoryForm = document.getElementById('editCategoryForm');
if (editCategoryForm) {
  editCategoryForm.onsubmit = async function (e) {
    e.preventDefault();
    e.stopPropagation();
    console.log('Edit category form submitted');
    
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    
    try {
      // Disable submit button and show loading state
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Saving...';
      
      // Get form data
      const formData = new FormData(this);
      const categoryId = formData.get('categoryId');
      const data = {
        name: formData.get('name'),
        description: formData.get('description')
      };
      console.log('Edit form data:', { categoryId, ...data });

      // Validate input
      const categoryName = data.name.trim();
      
      if (!categoryName) {
        console.error('Validation failed: Category name is required');
        throw new Error('Category name is required');
      }
      
      // Check minimum and maximum length
      if (categoryName.length < 3) {
        console.error('Validation failed: Category name is too short');
        throw new Error('Category name must be at least 3 characters long');
      }
      
      if (categoryName.length > 50) {
        console.error('Validation failed: Category name is too long');
        throw new Error('Category name cannot exceed 50 characters');
      }
      
      // Check if name starts with space
      if (data.name !== categoryName) {
        console.error('Validation failed: Category name cannot start or end with spaces');
        throw new Error('Category name cannot start or end with spaces');
      }
      
      // Check for numbers, underscores, or special characters (only allow letters, spaces, and hyphens)
      const invalidChars = /[0-9_!@#$%^&*()\[\]{};:'"\\|<>\/=+]/;
      if (invalidChars.test(categoryName)) {
        console.error('Validation failed: Category name contains invalid characters');
        throw new Error('Category name can only contain letters, spaces, and hyphens');
      }
      
      // Check for consecutive spaces or hyphens
      if (/\s{2,}|-{2,}/.test(categoryName)) {
        console.error('Validation failed: Category name contains consecutive spaces or hyphens');
        throw new Error('Category name cannot contain consecutive spaces or hyphens');
      }
      
      if (!categoryId) {
        console.error('Validation failed: Category ID is missing');
        throw new Error('Category ID is missing');
      }
      
      console.log(`Sending request to /admin/categories/edit/${categoryId}`);
      const response = await fetch(`/admin/categories/edit/${categoryId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(data)
      });

      const responseData = await response.json().catch(() => ({
        success: false,
        message: 'Invalid server response'
      }));

      if (response.ok && responseData.success) {
        await Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: responseData.message || 'Category updated successfully',
          timer: 1500,
          timerProgressBar: true,
          showConfirmButton: false
        });
        window.location.reload();
      } else {
        throw new Error(responseData.message || 'Failed to update category');
      }
    } catch (error) {
      console.error('Update category error:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'Failed to update category. Please try again.',
        confirmButtonText: 'OK'
      });
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
      }
    }
  };
}

// Helper for edit modal
function openEditModal(id, categoryName, description) {
  document.getElementById('editCategoryId').value = id;
  document.getElementById('editCategoryName').value = categoryName || '';
  document.getElementById('editCategoryDescription').value = description || '';
  new bootstrap.Modal(document.getElementById('editCategoryModal')).show();
}

window.openEditModal = openEditModal;

// Handle Edit Button Click
document.querySelectorAll('.edit-category-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    const categoryId = this.getAttribute('data-category-id');
    const categoryName = this.getAttribute('data-category-name');
    const categoryDescription = this.getAttribute('data-category-description');
    
    // Set values in the edit form
    document.getElementById('editCategoryId').value = categoryId;
    document.getElementById('editCategoryName').value = categoryName || '';
    document.getElementById('editCategoryDescription').value = categoryDescription || '';
    
    // Show the modal
    const editModal = new bootstrap.Modal(document.getElementById('editCategoryModal'));
    editModal.show();
  });
});

// Handle Block/Unblock buttons
document.querySelectorAll('.block-category-btn').forEach(btn => {
  btn.addEventListener('click', async function() {
    const categoryId = this.getAttribute('data-category-id');
    const isBlocked = this.getAttribute('data-blocked') === 'true';
    const action = isBlocked ? 'unblock' : 'block';
    const actionText = isBlocked ? 'Unblock' : 'Block';
    const buttonText = this.innerHTML;
    
    try {
      this.disabled = true;
      this.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';
      
      const result = await Swal.fire({
        title: `Are you sure?`,
        text: `You are about to ${action} this category!`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: `Yes, ${action} it!`,
        cancelButtonText: 'No, cancel!',
        reverseButtons: true,
        showLoaderOnConfirm: true,
        preConfirm: async () => {
          try {
            const response = await fetch(`/admin/categories/${action}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
              },
              body: JSON.stringify({ id: categoryId })
            });
            
            if (!response.ok) {
              const error = await response.json().catch(() => ({}));
              throw new Error(error.message || `Failed to ${action} category`);
            }
            
            return response.json();
          } catch (error) {
            Swal.showValidationMessage(`Request failed: ${error.message}`);
            return null;
          }
        },
        allowOutsideClick: () => !Swal.isLoading()
      });

      if (result.isConfirmed) {
        await Swal.fire({
          icon: 'success',
          title: 'Success!',
          text: `Category ${action}ed successfully`,
          timer: 1500,
          timerProgressBar: true,
          showConfirmButton: false
        });
        window.location.reload();
      }
    } catch (error) {
      console.error('Category action error:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Error',
        text: error.message || 'Failed to perform action on category. Please try again.',
        confirmButtonText: 'OK'
      });
    } finally {
      if (this) {
        this.disabled = false;
        this.innerHTML = buttonText;
      }
    }
  });
});

// Close the DOMContentLoaded event listener
});
