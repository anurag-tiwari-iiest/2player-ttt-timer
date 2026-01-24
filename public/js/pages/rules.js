/**
 * Rules Modal Controller
 * Handles the rules modal on the home page
 */

document.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById('open-rules-btn');
  const closeBtn = document.getElementById('close-rules-btn');
  const modal = document.getElementById('rules-modal');

  if (!openBtn || !closeBtn || !modal) {
    console.warn('Rules modal elements not found');
    return;
  }

  // Open modal
  openBtn.addEventListener('click', () => {
    modal.style.display = 'block';
  });

  // Close modal via button
  closeBtn.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // Close modal by clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });

  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'block') {
      modal.style.display = 'none';
    }
  });
});
