// Handle return order functionality
async function returnOrder(orderId) {
    try {
        // Show a prompt for the return reason
        const { value: reason } = await Swal.fire({
            title: 'Return Order',
            input: 'textarea',
            inputLabel: 'Reason for return',
            inputPlaceholder: 'Please tell us why you want to return this order...',
            inputAttributes: {
                'aria-label': 'Type your message here'
            },
            showCancelButton: true,
            confirmButtonText: 'Submit Return',
            cancelButtonText: 'Cancel',
            inputValidator: (value) => {
                if (!value) {
                    return 'Please provide a reason for the return';
                }
            }
        });

        if (!reason) return;

        // Show loading state
        Swal.fire({
            title: 'Processing...',
            text: 'Please wait while we process your return request',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        // Make the API call to process the return
        const response = await fetch(`/my-orders/${orderId}/return`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ reason })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Failed to process return request');
        }
        
        // Show success message and redirect to my-orders page
        await Swal.fire({
            icon: 'success',
            title: 'Return Request Submitted',
            text: result.message || 'Your return request has been submitted successfully!',
            confirmButtonText: 'View My Orders',
            allowOutsideClick: false
        }).then(() => {
            // Redirect to my-orders page
            window.location.href = '/my-orders';
        });

    } catch (error) {
        console.error('Error processing return:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'Failed to process return request. Please try again.',
            confirmButtonText: 'OK'
        });
    }
}

// Handle cancel order functionality
async function cancelOrder(orderId) {
    try {
        // Show a prompt for the cancellation reason
        const { value: reason } = await Swal.fire({
            title: 'Cancel Order',
            input: 'textarea',
            inputLabel: 'Reason for cancellation',
            inputPlaceholder: 'Please tell us why you want to cancel this order...',
            showCancelButton: true,
            confirmButtonText: 'Confirm Cancellation',
            cancelButtonText: 'Go Back',
            inputValidator: (value) => {
                if (!value) {
                    return 'Please provide a reason for cancellation';
                }
            }
        });

        if (!reason) return;

        // Show loading state
        Swal.fire({
            title: 'Processing...',
            text: 'Please wait while we process your cancellation',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        // Make the API call to process the cancellation
        const response = await fetch(`/my-orders/${orderId}/cancel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ reason })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'Failed to process cancellation');
        }

        // Show success message
        Swal.fire({
            icon: 'success',
            title: 'Order Cancelled',
            text: result.message,
            confirmButtonText: 'OK'
        }).then(() => {
            // Reload the page to show updated order status
            window.location.reload();
        });

    } catch (error) {
        console.error('Error cancelling order:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: error.message || 'Failed to cancel order. Please try again.',
            confirmButtonText: 'OK'
        });
    }
}

// Initialize event listeners when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add click handlers for return buttons
    document.querySelectorAll('.btn-return').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const orderId = button.dataset.orderId;
            returnOrder(orderId);
        });
    });

    // Add click handlers for cancel buttons
    document.querySelectorAll('.btn-cancel').forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            const orderId = button.dataset.orderId;
            cancelOrder(orderId);
        });
    });
});
