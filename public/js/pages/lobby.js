/**
 * Lobby Page Controller
 * Handles room creation and joining
 * 
 * NOTE: This page does NOT do actual game joining - it only:
 * 1. Creates room codes and waits for opponent via socket
 * 2. Navigates to game page where actual joining happens
 */

class LobbyController {
  constructor() {
    this.socket = null;
    this.elements = {};
    this.currentRoomId = null;
    this.isCreator = false;
    this.selectedTimerDuration = 15; // Default 15 seconds
  }

  /**
   * Initialize the lobby
   */
  init() {
    this.cacheElements();
    this.bindEvents();
    this.connectSocket();
  }

  /**
   * Cache DOM elements
   */
  cacheElements() {
    this.elements = {
      createBtn: document.getElementById('create-lobby-btn'),
      joinBtn: document.getElementById('join-lobby-btn'),
      joinInput: document.getElementById('join-code-input'),
      lobbyControls: document.getElementById('lobby-controls'),
      waitingSection: document.getElementById('waiting-section'),
      lobbyInfo: document.getElementById('lobby-info'),
      errorSection: document.getElementById('error-section'),
      errorMessage: document.getElementById('error-message'),
      timerOptions: document.getElementById('timer-options'),
      timerBtns: document.querySelectorAll('.timer-btn')
    };
  }

  /**
   * Bind event listeners
   */
  bindEvents() {
    // Auto-uppercase input and only allow alphanumeric
    this.elements.joinInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });

    // Enter key to join
    this.elements.joinInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.elements.joinBtn.click();
      }
    });

    // Timer duration selection
    this.elements.timerBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        // Remove selected from all
        this.elements.timerBtns.forEach(b => b.classList.remove('selected'));
        // Add selected to clicked
        btn.classList.add('selected');
        // Store the duration
        this.selectedTimerDuration = parseInt(btn.dataset.duration, 10);
      });
    });

    // Create room
    this.elements.createBtn.addEventListener('click', () => this.createRoom());

    // Join room
    this.elements.joinBtn.addEventListener('click', () => this.joinRoom());
  }

  /**
   * Connect to Socket.IO server
   */
  connectSocket() {
    if (typeof io === 'undefined') {
      this.showError('Unable to connect to server. Please refresh the page.');
      return;
    }

    this.socket = io();

    // Handle lobby-specific events
    this.socket.on('lobbyWaiting', ({ roomId, timerDuration }) => {
      // We're waiting for an opponent
      console.log(`Waiting in room ${roomId}, timer: ${timerDuration}s`);
      if (timerDuration) {
        this.selectedTimerDuration = timerDuration;
      }
    });

    // Handle when opponent joins the lobby
    this.socket.on('lobbyReady', ({ roomId, timerDuration }) => {
      // Both players are ready, navigate to game with timer duration
      const timer = timerDuration || this.selectedTimerDuration || 15;
      window.location.replace(`/twoplayer?roomID=${roomId}&timer=${timer}`);
    });

    // Handle room full error
    this.socket.on('lobbyFull', () => {
      this.showError('Room is full or unavailable. Please try another code.');
      this.showLobbyControls();
    });

    // Handle room not found (for joining)
    this.socket.on('lobbyNotFound', () => {
      this.showError('Room not found. Please check the code and try again.');
      this.showLobbyControls();
    });

    // Connection error handling
    this.socket.on('connect_error', () => {
      this.showError('Connection error. Please check your internet connection.');
    });

    this.socket.on('disconnect', () => {
      if (this.currentRoomId) {
        this.showError('Disconnected from server. Please refresh and try again.');
      }
    });

    this.socket.on('connect', () => {
      this.hideError();
    });
  }

  /**
   * Generate a 6-character room code
   */
  generateRoomCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  }

  /**
   * Create a new room
   */
  createRoom() {
    if (!this.socket) {
      this.showError('Not connected to server. Please refresh the page.');
      return;
    }

    this.currentRoomId = this.generateRoomCode();
    this.isCreator = true;
    
    // Emit lobby create with timer duration
    this.socket.emit('lobbyCreate', {
      roomId: this.currentRoomId,
      timerDuration: this.selectedTimerDuration
    });
    this.showWaiting(this.currentRoomId);
  }

  /**
   * Join an existing room
   */
  joinRoom() {
    if (!this.socket) {
      this.showError('Not connected to server. Please refresh the page.');
      return;
    }

    const roomCode = this.elements.joinInput.value.trim().toUpperCase();

    // Validate room code
    if (!roomCode) {
      this.showError('Please enter a room code');
      return;
    }

    if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
      this.showError('Room code must be exactly 6 alphanumeric characters');
      return;
    }

    this.currentRoomId = roomCode;
    this.isCreator = false;
    
    // Emit lobby join (not game join)
    this.socket.emit('lobbyJoin', this.currentRoomId);
  }

  /**
   * Show waiting section
   */
  showWaiting(roomId) {
    this.elements.lobbyControls.classList.add('hidden');
    this.elements.waitingSection.classList.remove('hidden');
    this.elements.waitingSection.dataset.roomid = roomId;
    this.elements.lobbyInfo.innerHTML = `
      Room Code: <strong>${roomId}</strong>
      <br>
      <small style="color: rgba(255,255,255,0.5);">Share this code with your opponent</small>
    `;
    this.hideError();
  }

  /**
   * Show lobby controls
   */
  showLobbyControls() {
    this.elements.lobbyControls.classList.remove('hidden');
    this.elements.waitingSection.classList.add('hidden');
    this.currentRoomId = null;
  }

  /**
   * Show error message
   */
  showError(message) {
    this.elements.errorSection.classList.remove('hidden');
    this.elements.errorMessage.textContent = message;
  }

  /**
   * Hide error message
   */
  hideError() {
    this.elements.errorSection.classList.add('hidden');
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const lobby = new LobbyController();
  lobby.init();
});
