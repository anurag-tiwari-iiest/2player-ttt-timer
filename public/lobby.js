let socket;

document.addEventListener("DOMContentLoaded", () => {
  socket = io();

  const createBtn = document.getElementById("create-lobby-btn");
  const joinBtn = document.getElementById("join-lobby-btn");
  const joinInput = document.getElementById("join-code-input");
  const lobbyControls = document.getElementById("lobby-controls");
  const waitingSection = document.getElementById("waiting-section");
  const lobbyInfo = document.getElementById("lobby-info");
  const errorSection = document.getElementById("error-section");
  const errorMessage = document.getElementById("error-message");

  createBtn.addEventListener("click", () => {
    const generatedRoomID = generateRoomID();
    socket.emit("joinGame", generatedRoomID);
    showWaiting(generatedRoomID);
  });

  joinBtn.addEventListener("click", () => {
    const roomID = joinInput.value.trim();
    if (roomID) {
      socket.emit("joinGame", roomID);
      showWaiting(roomID);
    }
  });

  socket.on("startGame", () => {
    const currentRoom = waitingSection.dataset.roomid;
    window.location.replace(`twoplayer.html?roomID=${currentRoom}`);
  });

  socket.on("roomFull", () => {
    showError("Room is full or unavailable. Please try another code.");
  });

  function showWaiting(roomID) {
    lobbyControls.classList.add("hidden");
    waitingSection.classList.remove("hidden");
    waitingSection.dataset.roomid = roomID;
    lobbyInfo.innerHTML = `<strong>Lobby Code:</strong> ${roomID}`;
  }

  function showError(message) {
    errorSection.classList.remove("hidden");
    errorMessage.textContent = message;
  }

  function generateRoomID() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }
});
