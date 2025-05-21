// rules.js
document.addEventListener("DOMContentLoaded", () => {
  const openBtn = document.getElementById("open-rules-btn");
  const closeBtn = document.getElementById("close-rules-btn");
  const modal = document.getElementById("rules-modal");

  openBtn.addEventListener("click", () => {
    modal.style.display = "block";
  });

  closeBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });

  window.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
    }
  });
});
