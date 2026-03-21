/* Railroaded — Optional sound effects for game events
   Uses Web Audio API to synthesize short atmospheric sounds.
   OFF by default. State persisted in localStorage. */
(function () {
  var audioCtx = null;
  var enabled = localStorage.getItem('audio-enabled') === 'true';
  var volume = parseFloat(localStorage.getItem('audio-volume') || '0.4');
  if (isNaN(volume) || volume < 0) volume = 0;
  if (volume > 1) volume = 1;

  function getCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function masterGain(ctx, v) {
    var g = ctx.createGain();
    g.gain.value = (v != null ? v : volume) * 0.5;
    g.connect(ctx.destination);
    return g;
  }

  // --- Sound definitions ---

  // Combat start: low brass horn sweep
  function playCombatStart() {
    var ctx = getCtx();
    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.linearRampToValueAtTime(165, now + 0.3);
    osc.frequency.linearRampToValueAtTime(130, now + 0.6);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(volume * 0.3, now + 0.05);
    g.gain.linearRampToValueAtTime(volume * 0.25, now + 0.4);
    g.gain.linearRampToValueAtTime(0, now + 0.7);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.7);
  }

  // Critical hit: short percussive impact
  function playCriticalHit() {
    var ctx = getCtx();
    var now = ctx.currentTime;
    // Low impact thud
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.2);
    g.gain.setValueAtTime(volume * 0.5, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
    // Noise burst
    var bufSize = ctx.sampleRate * 0.08;
    var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
    var noise = ctx.createBufferSource();
    noise.buffer = buf;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(volume * 0.25, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    noise.connect(ng);
    ng.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.1);
  }

  // Character death: dramatic descending sting
  function playDeath() {
    var ctx = getCtx();
    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.6);
    g.gain.setValueAtTime(volume * 0.3, now);
    g.gain.linearRampToValueAtTime(volume * 0.2, now + 0.3);
    g.gain.linearRampToValueAtTime(0, now + 0.7);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.7);
    // Second darker tone
    var osc2 = ctx.createOscillator();
    var g2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(220, now + 0.1);
    osc2.frequency.exponentialRampToValueAtTime(55, now + 0.8);
    g2.gain.setValueAtTime(0, now);
    g2.gain.linearRampToValueAtTime(volume * 0.2, now + 0.15);
    g2.gain.linearRampToValueAtTime(0, now + 0.9);
    osc2.connect(g2);
    g2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.9);
  }

  // Dungeon cleared / victory: ascending fanfare
  function playFanfare() {
    var ctx = getCtx();
    var now = ctx.currentTime;
    var notes = [262, 330, 392, 523]; // C4 E4 G4 C5
    for (var i = 0; i < notes.length; i++) {
      var t = now + i * 0.12;
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(notes[i], t);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(volume * 0.2, t + 0.03);
      g.gain.linearRampToValueAtTime(volume * 0.15, t + 0.1);
      g.gain.linearRampToValueAtTime(0, t + 0.25);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.25);
    }
  }

  // New room: short door creak (filtered noise sweep)
  function playRoomEnter() {
    var ctx = getCtx();
    var now = ctx.currentTime;
    var bufSize = ctx.sampleRate * 0.3;
    var buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    var noise = ctx.createBufferSource();
    noise.buffer = buf;
    var filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.linearRampToValueAtTime(800, now + 0.15);
    filter.frequency.linearRampToValueAtTime(400, now + 0.3);
    filter.Q.value = 8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(volume * 0.12, now + 0.03);
    g.gain.linearRampToValueAtTime(volume * 0.08, now + 0.15);
    g.gain.linearRampToValueAtTime(0, now + 0.3);
    noise.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.3);
  }

  // --- Public API ---

  var soundMap = {
    combat_start: playCombatStart,
    combat_end: playFanfare,
    death: playDeath,
    death_save: null, // only play on stabilize/nat20 — handled in playForEvent
    room_enter: playRoomEnter,
    critical_hit: playCriticalHit
  };

  function playForEvent(eventType, eventData) {
    if (!enabled) return;
    var d = eventData || {};
    // Critical hit detection (from attack events)
    if ((eventType === 'attack' || eventType === 'monster_attack') && d.critical) {
      playCriticalHit();
      return;
    }
    // Death save: only sound on stabilize or nat20
    if (eventType === 'death_save') {
      if (d.stabilized || d.naturalRoll === 20) playFanfare();
      else playDeath();
      return;
    }
    // Character death event
    if (eventType === 'death') {
      playDeath();
      return;
    }
    var fn = soundMap[eventType];
    if (fn) fn();
  }

  // --- UI ---

  function isEnabled() { return enabled; }
  function getVolume() { return volume; }

  function setEnabled(val) {
    enabled = !!val;
    localStorage.setItem('audio-enabled', enabled ? 'true' : 'false');
    updateToggleUI();
  }

  function setVolume(val) {
    volume = Math.max(0, Math.min(1, parseFloat(val) || 0));
    localStorage.setItem('audio-volume', String(volume));
  }

  function updateToggleUI() {
    var btns = document.querySelectorAll('.audio-toggle-btn');
    btns.forEach(function (btn) {
      btn.textContent = enabled ? '🔊' : '🔇';
      btn.setAttribute('aria-label', enabled ? 'Disable sound effects' : 'Enable sound effects');
      btn.setAttribute('aria-pressed', String(enabled));
    });
  }

  function createToggle(container) {
    if (!container) return;
    var wrapper = document.createElement('div');
    wrapper.className = 'audio-toggle';
    wrapper.innerHTML = '<button class="audio-toggle-btn" aria-label="Enable sound effects" aria-pressed="false"></button>' +
      '<div class="audio-dropdown">' +
      '<label class="audio-dropdown-label">Volume</label>' +
      '<input type="range" class="audio-slider" min="0" max="100" value="' + Math.round(volume * 100) + '" aria-label="Sound volume">' +
      '</div>';
    container.appendChild(wrapper);

    var btn = wrapper.querySelector('.audio-toggle-btn');
    var dropdown = wrapper.querySelector('.audio-dropdown');
    var slider = wrapper.querySelector('.audio-slider');

    btn.textContent = enabled ? '🔊' : '🔇';
    btn.setAttribute('aria-pressed', String(enabled));

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!enabled) {
        setEnabled(true);
        dropdown.classList.add('open');
        // Unlock audio context on first user gesture
        getCtx();
      } else if (dropdown.classList.contains('open')) {
        setEnabled(false);
        dropdown.classList.remove('open');
      } else {
        dropdown.classList.add('open');
      }
    });

    slider.addEventListener('input', function () {
      setVolume(this.value / 100);
    });

    document.addEventListener('click', function (e) {
      if (!wrapper.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });
  }

  // Init on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function () {
    // Prefer dedicated mount point outside nav to avoid overflowing the nav flex layout
    var mount = document.querySelector('.audio-mount');
    if (!mount) {
      var themeBtn = document.querySelector('.theme-toggle');
      if (themeBtn && themeBtn.parentNode) mount = themeBtn.parentNode;
    }
    if (mount) createToggle(mount);
    updateToggleUI();
  });

  // Expose global API
  window.RailroadedAudio = {
    playForEvent: playForEvent,
    isEnabled: isEnabled,
    getVolume: getVolume,
    setEnabled: setEnabled,
    setVolume: setVolume
  };
})();
