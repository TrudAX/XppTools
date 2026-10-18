/*! DEVTutorialArcade.js - built 2026-10-18T00:58:09.653Z by tools/build-d365.js - do not edit, edit the sources in C:\AAA\DEVGames */
/* ===== DEVArcadeShell.js ===== */
/*!
 * DEVArcadeShell.js - shared engine of the DEV Arcade games.
 *
 * Runs stand-alone (index.html / play.html) and inside the D365 extensible control DEVArcadeControl.
 * A game registers itself with DEVArcade.registerGame({...}); a Shell hosts one game instance and talks
 * to a "host" object (local page or X++ control):
 *
 *   host.gameStarted(gameId, callback(sessionInfoString))
 *   host.scoreChanged(gameId, score)                         (throttled)
 *   host.gameOver(gameId, score, detailsJson, callback(resultString))
 *   host.request(name, payloadObject, callback(responseObject))   (data requests, e.g. the quiz)
 *   host.getBest(gameId) / host.assetUrl(fileName)
 *
 * The host drives the game with shell.command('start' | 'pause' | 'resume' | 'toggle' | 'stop' | 'restart' | 'mute' | 'unmute').
 */
(function (global) {
    'use strict';

    var DEVArcade = global.DEVArcade = global.DEVArcade || {};
    DEVArcade.games = DEVArcade.games || {};
    DEVArcade.instances = DEVArcade.instances || [];

    DEVArcade.registerGame = function (def) {
        DEVArcade.games[def.id] = def;
    };

    // ------------------------------------------------------------------------------------------------
    // Storage (browser storage can be blocked: never throw)
    // ------------------------------------------------------------------------------------------------
    var store = DEVArcade.store = {
        get: function (key, fallback) {
            try {
                var v = global.localStorage.getItem('devarcade.' + key);
                return v === null ? fallback : JSON.parse(v);
            } catch (e) {
                return fallback;
            }
        },
        set: function (key, value) {
            try {
                global.localStorage.setItem('devarcade.' + key, JSON.stringify(value));
            } catch (e) { /* ignore */ }
        }
    };

    // ------------------------------------------------------------------------------------------------
    // Math helpers
    // ------------------------------------------------------------------------------------------------
    var U = DEVArcade.util = {
        clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
        lerp: function (a, b, t) { return a + (b - a) * t; },
        rand: function (a, b) { return a + Math.random() * (b - a); },
        randInt: function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
        pick: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },
        shuffle: function (arr) {
            for (var i = arr.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
            }
            return arr;
        },
        rectsOverlap: function (a, b) {
            return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        },
        dist2: function (ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; },
        pad: function (n, len) { var s = String(Math.max(0, Math.floor(n))); while (s.length < len) { s = '0' + s; } return s; }
    };

    // ------------------------------------------------------------------------------------------------
    // Pixel font 5x7 (each glyph: 7 rows, 5 bits per row)
    // ------------------------------------------------------------------------------------------------
    var GLYPHS = {
        'A': [14, 17, 17, 31, 17, 17, 17], 'B': [30, 17, 17, 30, 17, 17, 30], 'C': [14, 17, 16, 16, 16, 17, 14],
        'D': [30, 17, 17, 17, 17, 17, 30], 'E': [31, 16, 16, 30, 16, 16, 31], 'F': [31, 16, 16, 30, 16, 16, 16],
        'G': [14, 17, 16, 23, 17, 17, 15], 'H': [17, 17, 17, 31, 17, 17, 17], 'I': [14, 4, 4, 4, 4, 4, 14],
        'J': [7, 2, 2, 2, 2, 18, 12], 'K': [17, 18, 20, 24, 20, 18, 17], 'L': [16, 16, 16, 16, 16, 16, 31],
        'M': [17, 27, 21, 21, 17, 17, 17], 'N': [17, 17, 25, 21, 19, 17, 17], 'O': [14, 17, 17, 17, 17, 17, 14],
        'P': [30, 17, 17, 30, 16, 16, 16], 'Q': [14, 17, 17, 17, 21, 18, 13], 'R': [30, 17, 17, 30, 20, 18, 17],
        'S': [15, 16, 16, 14, 1, 1, 30], 'T': [31, 4, 4, 4, 4, 4, 4], 'U': [17, 17, 17, 17, 17, 17, 14],
        'V': [17, 17, 17, 17, 17, 10, 4], 'W': [17, 17, 17, 21, 21, 21, 10], 'X': [17, 17, 10, 4, 10, 17, 17],
        'Y': [17, 17, 10, 4, 4, 4, 4], 'Z': [31, 1, 2, 4, 8, 16, 31],
        '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 17, 1, 2, 4, 8, 31],
        '3': [31, 2, 4, 2, 1, 17, 14], '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14],
        '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8], '8': [14, 17, 17, 14, 17, 17, 14],
        '9': [14, 17, 17, 15, 1, 2, 12],
        ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8],
        ':': [0, 12, 12, 0, 12, 12, 0], ';': [0, 12, 12, 0, 12, 4, 8], '!': [4, 4, 4, 4, 4, 0, 4],
        '?': [14, 17, 1, 2, 4, 0, 4], '-': [0, 0, 0, 31, 0, 0, 0], '+': [0, 4, 4, 31, 4, 4, 0],
        '/': [1, 1, 2, 4, 8, 16, 16], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
        '\'': [4, 4, 8, 0, 0, 0, 0], '"': [10, 10, 0, 0, 0, 0, 0], '%': [24, 25, 2, 4, 8, 19, 3],
        '<': [2, 4, 8, 16, 8, 4, 2], '>': [8, 4, 2, 1, 2, 4, 8], '=': [0, 0, 31, 0, 31, 0, 0],
        '#': [10, 10, 31, 10, 31, 10, 10], '*': [0, 4, 21, 14, 21, 4, 0], '_': [0, 0, 0, 0, 0, 0, 31],
        '[': [14, 8, 8, 8, 8, 8, 14], ']': [14, 2, 2, 2, 2, 2, 14], '$': [4, 15, 20, 14, 5, 30, 4],
        '&': [12, 18, 20, 8, 21, 18, 13], '@': [0, 10, 31, 31, 14, 4, 0], /* @ = heart */
        '^': [4, 14, 31, 4, 4, 4, 4], /* ^ = arrow up */ '~': [0, 4, 14, 31, 14, 4, 0] /* ~ = diamond */
    };
    var GLYPH_ORDER = Object.keys(GLYPHS);
    var GLYPH_INDEX = {};
    GLYPH_ORDER.forEach(function (ch, i) { GLYPH_INDEX[ch] = i; });
    var fontAtlas = {};

    function getFontAtlas(color) {
        if (fontAtlas[color]) {
            return fontAtlas[color];
        }
        var c = document.createElement('canvas');
        c.width = GLYPH_ORDER.length * 6;
        c.height = 7;
        var g = c.getContext('2d');
        g.fillStyle = color;
        GLYPH_ORDER.forEach(function (ch, i) {
            var rows = GLYPHS[ch];
            for (var y = 0; y < 7; y++) {
                for (var x = 0; x < 5; x++) {
                    if (rows[y] & (16 >> x)) {
                        g.fillRect(i * 6 + x, y, 1, 1);
                    }
                }
            }
        });
        fontAtlas[color] = c;
        return c;
    }

    DEVArcade.textWidth = function (text, scale) {
        return String(text).length * 6 * (scale || 1) - (scale || 1);
    };

    /** Draws pixel-font text. opts: color, scale, align (left|center|right), shadow (color) */
    DEVArcade.drawText = function (ctx, text, x, y, opts) {
        opts = opts || {};
        var scale = opts.scale || 1;
        var str = String(text).toUpperCase();
        var w = DEVArcade.textWidth(str, scale);
        if (opts.align === 'center') {
            x -= Math.floor(w / 2);
        } else if (opts.align === 'right') {
            x -= w;
        }
        x = Math.round(x);
        y = Math.round(y);
        if (opts.shadow) {
            DEVArcade.drawText(ctx, str, x + scale, y + scale, { color: opts.shadow, scale: scale });
        }
        var atlas = getFontAtlas(opts.color || '#ffffff');
        for (var i = 0; i < str.length; i++) {
            var idx = GLYPH_INDEX[str[i]];
            if (idx === undefined) {
                idx = GLYPH_INDEX['?'];
            }
            if (str[i] !== ' ') {
                ctx.drawImage(atlas, idx * 6, 0, 5, 7, x + i * 6 * scale, y, 5 * scale, 7 * scale);
            }
        }
        return w;
    };

    // ------------------------------------------------------------------------------------------------
    // Sprites: pixel maps -> canvases
    // ------------------------------------------------------------------------------------------------
    /** rows: array of strings; palette: { char: '#rrggbb' }; '.' and ' ' are transparent */
    DEVArcade.sprite = function (rows, palette, scale) {
        scale = scale || 1;
        var h = rows.length, w = 0;
        rows.forEach(function (r) { w = Math.max(w, r.length); });
        var c = document.createElement('canvas');
        c.width = w * scale;
        c.height = h * scale;
        var g = c.getContext('2d');
        for (var y = 0; y < h; y++) {
            for (var x = 0; x < rows[y].length; x++) {
                var col = palette[rows[y][x]];
                if (col) {
                    g.fillStyle = col;
                    g.fillRect(x * scale, y * scale, scale, scale);
                }
            }
        }
        return c;
    };

    /** Rotates a sprite by quarter turns clockwise (0..3). */
    DEVArcade.rotateSprite = function (src, quarter) {
        quarter = ((quarter % 4) + 4) % 4;
        var c = document.createElement('canvas');
        c.width = quarter % 2 ? src.height : src.width;
        c.height = quarter % 2 ? src.width : src.height;
        var g = c.getContext('2d');
        g.translate(c.width / 2, c.height / 2);
        g.rotate(quarter * Math.PI / 2);
        g.drawImage(src, -src.width / 2, -src.height / 2);
        return c;
    };

    DEVArcade.flipSprite = function (src, horizontal) {
        var c = document.createElement('canvas');
        c.width = src.width;
        c.height = src.height;
        var g = c.getContext('2d');
        if (horizontal !== false) {
            g.translate(src.width, 0);
            g.scale(-1, 1);
        } else {
            g.translate(0, src.height);
            g.scale(1, -1);
        }
        g.drawImage(src, 0, 0);
        return c;
    };

    /** Returns a one-color silhouette of a sprite (hit flashes). */
    DEVArcade.tintSprite = function (src, color) {
        var c = document.createElement('canvas');
        c.width = src.width;
        c.height = src.height;
        var g = c.getContext('2d');
        g.drawImage(src, 0, 0);
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = color;
        g.fillRect(0, 0, c.width, c.height);
        return c;
    };

    // ------------------------------------------------------------------------------------------------
    // Sound: chiptune effects synthesized with Web Audio (no files). Muted by default.
    // ------------------------------------------------------------------------------------------------
    function Sound() {
        this.muted = store.get('muted', true);
        this.ctx = null;
        this.master = null;
        this.noiseBuffer = null;
    }

    Sound.prototype.ensure = function () {
        if (!this.ctx) {
            var AC = global.AudioContext || global.webkitAudioContext;
            if (!AC) {
                return false;
            }
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.22;
            this.master.connect(this.ctx.destination);
            var len = this.ctx.sampleRate;
            this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
            var data = this.noiseBuffer.getChannelData(0);
            for (var i = 0; i < len; i++) {
                data[i] = Math.random() * 2 - 1;
            }
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return true;
    };

    Sound.prototype.setMuted = function (muted) {
        this.muted = !!muted;
        store.set('muted', this.muted);
        if (!this.muted) {
            this.ensure();
        }
    };

    Sound.prototype.tone = function (type, f0, f1, dur, vol, delay) {
        var ctx = this.ctx, t = ctx.currentTime + (delay || 0);
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, t);
        if (f1 && f1 !== f0) {
            o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        }
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g);
        g.connect(this.master);
        o.start(t);
        o.stop(t + dur + 0.02);
    };

    Sound.prototype.noise = function (dur, vol, f0, f1, delay) {
        var ctx = this.ctx, t = ctx.currentTime + (delay || 0);
        var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = this.noiseBuffer;
        f.type = 'lowpass';
        f.frequency.setValueAtTime(f0, t);
        f.frequency.exponentialRampToValueAtTime(Math.max(40, f1 || f0), t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        s.connect(f);
        f.connect(g);
        g.connect(this.master);
        s.start(t);
        s.stop(t + dur + 0.02);
    };

    Sound.prototype.notes = function (type, freqs, step, vol) {
        for (var i = 0; i < freqs.length; i++) {
            this.tone(type, freqs[i], freqs[i], step * 0.95, vol, i * step);
        }
    };

    var SFX = {
        shoot: function (s) { s.tone('square', 900, 250, 0.11, 0.18); },
        laser: function (s) { s.tone('sawtooth', 1400, 350, 0.1, 0.12); },
        enemyShoot: function (s) { s.tone('square', 500, 160, 0.12, 0.1); },
        hit: function (s) { s.noise(0.08, 0.35, 3000, 800); s.tone('square', 320, 110, 0.08, 0.12); },
        explode: function (s) { s.noise(0.45, 0.6, 1800, 80); },
        bigExplode: function (s) { s.noise(0.9, 0.8, 1200, 50); s.tone('sine', 140, 30, 0.7, 0.4); },
        powerup: function (s) { s.notes('square', [523, 659, 784, 1047, 1319], 0.055, 0.14); },
        bounce: function (s) { s.tone('square', 440, 440, 0.05, 0.14); },
        paddle: function (s) { s.tone('square', 330, 330, 0.07, 0.16); },
        brick: function (s) { s.tone('square', 740, 700, 0.06, 0.13); },
        metal: function (s) { s.tone('triangle', 1600, 1500, 0.08, 0.2); s.tone('square', 2400, 2300, 0.05, 0.05); },
        click: function (s) { s.tone('square', 1100, 1100, 0.025, 0.1); },
        open: function (s) { s.tone('triangle', 500, 900, 0.07, 0.18); },
        flag: function (s) { s.tone('triangle', 700, 1000, 0.06, 0.2); },
        coin: function (s) { s.notes('square', [988, 1319], 0.07, 0.12); },
        start: function (s) { s.notes('square', [392, 523, 659, 784], 0.08, 0.14); },
        win: function (s) { s.notes('square', [523, 659, 784, 1047, 784, 1047, 1319], 0.1, 0.15); },
        lose: function (s) { s.tone('sawtooth', 420, 55, 0.9, 0.18); },
        life: function (s) { s.notes('triangle', [262, 220, 196, 165], 0.12, 0.25); },
        tick: function (s) { s.tone('sine', 1200, 1200, 0.03, 0.12); },
        correct: function (s) { s.notes('square', [659, 880, 1175], 0.09, 0.15); },
        wrong: function (s) { s.tone('square', 220, 150, 0.35, 0.15); },
        select: function (s) { s.tone('square', 660, 660, 0.04, 0.1); },
        warp: function (s) { s.tone('sine', 200, 1600, 0.6, 0.2); },
        beam: function (s) { s.tone('triangle', 300, 900, 0.5, 0.12); }
    };

    Sound.prototype.play = function (name) {
        if (this.muted || !SFX[name]) {
            return;
        }
        if (!this.ensure()) {
            return;
        }
        try {
            SFX[name](this);
        } catch (e) { /* audio errors must never break a game */ }
    };

    DEVArcade.Sound = Sound;

    // ------------------------------------------------------------------------------------------------
    // Particles and floating texts
    // ------------------------------------------------------------------------------------------------
    function Effects() {
        this.parts = [];
        this.texts = [];
    }

    Effects.prototype.clear = function () {
        this.parts.length = 0;
        this.texts.length = 0;
    };

    /** opts: count, colors[], speed, life, gravity, size, spread (radians), angle */
    Effects.prototype.burst = function (x, y, opts) {
        opts = opts || {};
        var n = opts.count || 12, colors = opts.colors || ['#ffffff'];
        for (var i = 0; i < n; i++) {
            var a = opts.angle !== undefined ? opts.angle + (Math.random() - 0.5) * (opts.spread || Math.PI) : Math.random() * Math.PI * 2;
            var sp = (opts.speed || 60) * (0.35 + Math.random() * 0.65);
            var life = (opts.life || 0.6) * (0.6 + Math.random() * 0.4);
            this.parts.push({
                x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: life, max: life,
                color: colors[i % colors.length], size: opts.size || 1, g: opts.gravity || 0
            });
        }
    };

    Effects.prototype.text = function (str, x, y, color) {
        this.texts.push({ s: String(str), x: x, y: y, life: 0.9, color: color || '#ffffff' });
    };

    Effects.prototype.update = function (dt) {
        var p, i;
        for (i = this.parts.length - 1; i >= 0; i--) {
            p = this.parts[i];
            p.life -= dt;
            if (p.life <= 0) {
                this.parts.splice(i, 1);
                continue;
            }
            p.vy += p.g * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
        }
        for (i = this.texts.length - 1; i >= 0; i--) {
            p = this.texts[i];
            p.life -= dt;
            p.y -= 18 * dt;
            if (p.life <= 0) {
                this.texts.splice(i, 1);
            }
        }
    };

    Effects.prototype.render = function (ctx) {
        var i, p;
        for (i = 0; i < this.parts.length; i++) {
            p = this.parts[i];
            ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5);
            ctx.fillStyle = p.color;
            ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
        }
        ctx.globalAlpha = 1;
        for (i = 0; i < this.texts.length; i++) {
            p = this.texts[i];
            if (p.life > 0.25 || Math.floor(p.life * 20) % 2 === 0) {
                DEVArcade.drawText(ctx, p.s, p.x, p.y, { color: p.color, align: 'center', shadow: '#000000' });
            }
        }
    };

    DEVArcade.Effects = Effects;

    // ------------------------------------------------------------------------------------------------
    // Toolbar icons (inline SVG)
    // ------------------------------------------------------------------------------------------------
    var ICONS = {
        soundOff: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
        soundOn: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
        pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>',
        play: '<svg viewBox="0 0 24 24"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>',
        restart: '<svg viewBox="0 0 24 24"><path d="M5 12a7 7 0 1 0 2.1-5" stroke="currentColor" stroke-width="2.2" fill="none"/><path d="M4 3v6h6" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
        fullscreen: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" stroke="currentColor" stroke-width="2.2" fill="none"/></svg>'
    };

    function el(tag, cls, html) {
        var e = document.createElement(tag);
        if (cls) {
            e.className = cls;
        }
        if (html !== undefined) {
            e.innerHTML = html;
        }
        return e;
    }

    // ------------------------------------------------------------------------------------------------
    // Shell
    // ------------------------------------------------------------------------------------------------
    var SHELL_KEYS = ['Space', 'Enter', 'KeyP', 'KeyM'];
    var STEP = 1 / 60;

    function Shell(container, gameId, host, options) {
        var self = this;
        var def = DEVArcade.games[gameId];
        if (!def) {
            throw new Error('DEVArcade: unknown game ' + gameId);
        }

        self.def = def;
        self.id = gameId;
        self.host = host || {};
        self.options = options || {};
        self.container = container;
        self.state = 'title';           // title | playing | paused | over
        self.score = 0;
        self.best = Number(self.host.getBest ? self.host.getBest(gameId) : 0) || 0;
        self.time = 0;                   // seconds since the shell started (always running)
        self.stateTime = 0;              // seconds in the current state
        self.keys = {};
        self.pressed = {};
        self.sound = new Sound();
        self.fx = new Effects();
        self.shakeTime = 0;
        self.shakeMag = 0;
        self.flashTime = 0;
        self.flashColor = '#ffffff';
        self.focused = false;
        self.overResult = '';
        self.sessionInfo = '';
        self.W = def.width || 256;
        self.H = def.height || 224;
        self.bg = null;
        self.captureKeys = {};
        SHELL_KEYS.concat(def.keys || []).forEach(function (k) { self.captureKeys[k] = true; });

        self._buildDom();
        self.game = def.create(self) || {};
        self._bindEvents();
        self.fit();

        self._last = 0;
        self._acc = 0;
        self._frameFn = function (ts) { self._frame(ts); };
        self._raf = global.requestAnimationFrame(self._frameFn);
        DEVArcade.instances.push(self);
    }

    Shell.prototype._buildDom = function () {
        var def = this.def;
        var root = this.root = el('div', 'devarcade devarcade-' + def.id);
        root.tabIndex = 0;
        root.setAttribute('role', 'application');
        root.setAttribute('aria-label', def.title);

        var bar = el('div', 'devarcade-bar');
        this.titleEl = el('span', 'devarcade-title', def.title);
        this.scoreEl = el('span', 'devarcade-stat', 'SCORE <b>0</b>');
        this.bestEl = el('span', 'devarcade-stat', 'BEST <b>' + this.best + '</b>');
        var spacer = el('span', 'devarcade-spacer');
        this.btnSound = el('button', 'devarcade-btn');
        this.btnPause = el('button', 'devarcade-btn');
        this.btnRestart = el('button', 'devarcade-btn', ICONS.restart);
        this.btnFull = el('button', 'devarcade-btn', ICONS.fullscreen);
        this.btnRestart.title = 'New game';
        this.btnFull.title = 'Full screen';
        [this.btnSound, this.btnPause, this.btnRestart, this.btnFull].forEach(function (b) { b.type = 'button'; b.tabIndex = -1; });
        bar.appendChild(this.titleEl);
        bar.appendChild(this.scoreEl);
        bar.appendChild(this.bestEl);
        bar.appendChild(spacer);
        bar.appendChild(this.btnSound);
        bar.appendChild(this.btnPause);
        bar.appendChild(this.btnRestart);
        bar.appendChild(this.btnFull);

        var screen = this.screen = el('div', 'devarcade-screen');
        if (def.canvas !== false) {
            this.bgCanvas = el('canvas', 'devarcade-bg');
            this.canvas = el('canvas', 'devarcade-canvas');
            this.canvas.width = this.W;
            this.canvas.height = this.H;
            this.ctx = this.canvas.getContext('2d');
            this.ctx.imageSmoothingEnabled = false;
            screen.appendChild(this.bgCanvas);
            screen.appendChild(this.canvas);
        } else {
            screen.classList.add('devarcade-screen-dom');
        }
        this.dom = el('div', 'devarcade-dom');
        screen.appendChild(this.dom);

        var help = el('div', 'devarcade-help', def.help || '');

        root.appendChild(bar);
        root.appendChild(screen);
        root.appendChild(help);
        this.container.appendChild(root);
        this._updateButtons();
    };

    Shell.prototype._bindEvents = function () {
        var self = this;
        var L = self._listeners = [];
        function on(target, type, fn, opts) {
            target.addEventListener(type, fn, opts);
            L.push([target, type, fn, opts]);
        }

        on(self.root, 'keydown', function (e) {
            if (self.captureKeys[e.code]) {
                e.preventDefault();
                e.stopPropagation();
            }
            if (!e.repeat) {
                self.pressed[e.code] = true;
            }
            self.keys[e.code] = true;
            self._shellKey(e);
            if (self.game.onKey) {
                self.game.onKey(e.code, true, e);
            }
        });
        on(self.root, 'keyup', function (e) {
            if (self.captureKeys[e.code]) {
                e.preventDefault();
                e.stopPropagation();
            }
            self.keys[e.code] = false;
            if (self.game.onKey) {
                self.game.onKey(e.code, false, e);
            }
        });
        on(self.root, 'focus', function () { self.focused = true; });
        on(self.root, 'blur', function () { self.focused = false; self.keys = {}; });

        var target = self.canvas || self.dom;
        function pointer(type) {
            return function (e) {
                if (type === 'down') {
                    self.root.focus({ preventScroll: true });
                    self.sound.play('');   // unlock audio on user gesture
                }
                if (!self.canvas) {
                    return;
                }
                var r = self.canvas.getBoundingClientRect();
                if (!r.width) {
                    return;
                }
                var x = (e.clientX - r.left) * self.W / r.width;
                var y = (e.clientY - r.top) * self.H / r.height;
                self.pointerX = x;
                self.pointerY = y;
                var handled = self.game.onPointer ? self.game.onPointer(type, x, y, e.button, e) : false;
                if (type === 'down' && !handled) {
                    if (self.state === 'title' || (self.state === 'over' && self.stateTime > 0.8)) {
                        self.start();
                    } else if (self.state === 'paused') {
                        self.resume();
                    }
                }
                if (type === 'down' && e.button !== 0) {
                    e.preventDefault();
                }
            };
        }
        on(target, 'pointerdown', pointer('down'));
        on(target, 'pointermove', pointer('move'));
        on(target, 'pointerup', pointer('up'));
        on(target, 'contextmenu', function (e) { e.preventDefault(); });

        on(self.btnSound, 'click', function () { self.toggleMute(); self.root.focus({ preventScroll: true }); });
        on(self.btnPause, 'click', function () {
            if (self.state === 'title' || self.state === 'over') {
                self.start();
            } else {
                self.togglePause();
            }
            self.root.focus({ preventScroll: true });
        });
        on(self.btnRestart, 'click', function () { self.restart(); self.root.focus({ preventScroll: true }); });
        on(self.btnFull, 'click', function () { self.toggleFullscreen(); });

        on(document, 'visibilitychange', function () {
            if (document.hidden && self.state === 'playing') {
                self.pause();
            }
        });
        on(document, 'fullscreenchange', function () { self.fit(); });
        on(global, 'resize', function () { self.fit(); });
        if (global.ResizeObserver) {
            self._ro = new global.ResizeObserver(function () { self.fit(); });
            self._ro.observe(self.container);
        }
    };

    Shell.prototype._shellKey = function (e) {
        if (e.repeat) {
            return;
        }
        if (e.code === 'KeyP') {
            this.togglePause();
        } else if (e.code === 'KeyM') {
            this.toggleMute();
        } else if ((e.code === 'Space' || e.code === 'Enter') && this.def.keyStart !== false) {
            if (this.state === 'title' || (this.state === 'over' && this.stateTime > 0.8)) {
                this.pressed[e.code] = false;   // the start key must not also act in the new game
                this.start();
            } else if (this.state === 'paused') {
                this.resume();
            }
        }
    };

    Shell.prototype._updateButtons = function () {
        this.btnSound.innerHTML = this.sound.muted ? ICONS.soundOff : ICONS.soundOn;
        this.btnSound.title = this.sound.muted ? 'Sound off (M)' : 'Sound on (M)';
        var showPlay = this.state !== 'playing';
        this.btnPause.innerHTML = showPlay ? ICONS.play : ICONS.pause;
        this.btnPause.title = this.state === 'playing' ? 'Pause (P)' : (this.state === 'paused' ? 'Resume (P)' : 'Start');
        this.scoreEl.innerHTML = 'SCORE <b>' + this.score + '</b>';
        this.bestEl.innerHTML = 'BEST <b>' + this.best + '</b>';
    };

    // ---- layout -----------------------------------------------------------------------------------

    Shell.prototype.resize = function (w, h) {
        this.W = w;
        this.H = h;
        if (this.canvas) {
            this.canvas.width = w;
            this.canvas.height = h;
            this.ctx.imageSmoothingEnabled = false;
        }
        this.fit();
    };

    Shell.prototype.fit = function () {
        if (!this.canvas) {
            return;
        }
        var full = document.fullscreenElement === this.root;
        var availW = Math.max(160, this.screen.clientWidth || this.container.clientWidth || this.W);
        var maxH = full ? global.innerHeight - 70 : (this.options.maxHeight || Math.max(320, Math.min(global.innerHeight * 0.78, 760)));
        var scale = Math.min(availW / this.W, maxH / this.H);
        var intScale = Math.floor(scale);
        if (intScale >= 2 && intScale / scale > 0.85) {
            scale = intScale;
        }
        var cw = Math.floor(this.W * scale), ch = Math.floor(this.H * scale);
        this.canvas.style.width = cw + 'px';
        this.canvas.style.height = ch + 'px';
        this.bgCanvas.style.width = cw + 'px';
        this.bgCanvas.style.height = ch + 'px';
        var dpr = global.devicePixelRatio || 1;
        this.bgCanvas.width = Math.max(1, Math.round(cw * dpr));
        this.bgCanvas.height = Math.max(1, Math.round(ch * dpr));
        this.displayScale = scale;
    };

    Shell.prototype.toggleFullscreen = function () {
        try {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else if (this.root.requestFullscreen) {
                this.root.requestFullscreen();
            }
        } catch (e) { /* not allowed */ }
    };

    /** High resolution background image drawn behind the pixel canvas. opts: scroll (logical px/s), alpha, tile */
    Shell.prototype.setBackground = function (fileName, opts) {
        var self = this;
        var img = new Image();
        self.bg = { img: img, ready: false, offset: 0, scroll: (opts && opts.scroll) || 0, alpha: (opts && opts.alpha) || 1 };
        img.onload = function () { self.bg.ready = true; };
        img.src = self.assetUrl(fileName);
    };

    Shell.prototype.assetUrl = function (fileName) {
        return this.host.assetUrl ? this.host.assetUrl(fileName) : '/resources/images/' + fileName;
    };

    Shell.prototype._renderBackground = function (dt) {
        var bg = this.bg, c = this.bgCanvas;
        if (!bg || !bg.ready || !c) {
            return;
        }
        var g = c.getContext('2d');
        var img = bg.img;
        var s = c.width / img.width;              // tile scaled to the canvas width
        var th = img.height * s;
        bg.offset = (bg.offset + bg.scroll * dt * (c.height / this.H)) % th;
        g.globalAlpha = bg.alpha;
        g.imageSmoothingEnabled = true;
        for (var y = bg.offset - th; y < c.height; y += th) {
            g.drawImage(img, 0, Math.floor(y), c.width, Math.ceil(th) + 1);
        }
        g.globalAlpha = 1;
    };

    // ---- lifecycle ----------------------------------------------------------------------------------

    Shell.prototype._setState = function (state) {
        this.state = state;
        this.stateTime = 0;
        this._updateButtons();
    };

    Shell.prototype.start = function () {
        var self = this;
        if (self.state === 'playing' || self.state === 'paused') {
            return;
        }
        self.score = 0;
        self._reportedScore = 0;
        self.overResult = '';
        self.sessionInfo = '';
        self.fx.clear();
        self.keys = {};
        self.pressed = {};
        if (self.game.newGame) {
            self.game.newGame();
        }
        self._setState('playing');
        self.sound.play('start');
        self.root.focus({ preventScroll: true });
        if (self.host.gameStarted) {
            self.host.gameStarted(self.id, function (info) {
                self.sessionInfo = info || '';
                if (self.game.onSession) {
                    self.game.onSession(self.sessionInfo);
                }
            });
        }
    };

    Shell.prototype.restart = function () {
        if (this.state === 'playing' || this.state === 'paused') {
            this.gameOver({ reason: 'restarted' }, true);
        }
        this._setState('title');
        this.start();
    };

    /** Ends a running round silently and goes back to the title state. */
    Shell.prototype.toTitle = function () {
        if (this.state === 'playing' || this.state === 'paused') {
            this.gameOver({ reason: 'stopped' }, true);
        }
        this._setState('title');
    };

    Shell.prototype.pause = function () {
        if (this.state === 'playing') {
            this._setState('paused');
            this.keys = {};
            if (this.game.onPause) {
                this.game.onPause();
            }
        }
    };

    Shell.prototype.resume = function () {
        if (this.state === 'paused') {
            this._setState('playing');
            this.root.focus({ preventScroll: true });
            if (this.game.onResume) {
                this.game.onResume();
            }
        }
    };

    Shell.prototype.togglePause = function () {
        if (this.state === 'playing') {
            this.pause();
        } else if (this.state === 'paused') {
            this.resume();
        }
    };

    Shell.prototype.stop = function () {
        if (this.state === 'playing' || this.state === 'paused') {
            this.gameOver({ reason: 'stopped' });
        }
    };

    Shell.prototype.toggleMute = function () {
        this.sound.setMuted(!this.sound.muted);
        this._updateButtons();
    };

    /** Host -> game commands (form buttons in D365, demo buttons in play.html). */
    Shell.prototype.command = function (action) {
        switch (action) {
            case 'start': if (this.state === 'title' || this.state === 'over') { this.start(); } else { this.resume(); } break;
            case 'pause': this.pause(); break;
            case 'resume': this.resume(); break;
            case 'toggle': this.togglePause(); break;
            case 'stop': this.stop(); break;
            case 'restart': this.restart(); break;
            case 'mute': this.sound.setMuted(true); this._updateButtons(); break;
            case 'unmute': this.sound.setMuted(false); this._updateButtons(); break;
        }
    };

    /** Best score supplied by the host (in D365: read by X++ from the session table). */
    Shell.prototype.setBest = function (n) {
        this.best = Math.max(0, Math.floor(Number(n) || 0));
        this._updateButtons();
    };

    Shell.prototype.addScore = function (n) {
        this.setScore(this.score + n);
    };

    Shell.prototype.setScore = function (n) {
        var self = this;
        self.score = Math.max(0, Math.floor(n));
        self.scoreEl.innerHTML = 'SCORE <b>' + self.score + '</b>';
        if (!self._scoreTimer) {
            self._scoreTimer = global.setTimeout(function () {
                self._scoreTimer = 0;
                self._flushScore();
            }, 400);
        }
    };

    Shell.prototype._flushScore = function () {
        if (this._scoreTimer) {
            global.clearTimeout(this._scoreTimer);
            this._scoreTimer = 0;
        }
        if (this.host.scoreChanged && this._reportedScore !== this.score) {
            this._reportedScore = this.score;
            this.host.scoreChanged(this.id, this.score);
        }
    };

    /** Ends the round. details: any JSON-serializable stats ({ reason: 'gameover' | 'won' | 'stopped', level: n, ... }) */
    Shell.prototype.gameOver = function (details, silent) {
        var self = this;
        if (self.state !== 'playing' && self.state !== 'paused') {
            return;
        }
        details = details || {};
        details.reason = details.reason || 'gameover';
        self._flushScore();
        self._setState('over');
        var isBest = self.score > self.best;
        if (isBest) {
            self.best = self.score;
        }
        self.newBest = isBest && self.score > 0;
        self._updateButtons();
        if (!silent) {
            self.sound.play(details.reason === 'won' ? 'win' : 'lose');
        }
        if (self.game.onGameOver) {
            self.game.onGameOver(details);
        }
        if (self.host.gameOver) {
            self.host.gameOver(self.id, self.score, JSON.stringify(details), function (result) {
                self.overResult = result || '';
                if (result === 'NEWBEST') {
                    self.newBest = true;
                }
            });
        }
    };

    Shell.prototype.request = function (name, payload, callback) {
        if (this.host.request) {
            this.host.request(name, payload || {}, callback);
        } else if (callback) {
            callback({ error: 'No data host' });
        }
    };

    // ---- input helpers ------------------------------------------------------------------------------

    Shell.prototype.isDown = function () {
        for (var i = 0; i < arguments.length; i++) {
            if (this.keys[arguments[i]]) {
                return true;
            }
        }
        return false;
    };

    Shell.prototype.wasPressed = function () {
        for (var i = 0; i < arguments.length; i++) {
            if (this.pressed[arguments[i]]) {
                return true;
            }
        }
        return false;
    };

    Shell.prototype.axisX = function () {
        return (this.isDown('ArrowRight', 'KeyD') ? 1 : 0) - (this.isDown('ArrowLeft', 'KeyA') ? 1 : 0);
    };

    Shell.prototype.axisY = function () {
        return (this.isDown('ArrowDown', 'KeyS') ? 1 : 0) - (this.isDown('ArrowUp', 'KeyW') ? 1 : 0);
    };

    // ---- effects ------------------------------------------------------------------------------------

    Shell.prototype.shake = function (mag, time) {
        this.shakeMag = Math.max(this.shakeMag, mag);
        this.shakeTime = Math.max(this.shakeTime, time || 0.3);
    };

    Shell.prototype.flash = function (color, time) {
        this.flashColor = color || '#ffffff';
        this.flashTime = time || 0.15;
    };

    Shell.prototype.text = function (str, x, y, opts) {
        return DEVArcade.drawText(this.ctx, str, x, y, opts);
    };

    // ---- loop ---------------------------------------------------------------------------------------

    Shell.prototype._frame = function (ts) {
        var self = this;
        self._raf = global.requestAnimationFrame(self._frameFn);
        var dt = self._last ? Math.min(0.1, (ts - self._last) / 1000) : STEP;
        self._last = ts;
        self.time += dt;
        self.stateTime += dt;

        try {
            if (self.state === 'playing') {
                self._acc += dt;
                var steps = 0;
                while (self._acc >= STEP && steps < 6) {
                    self._acc -= STEP;
                    steps++;
                    if (self.game.update) {
                        self.game.update(STEP);
                    }
                    self.fx.update(STEP);
                    self.pressed = {};
                    if (self.state !== 'playing') {
                        break;
                    }
                }
                if (steps === 6) {
                    self._acc = 0;
                }
            } else {
                self._acc = 0;
                if (self.game.idle) {
                    self.game.idle(dt);
                }
                if (self.state === 'over') {
                    self.fx.update(dt);
                }
            }
            if (self.shakeTime > 0) {
                self.shakeTime -= dt;
            }
            if (self.flashTime > 0) {
                self.flashTime -= dt;
            }
            if (self.canvas) {
                self._render(dt);
            }
        } catch (e) {
            if (!self._reportedError) {
                self._reportedError = true;
                if (global.console) {
                    global.console.error('DEVArcade ' + self.id + ':', e);
                }
            }
        }
    };

    Shell.prototype._render = function (dt) {
        var ctx = this.ctx;
        this._renderBackground(this.state === 'paused' ? 0 : dt);
        ctx.save();
        ctx.clearRect(0, 0, this.W, this.H);
        if (this.shakeTime > 0) {
            ctx.translate(Math.round((Math.random() - 0.5) * 2 * this.shakeMag), Math.round((Math.random() - 0.5) * 2 * this.shakeMag));
        }
        if (this.game.render) {
            this.game.render(ctx, this.state);
        }
        this.fx.render(ctx);
        ctx.restore();

        if (this.flashTime > 0) {
            ctx.globalAlpha = Math.min(0.6, this.flashTime * 4);
            ctx.fillStyle = this.flashColor;
            ctx.fillRect(0, 0, this.W, this.H);
            ctx.globalAlpha = 1;
        }

        if (this.state === 'title') {
            if (this.game.renderTitle) {
                this.game.renderTitle(ctx);
            } else {
                this._defaultTitle(ctx);
            }
        } else if (this.state === 'paused') {
            this._panel(ctx, 'PAUSED', ['PRESS P OR CLICK', 'TO CONTINUE']);
        } else if (this.state === 'over') {
            if (!this.game.renderGameOver || !this.game.renderGameOver(ctx)) {
                this._defaultGameOver(ctx);
            }
        }
        if (this.state === 'playing' && !this.focused) {
            this._banner(ctx, 'CLICK HERE TO CONTROL THE GAME');
        }
    };

    Shell.prototype._panel = function (ctx, title, lines, color) {
        var W = this.W, H = this.H;
        var pw = Math.min(W - 16, Math.max(DEVArcade.textWidth(title, 2), DEVArcade.textWidth(lines.reduce(function (a, b) { return a.length > b.length ? a : b; }, ''), 1)) + 28);
        var ph = 30 + lines.length * 11;
        var px = Math.floor((W - pw) / 2), py = Math.floor((H - ph) / 2);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#10152b';
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = color || '#ffd335';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.strokeRect(px + 2.5, py + 2.5, pw - 5, ph - 5);
        DEVArcade.drawText(ctx, title, W / 2, py + 8, { color: color || '#ffd335', scale: 2, align: 'center', shadow: '#000000' });
        for (var i = 0; i < lines.length; i++) {
            DEVArcade.drawText(ctx, lines[i], W / 2, py + 27 + i * 11, { color: '#ffffff', align: 'center' });
        }
    };

    Shell.prototype._banner = function (ctx, text) {
        if (Math.floor(this.time * 2) % 2) {
            return;
        }
        var w = DEVArcade.textWidth(text, 1) + 10;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(Math.floor((this.W - w) / 2), 2, w, 11);
        DEVArcade.drawText(ctx, text, this.W / 2, 4, { color: '#ffd335', align: 'center' });
    };

    Shell.prototype._defaultTitle = function (ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, this.W, this.H);
        DEVArcade.drawText(ctx, this.def.title, this.W / 2, this.H / 2 - 24, { color: '#ffd335', scale: 2, align: 'center', shadow: '#000' });
        if (Math.floor(this.time * 2) % 2 === 0) {
            DEVArcade.drawText(ctx, 'PRESS SPACE OR CLICK', this.W / 2, this.H / 2 + 6, { align: 'center' });
        }
    };

    Shell.prototype._defaultGameOver = function (ctx) {
        var lines = ['SCORE ' + this.score, 'BEST  ' + this.best];
        if (this.newBest) {
            lines.push(Math.floor(this.time * 4) % 2 ? 'NEW RECORD!' : '');
        }
        lines.push('');
        lines.push(this.stateTime > 0.8 ? 'SPACE OR CLICK = PLAY AGAIN' : '');
        this._panel(ctx, this.def.overTitle || 'GAME OVER', lines, '#ff5a5a');
    };

    Shell.prototype.destroy = function () {
        global.cancelAnimationFrame(this._raf);
        if (this._scoreTimer) {
            global.clearTimeout(this._scoreTimer);
        }
        (this._listeners || []).forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); });
        if (this._ro) {
            this._ro.disconnect();
        }
        if (this.game.destroy) {
            this.game.destroy();
        }
        if (this.root.parentNode) {
            this.root.parentNode.removeChild(this.root);
        }
        var i = DEVArcade.instances.indexOf(this);
        if (i >= 0) {
            DEVArcade.instances.splice(i, 1);
        }
    };

    DEVArcade.Shell = Shell;

    /** Creates a game in a container element. */
    DEVArcade.create = function (container, gameId, host, options) {
        return new Shell(container, gameId, host, options);
    };

})(window);

;
/* ===== DEVArcadeTank.js ===== */
/*!
 * DEVArcadeTank.js - "Tank Siege", a tribute to the 1990 tank classic, for DEV Arcade.
 */
(function () {
    'use strict';

    var A = window.DEVArcade, U = A.util;

    var W = 256, H = 224, OX = 16, OY = 8, FIELD = 208, CELL = 4, GRID = 52;
    var EMPTY = 0, BRICK = 1, STEEL = 2, WATER = 3, TREES = 4, ICE = 5;
    var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // up, right, down, left
    var EAGLE = { x: 96, y: 192, w: 16, h: 16 };
    var PLAYER_SPAWN = { x: 64, y: 192 };
    var ENEMY_SPAWNS = [{ x: 96, y: 0 }, { x: 192, y: 0 }, { x: 0, y: 0 }];

    var TYPES = {
        basic: { speed: 26, bullet: 130, pts: 100, hp: 1, fire: 1.4 },
        fast: { speed: 50, bullet: 130, pts: 200, hp: 1, fire: 1.3 },
        power: { speed: 34, bullet: 210, pts: 300, hp: 1, fire: 1.0 },
        armor: { speed: 30, bullet: 150, pts: 400, hp: 4, fire: 1.2 }
    };

    // 13 x 13 tiles: . empty, B brick, @ steel, ~ water, % trees, - ice
    var MAPS = [
        { name: 'FIRST LINE', rows: [
            '.............', '.B.B.B.B.B.B.', '.B.B.B.B.B.B.', '.B.B.B@B.B.B.', '.B.B.B.B.B.B.', '.B.B.....B.B.', '.....B.B.....',
            'BB.BB...BB.BB', '@...........@', '.B.B.BBB.B.B.', '.B.B.B.B.B.B.', '.B.B.....B.B.', '.B.B.....B.B.'] },
        { name: 'WATER WORKS', rows: [
            '...@.....@...', '.B.@.B.B.@.B.', '.B...B.B...B.', '.B.~~~.~~~.B.', '...~%%.%%~...', 'BB.~%B.B%~.BB', '...~%%.%%~...',
            '.B.~~~.~~~.B.', '.B.........B.', '.B.BB@.@BB.B.', '...B.....B...', '%%.B.....B.%%', '%%.........%%'] },
        { name: 'STEEL MAZE', rows: [
            '....@...@....', '.BB.@.B.@.BB.', '.B..@...@..B.', '.B.BBB.BBB.B.', '......%......', '@@.B%%%%%B.@@', '...B%@@@%B...',
            '@@.B%%%%%B.@@', '......%......', '.BBB.BBB.BBB.', '.B.........B.', '.B.@.....@.B.', '...@.....@...'] },
        { name: 'ICE FIELD', rows: [
            '.....---.....', '.BBB.---.BBB.', '.B@B.---.B@B.', '.BBB.---.BBB.', '-------------', '--B--@-@--B--', '--B-------B--',
            '--B--@-@--B--', '-------------', '.B.B.B.B.B.B.', '.B.B.B.B.B.B.', '.B.B.....B.B.', '.............'] },
        { name: 'FOREST', rows: [
            '%%%%.....%%%%', '%BB%.B.B.%BB%', '%%%%.B.B.%%%%', '....%%%%%....', '.B.%%B@B%%.B.', '.B.%%BBB%%.B.', '...%%%%%%%...',
            'BB...%%%...BB', '.....B.B.....', '@.B.BB.BB.B.@', '..B.......B..', '%%B.......B%%', '%%.........%%'] },
        { name: 'RIVER', rows: [
            '.............', '.BB.BB.BB.BB.', '.BB.BB.BB.BB.', '.............', '~~~~.~~~.~~~~', '~~~~.~~~.~~~~', '..@...B...@..',
            '~~~~.~~~.~~~~', '~~~~.~~~.~~~~', '.............', '.B@B.B.B.B@B.', '.BBB.....BBB.', '.............'] },
        { name: 'BUNKERS', rows: [
            '..@.......@..', '.@@.BB.BB.@@.', '....B...B....', 'BB..B.@.B..BB', 'B...BBBBB...B', 'B.%.......%.B', 'B.%.@@.@@.%.B',
            'B.%.......%.B', 'B...BBBBB...B', 'BB..B...B..BB', '....B...B....', '.@@.......@@.', '.............'] },
        { name: 'DEV STAND', rows: [
            '.............', '.BB..BBB.B.B.', '.B.B.B...B.B.', '.B.B.BB..B.B.', '.B.B.B...B.B.', '.BB..BBB..B..', '.............',
            '@@.~~~.~~~.@@', '......%......', '.B.B%%%%%B.B.', '.B.B.....B.B.', '.B.B.....B.B.', '.............'] }
    ];

    var POWER_KINDS = ['star', 'grenade', 'helmet', 'shovel', 'clock', 'tank'];

    // ---------------------------------------------------------------------------------------------
    // Graphics
    // ---------------------------------------------------------------------------------------------
    var TANK_ROWS = [
        '.......LL.......',
        '.......LL.......',
        'XXX....LD....XXX',
        'YYY.BBBLDBBB.YYY',
        'XXX.BLLLDLLB.XXX',
        'YYY.BLkkkkLB.YYY',
        'XXX.BkLLLDkB.XXX',
        'YYY.BkLLLDkB.YYY',
        'XXX.BkLDDDkB.XXX',
        'YYY.BLkkkkLB.YYY',
        'XXX.BLLLLLLB.XXX',
        'YYY.BDDDDDDB.YYY',
        'XXX.BBBBBBBB.XXX',
        'YYY..........YYY',
        'XXX..........XXX',
        '................'
    ];
    var PALETTES = {
        player: { L: '#ffe880', B: '#e0b020', D: '#8a6a00', k: '#5a4500', t1: '#c09018', t2: '#5a4500' },
        basic: { L: '#ffffff', B: '#b8b8b8', D: '#6a6a6a', k: '#3a3a3a', t1: '#a0a0a0', t2: '#3a3a3a' },
        fast: { L: '#e8fbff', B: '#8fd8f0', D: '#3a7a90', k: '#1d4a5a', t1: '#7ab8cc', t2: '#1d4a5a' },
        power: { L: '#fff0e0', B: '#e8a060', D: '#8a4a10', k: '#5a2a00', t1: '#c88040', t2: '#5a2a00' },
        armor4: { L: '#c8ffb8', B: '#40c030', D: '#106010', k: '#063806', t1: '#30a020', t2: '#063806' },
        armor3: { L: '#fff6b0', B: '#d8c830', D: '#6a6010', k: '#3a3400', t1: '#b8a820', t2: '#3a3400' },
        armor2: { L: '#e0e8ff', B: '#a0b0e0', D: '#405080', k: '#202848', t1: '#8090c0', t2: '#202848' },
        bonus: { L: '#ffc0c0', B: '#e83030', D: '#8a1010', k: '#500000', t1: '#c02020', t2: '#500000' }
    };

    var gfx = null;

    function tankSprite(pal, phase) {
        var p = { L: pal.L, B: pal.B, D: pal.D, k: pal.k, X: phase ? pal.t2 : pal.t1, Y: phase ? pal.t1 : pal.t2 };
        return A.sprite(TANK_ROWS, p);
    }

    function buildGfx() {
        if (gfx) {
            return gfx;
        }
        gfx = { tanks: {} };
        Object.keys(PALETTES).forEach(function (k) {
            gfx.tanks[k] = [0, 1].map(function (phase) {
                var base = tankSprite(PALETTES[k], phase);
                return [0, 1, 2, 3].map(function (d) { return A.rotateSprite(base, d); });
            });
        });

        gfx.eagle = A.sprite([
            '................',
            '.w....wwww....w.',
            '.ww..wwwwww..ww.',
            '.www.ww..ww.www.',
            '.wwwwwwwwwwwwww.',
            '..wwwwwwwwwwww..',
            '...wwwwwwwwww...',
            '....wwwwwwww....',
            '.....wwwwww.....',
            '....ww.ww.ww....',
            '...ww..ww..ww...',
            '.......ww.......',
            '......wwww......',
            '.....wwwwww.....',
            '....wwwwwwww....',
            '................'
        ], { w: '#d8d8d8' });
        gfx.eagleDead = A.sprite([
            '................',
            '................',
            '.......k........',
            '..k...kkk...k...',
            '...kk.kwk..kk...',
            '....kkwwwkkk....',
            '.k..kwwkwwk..k..',
            '..kkwwkkkwwkk...',
            '...kwkkwkkwk....',
            '..kkwwkkkwwkk...',
            '.k..kwwkwwk..k..',
            '....kkwwwkk.....',
            '...kk.kwk.kk....',
            '..k...kkk...k...',
            '.wwwwwwwwwwwwww.',
            '................'
        ], { k: '#5a5a5a', w: '#a8a8a8' });

        var icons = {
            star: ['....yy....', '....yy....', '...yyyy...', 'yyyyyyyyyy', '.yyyyyyyy.', '..yyyyyy..', '..yyyyyy..', '.yyy..yyy.', '.yy....yy.', '..........'],
            grenade: ['....kk....', '...k..k...', '....kk....', '...gggg...', '..gGgggg..', '.gGggggggg', '.gggggggg.', '.gggggggg.', '..gggggg..', '...gggg...'],
            helmet: ['..........', '...wwww...', '..wWwwww..', '.wWwwwwww.', '.wwwwwwww.', '.wwwwwwww.', 'wwwwwwwwww', 'w........w', '..........', '..........'],
            shovel: ['......kk..', '.....k..k.', '......kk..', '.....k....', '....k.....', '...k......', '.www......', 'wwwww.....', '.www......', '..w.......'],
            clock: ['...wwww...', '..w....w..', '.w...k..w.', 'w....k...w', 'w....kkk.w', 'w........w', '.w......w.', '..w....w..', '...wwww...', '..........'],
            tank: ['....yy....', '....yy....', 'yy.yyyy.yy', 'yyyyyyyyyy', 'yy.yyyy.yy', 'yyyyyyyyyy', 'yy.yyyy.yy', 'yyyyyyyyyy', 'yy......yy', '..........']
        };
        var iconPal = { y: '#ffd335', k: '#202020', g: '#2f8f2f', G: '#7ad06a', w: '#e8e8e8', W: '#ffffff' };
        gfx.powers = {};
        Object.keys(icons).forEach(function (k) {
            var c = document.createElement('canvas');
            c.width = 16;
            c.height = 16;
            var g = c.getContext('2d');
            g.fillStyle = '#ffffff';
            g.fillRect(0, 0, 16, 16);
            g.fillStyle = '#1b2033';
            g.fillRect(1, 1, 14, 14);
            g.drawImage(A.sprite(icons[k], iconPal), 3, 3);
            gfx.powers[k] = c;
        });

        gfx.smallTank = A.sprite(['.k.k.', 'kkkkk', '.kkk.', 'kkkkk', 'k...k'], { k: '#1b1b1b' });
        gfx.lifeTank = A.sprite(['.y.y.', 'yyyyy', '.yyy.', 'yyyyy', 'y...y'], { y: '#e0b020' });
        return gfx;
    }

    // ---------------------------------------------------------------------------------------------
    // Game
    // ---------------------------------------------------------------------------------------------
    function Tank(shell) {
        this.shell = shell;
        this.t = 0;
        buildGfx();
        this.terrain = document.createElement('canvas');
        this.terrain.width = FIELD;
        this.terrain.height = FIELD;
        this.treesCanvas = document.createElement('canvas');
        this.treesCanvas.width = FIELD;
        this.treesCanvas.height = FIELD;
        this.newGame();
        this.lastDir = -1;
    }

    Tank.prototype.newGame = function () {
        this.lives = 3;
        this.star = 0;
        this.nextLife = 20000;
        this.startStage(1);
    };

    Tank.prototype.startStage = function (n) {
        this.stage = n;
        var map = MAPS[(n - 1) % MAPS.length];
        this.mapName = map.name;
        this.cells = new Uint8Array(GRID * GRID);
        for (var ty = 0; ty < 13; ty++) {
            for (var tx = 0; tx < 13; tx++) {
                var ch = map.rows[ty][tx];
                var type = { 'B': BRICK, '@': STEEL, '~': WATER, '%': TREES, '-': ICE }[ch] || EMPTY;
                if (type) {
                    for (var cy = 0; cy < 4; cy++) {
                        for (var cx = 0; cx < 4; cx++) {
                            this.cells[(ty * 4 + cy) * GRID + tx * 4 + cx] = type;
                        }
                    }
                }
            }
        }
        this.setFortress(BRICK);
        this.waterCells = [];
        for (var i = 0; i < this.cells.length; i++) {
            if (this.cells[i] === WATER) {
                this.waterCells.push(i);
            }
        }
        this.terrainDirty = true;
        this.drawTrees();

        // enemy queue: harder mixes on later stages
        var s = n - 1, loop = Math.floor(s / MAPS.length);
        var mix = { fast: Math.min(6, 2 + s), power: Math.min(6, s), armor: Math.min(8, Math.max(0, s - 1) + loop * 2) };
        mix.basic = Math.max(0, 20 - mix.fast - mix.power - mix.armor);
        var queue = [];
        Object.keys(mix).forEach(function (k) { for (var j = 0; j < mix[k]; j++) { queue.push(k); } });
        U.shuffle(queue);
        this.queue = queue.map(function (k, idx) { return { type: k, bonus: idx === 3 || idx === 10 || idx === 17 }; });

        this.enemies = [];
        this.bullets = [];
        this.booms = [];
        this.power = null;
        this.kills = { basic: 0, fast: 0, power: 0, armor: 0 };
        this.spawnIndex = 0;
        this.spawnTimer = 0.5;
        this.freeze = 0;
        this.shovel = 0;
        this.eagleAlive = true;
        this.spawnPlayer();
        this.mode = 'curtain';
        this.modeTime = 0;
    };

    Tank.prototype.spawnPlayer = function () {
        this.player = {
            x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y, dir: 0, frame: 0, moving: false, slide: 0, spawn: 1.0,
            helmet: 3, alive: true, dead: 0, cooldown: 0, isPlayer: true
        };
    };

    Tank.prototype.setFortress = function (type) {
        for (var cy = 46; cy < 52; cy++) {
            for (var cx = 22; cx < 30; cx++) {
                if (cx >= 24 && cx < 28 && cy >= 48) {
                    continue;
                }
                this.cells[cy * GRID + cx] = type;
            }
        }
        this.terrainDirty = true;
    };

    // ---- terrain ----------------------------------------------------------------------------------

    Tank.prototype.cell = function (cx, cy) {
        if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) {
            return STEEL;
        }
        return this.cells[cy * GRID + cx];
    };

    Tank.prototype.drawTerrain = function () {
        var g = this.terrain.getContext('2d');
        g.clearRect(0, 0, FIELD, FIELD);
        for (var cy = 0; cy < GRID; cy++) {
            for (var cx = 0; cx < GRID; cx++) {
                var t = this.cells[cy * GRID + cx], x = cx * CELL, y = cy * CELL;
                if (t === BRICK) {
                    g.fillStyle = '#9c3c0c';
                    g.fillRect(x, y, 4, 4);
                    g.fillStyle = '#d8783c';
                    g.fillRect(x, y, 4, 1);
                    g.fillStyle = '#5a2008';
                    g.fillRect(x, y + 3, 4, 1);
                    if ((cx + (cy % 2)) % 2 === 0) {
                        g.fillRect(x, y, 1, 4);
                    }
                } else if (t === STEEL) {
                    var bx = cx % 2, by = cy % 2;
                    g.fillStyle = '#b4b4b4';
                    g.fillRect(x, y, 4, 4);
                    g.fillStyle = bx === 0 && by === 0 ? '#ffffff' : (bx === 1 && by === 1 ? '#5c5c5c' : '#b4b4b4');
                    g.fillRect(x + (bx ? 0 : 1), y + (by ? 0 : 1), 3, 3);
                    if (bx === 1 && by === 1) {
                        g.fillStyle = '#ffffff';
                        g.fillRect(x, y, 1, 1);
                    }
                } else if (t === ICE) {
                    g.fillStyle = '#c8d8f0';
                    g.fillRect(x, y, 4, 4);
                    g.fillStyle = '#ffffff';
                    g.fillRect(x + ((cx + cy) % 4), y + ((cx + cy) % 4), 1, 1);
                    g.fillStyle = '#90a8d0';
                    g.fillRect(x + 3 - ((cx * 3 + cy) % 4), y + ((cy * 2) % 4), 1, 1);
                }
            }
        }
        this.terrainDirty = false;
    };

    Tank.prototype.drawTrees = function () {
        var g = this.treesCanvas.getContext('2d');
        g.clearRect(0, 0, FIELD, FIELD);
        for (var cy = 0; cy < GRID; cy++) {
            for (var cx = 0; cx < GRID; cx++) {
                if (this.cells[cy * GRID + cx] !== TREES) {
                    continue;
                }
                var x = cx * CELL, y = cy * CELL;
                g.fillStyle = '#145a14';
                g.fillRect(x, y, 4, 4);
                g.fillStyle = '#2f9a2f';
                g.fillRect(x + ((cx + cy) % 2), y, 2, 2);
                g.fillRect(x + 2 - ((cx + cy) % 2), y + 2, 2, 2);
                g.fillStyle = '#8ae07a';
                g.fillRect(x + ((cx * 7 + cy * 3) % 3), y + ((cx * 5 + cy) % 3), 1, 1);
            }
        }
    };

    /** Returns true when a tank rect is blocked by terrain, the eagle or the field edge. */
    Tank.prototype.blockedByTerrain = function (x, y) {
        if (x < 0 || y < 0 || x > FIELD - 16 || y > FIELD - 16) {
            return true;
        }
        var x0 = Math.floor(x / CELL), y0 = Math.floor(y / CELL), x1 = Math.floor((x + 15.999) / CELL), y1 = Math.floor((y + 15.999) / CELL);
        for (var cy = y0; cy <= y1; cy++) {
            for (var cx = x0; cx <= x1; cx++) {
                var t = this.cell(cx, cy);
                if (t === BRICK || t === STEEL || t === WATER) {
                    return true;
                }
            }
        }
        return x < EAGLE.x + 16 && x + 16 > EAGLE.x && y < EAGLE.y + 16 && y + 16 > EAGLE.y;
    };

    Tank.prototype.allTanks = function () {
        var list = this.enemies.slice();
        if (this.player.alive) {
            list.push(this.player);
        }
        return list;
    };

    Tank.prototype.tryMove = function (tank, dist) {
        var d = DIRS[tank.dir];
        var nx = tank.x + d[0] * dist, ny = tank.y + d[1] * dist;
        if (this.blockedByTerrain(nx, ny)) {
            return false;
        }
        var others = this.allTanks();
        for (var i = 0; i < others.length; i++) {
            var o = others[i];
            if (o === tank || o.spawn > 0) {
                continue;
            }
            var overlapNew = nx < o.x + 16 && nx + 16 > o.x && ny < o.y + 16 && ny + 16 > o.y;
            var overlapOld = tank.x < o.x + 16 && tank.x + 16 > o.x && tank.y < o.y + 16 && tank.y + 16 > o.y;
            if (overlapNew && !overlapOld) {
                return false;
            }
        }
        tank.x = nx;
        tank.y = ny;
        return true;
    };

    Tank.prototype.turn = function (tank, dir) {
        if (tank.dir === dir) {
            return;
        }
        if ((tank.dir + dir) % 2 === 1) {   // perpendicular: align to the 8 px grid like the original
            if (dir % 2 === 0) {
                tank.x = Math.round(tank.x / 8) * 8;
            } else {
                tank.y = Math.round(tank.y / 8) * 8;
            }
        }
        tank.dir = dir;
    };

    Tank.prototype.onIce = function (tank) {
        var cx = Math.floor((tank.x + 8) / CELL), cy = Math.floor((tank.y + 8) / CELL);
        return this.cell(cx, cy) === ICE;
    };

    // ---- input ------------------------------------------------------------------------------------

    var DIR_KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };

    Tank.prototype.onKey = function (code, down) {
        if (down && DIR_KEYS[code] !== undefined) {
            this.lastDir = DIR_KEYS[code];
            this.lastDirCode = code;
        }
    };

    Tank.prototype.inputDir = function () {
        var shell = this.shell;
        if (this.lastDirCode && shell.keys[this.lastDirCode]) {
            return this.lastDir;
        }
        for (var k in DIR_KEYS) {
            if (shell.keys[k]) {
                return DIR_KEYS[k];
            }
        }
        return -1;
    };

    // ---- update -----------------------------------------------------------------------------------

    Tank.prototype.update = function (dt) {
        this.t += dt;
        this.modeTime += dt;
        this.updateBooms(dt);

        if (this.mode === 'curtain') {
            if (this.modeTime > 2.0) {
                this.mode = 'play';
                this.modeTime = 0;
            }
            return;
        }
        if (this.mode === 'tally') {
            if (this.modeTime > 4.2) {
                this.startStage(this.stage + 1);
            }
            return;
        }
        if (this.mode === 'over') {
            this.updateBullets(dt);
            if (this.modeTime > 2.6) {
                this.shell.gameOver({ reason: 'gameover', stage: this.stage, eagle: this.eagleAlive ? 'alive' : 'destroyed' });
            }
            return;
        }

        this.updatePlayer(dt);
        this.updateSpawns(dt);
        this.updateEnemies(dt);
        this.updateBullets(dt);
        this.updatePower(dt);
        if (this.freeze > 0) { this.freeze -= dt; }
        if (this.shovel > 0) {
            this.shovel -= dt;
            if (this.shovel <= 0) {
                this.setFortress(BRICK);
            } else if (this.shovel < 3) {
                var blink = Math.floor(this.shovel * 4) % 2;
                if (blink !== this.shovelBlink) {
                    this.shovelBlink = blink;
                    this.setFortress(blink ? BRICK : STEEL);
                }
            }
        }
        if (this.shell.score >= this.nextLife) {
            this.nextLife += 20000;
            this.lives++;
            this.shell.sound.play('coin');
        }

        if (this.mode === 'play' && !this.queue.length && !this.enemies.length) {
            this.mode = 'clear';
            this.modeTime = 0;
        }
        if (this.mode === 'clear' && this.modeTime > 2.5) {
            this.mode = 'tally';
            this.modeTime = 0;
            this.shell.sound.play('win');
        }
    };

    Tank.prototype.updatePlayer = function (dt) {
        var p = this.player, shell = this.shell;
        if (!p.alive) {
            p.dead += dt;
            if (p.dead > 1.6) {
                if (this.lives <= 0) {
                    this.enterGameOver();
                } else {
                    this.spawnPlayer();
                }
            }
            return;
        }
        if (p.spawn > 0) {
            p.spawn -= dt;
            return;
        }
        if (p.helmet > 0) { p.helmet -= dt; }
        if (p.cooldown > 0) { p.cooldown -= dt; }

        var dir = this.inputDir();
        var speed = 46;
        p.moving = false;
        if (dir >= 0) {
            this.turn(p, dir);
            p.moving = this.tryMove(p, speed * dt) || true;
            p.slide = this.onIce(p) ? 14 : 0;
        } else if (p.slide > 0) {
            var step = speed * dt;
            if (this.tryMove(p, step)) {
                p.slide -= step;
                p.moving = true;
            } else {
                p.slide = 0;
            }
        }
        if (p.moving) {
            p.frame = Math.floor(this.t * 12) % 2;
        }

        if (shell.isDown('Space', 'KeyJ', 'KeyZ', 'Enter') && p.cooldown <= 0) {
            var mine = this.bullets.filter(function (b) { return b.owner === p; }).length;
            if (mine < (this.star >= 2 ? 2 : 1)) {
                this.fire(p, this.star >= 1 ? 260 : 180, this.star >= 3);
                p.cooldown = 0.12;
                shell.sound.play('shoot');
            }
        }
    };

    Tank.prototype.fire = function (tank, speed, heavy) {
        var d = DIRS[tank.dir];
        this.bullets.push({
            x: tank.x + 8 + d[0] * 8, y: tank.y + 8 + d[1] * 8, dx: d[0], dy: d[1], speed: speed, owner: tank,
            player: !!tank.isPlayer, heavy: !!heavy
        });
    };

    Tank.prototype.updateSpawns = function (dt) {
        if (!this.queue.length || this.mode !== 'play') {
            return;
        }
        var maxOnScreen = this.stage > 8 ? 5 : 4;
        this.spawnTimer -= dt;
        if (this.spawnTimer > 0 || this.enemies.length >= maxOnScreen) {
            return;
        }
        var pos = ENEMY_SPAWNS[this.spawnIndex % 3];
        var occupied = this.allTanks().some(function (o) { return Math.abs(o.x - pos.x) < 16 && Math.abs(o.y - pos.y) < 16; });
        if (occupied) {
            this.spawnIndex++;
            this.spawnTimer = 0.3;
            return;
        }
        this.spawnIndex++;
        var item = this.queue.shift();
        var type = TYPES[item.type];
        this.enemies.push({
            x: pos.x, y: pos.y, dir: 2, frame: 0, type: item.type, hp: type.hp, bonus: item.bonus, spawn: 1.0,
            fireTimer: U.rand(0.5, type.fire), turnTimer: U.rand(0.5, 2), flash: 0
        });
        this.spawnTimer = Math.max(1.2, 2.8 - this.stage * 0.12);
    };

    Tank.prototype.updateEnemies = function (dt) {
        var self = this;
        self.enemies.forEach(function (e) {
            if (e.flash > 0) { e.flash -= dt; }
            if (e.spawn > 0) {
                e.spawn -= dt;
                return;
            }
            if (self.freeze > 0) {
                return;
            }
            var type = TYPES[e.type];
            var moved = self.tryMove(e, type.speed * dt);
            if (moved) {
                e.frame = Math.floor(self.t * 10) % 2;
            }
            e.turnTimer -= dt;
            if (!moved || e.turnTimer <= 0) {
                e.turnTimer = U.rand(0.8, 2.6);
                self.turn(e, self.chooseDir(e, !moved));
            }
            e.fireTimer -= dt;
            if (e.fireTimer <= 0) {
                e.fireTimer = U.rand(0.4, type.fire) * Math.max(0.55, 1 - self.stage * 0.04);
                var active = self.bullets.some(function (b) { return b.owner === e; });
                if (!active) {
                    self.fire(e, type.bullet, false);
                }
            }
        });
    };

    Tank.prototype.chooseDir = function (e, blocked) {
        var r = Math.random(), p = this.player;
        if (r < 0.35) {
            // toward the eagle
            if (e.y < EAGLE.y - 8) {
                return Math.random() < 0.65 ? 2 : (e.x < EAGLE.x ? 1 : 3);
            }
            return e.x < EAGLE.x ? 1 : 3;
        }
        if (r < 0.55 && p.alive) {
            // toward the player
            var dx = p.x - e.x, dy = p.y - e.y;
            return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0);
        }
        var d = U.randInt(0, 3);
        if (blocked && d === e.dir) {
            d = (d + U.randInt(1, 3)) % 4;
        }
        return d;
    };

    Tank.prototype.updateBullets = function (dt) {
        for (var i = this.bullets.length - 1; i >= 0; i--) {
            var b = this.bullets[i];
            if (b.dead) {
                this.bullets.splice(i, 1);
                continue;
            }
            var dist = b.speed * dt, n = Math.ceil(dist / 2);
            for (var s = 0; s < n && !b.dead; s++) {
                b.x += b.dx * dist / n;
                b.y += b.dy * dist / n;
                this.bulletStep(b);
            }
            if (b.dead) {
                this.bullets.splice(i, 1);
            }
        }
    };

    Tank.prototype.bulletStep = function (b) {
        var shell = this.shell;
        // field edges
        if (b.x < 1 || b.y < 1 || b.x > FIELD - 1 || b.y > FIELD - 1) {
            this.smallBoom(b.x, b.y);
            if (b.player) {
                shell.sound.play('metal');
            }
            b.dead = true;
            return;
        }
        // eagle
        if (this.eagleAlive && b.x > EAGLE.x && b.x < EAGLE.x + 16 && b.y > EAGLE.y && b.y < EAGLE.y + 16) {
            b.dead = true;
            this.destroyEagle();
            return;
        }
        // terrain
        var cx = Math.floor(b.x / CELL), cy = Math.floor(b.y / CELL);
        var probe = [[cx, cy]];
        if (b.dx === 0) {
            probe.push([Math.floor((b.x - 2) / CELL), cy], [Math.floor((b.x + 1) / CELL), cy]);
        } else {
            probe.push([cx, Math.floor((b.y - 2) / CELL)], [cx, Math.floor((b.y + 1) / CELL)]);
        }
        var hit = false;
        for (var k = 0; k < probe.length; k++) {
            var t = this.cell(probe[k][0], probe[k][1]);
            if (t === BRICK || t === STEEL) {
                hit = true;
            }
        }
        if (hit) {
            this.impact(b);
            b.dead = true;
            return;
        }
        // tanks
        var self = this;
        if (b.player) {
            for (var i = 0; i < self.enemies.length; i++) {
                var e = self.enemies[i];
                if (e.spawn <= 0 && b.x > e.x && b.x < e.x + 16 && b.y > e.y && b.y < e.y + 16) {
                    b.dead = true;
                    self.hitEnemy(i);
                    return;
                }
            }
        } else {
            var p = self.player;
            if (p.alive && p.spawn <= 0 && b.x > p.x && b.x < p.x + 16 && b.y > p.y && b.y < p.y + 16) {
                b.dead = true;
                if (p.helmet > 0) {
                    shell.sound.play('metal');
                } else {
                    self.killPlayer();
                }
                return;
            }
            for (var j = 0; j < self.enemies.length; j++) {   // enemy bullets stop at other enemies
                var o = self.enemies[j];
                if (o !== b.owner && b.x > o.x && b.x < o.x + 16 && b.y > o.y && b.y < o.y + 16) {
                    b.dead = true;
                    return;
                }
            }
        }
        // bullet vs bullet
        for (var q = 0; q < self.bullets.length; q++) {
            var o2 = self.bullets[q];
            if (o2 !== b && !o2.dead && o2.player !== b.player && Math.abs(o2.x - b.x) < 4 && Math.abs(o2.y - b.y) < 4) {
                o2.dead = true;
                b.dead = true;
                return;
            }
        }
    };

    Tank.prototype.impact = function (b) {
        var depth = b.heavy ? 2 : 1, steelHit = false, brickHit = false;
        var cx0, cx1, cy0, cy1;
        var cx = Math.floor(b.x / CELL), cy = Math.floor(b.y / CELL);
        if (b.dx === 0) {
            cx0 = Math.floor((b.x - 8) / CELL);
            cx1 = Math.floor((b.x + 7) / CELL);
            cy0 = b.dy < 0 ? cy - depth + 1 : cy;
            cy1 = b.dy < 0 ? cy : cy + depth - 1;
        } else {
            cy0 = Math.floor((b.y - 8) / CELL);
            cy1 = Math.floor((b.y + 7) / CELL);
            cx0 = b.dx < 0 ? cx - depth + 1 : cx;
            cx1 = b.dx < 0 ? cx : cx + depth - 1;
        }
        for (var y = cy0; y <= cy1; y++) {
            for (var x = cx0; x <= cx1; x++) {
                if (x < 0 || y < 0 || x >= GRID || y >= GRID) {
                    continue;
                }
                var t = this.cells[y * GRID + x];
                if (t === BRICK) {
                    this.cells[y * GRID + x] = EMPTY;
                    brickHit = true;
                } else if (t === STEEL) {
                    if (b.heavy) {
                        this.cells[y * GRID + x] = EMPTY;
                        brickHit = true;
                    } else {
                        steelHit = true;
                    }
                }
            }
        }
        if (brickHit) {
            this.terrainDirty = true;
        }
        this.smallBoom(b.x, b.y);
        if (b.player) {
            this.shell.sound.play(steelHit && !brickHit ? 'metal' : 'brick');
        }
    };

    Tank.prototype.hitEnemy = function (i) {
        var e = this.enemies[i], shell = this.shell;
        if (e.bonus) {
            e.bonus = false;
            this.spawnPower();
        }
        e.hp--;
        if (e.hp > 0) {
            e.flash = 0.15;
            shell.sound.play('metal');
            return;
        }
        this.enemies.splice(i, 1);
        var pts = TYPES[e.type].pts;
        this.kills[e.type]++;
        shell.addScore(pts);
        shell.fx.text(String(pts), e.x + 8, e.y + 4, '#ffffff');
        this.bigBoom(e.x + 8, e.y + 8);
        shell.sound.play('explode');
    };

    Tank.prototype.killPlayer = function () {
        var p = this.player;
        p.alive = false;
        p.dead = 0;
        this.lives--;
        this.star = 0;
        this.bigBoom(p.x + 8, p.y + 8);
        this.shell.sound.play('bigExplode');
        this.shell.shake(3, 0.4);
    };

    Tank.prototype.destroyEagle = function () {
        if (!this.eagleAlive) {
            return;
        }
        this.eagleAlive = false;
        this.bigBoom(EAGLE.x + 8, EAGLE.y + 8);
        this.shell.sound.play('bigExplode');
        this.shell.shake(5, 0.6);
        this.enterGameOver();
    };

    Tank.prototype.enterGameOver = function () {
        if (this.mode !== 'over') {
            this.mode = 'over';
            this.modeTime = 0;
        }
    };

    Tank.prototype.spawnPower = function () {
        var kind = U.pick(POWER_KINDS);
        for (var tries = 0; tries < 40; tries++) {
            var x = U.randInt(0, 12) * 16, y = U.randInt(1, 10) * 16;
            if (!this.blockedByTerrain(x, y) || tries > 30) {
                this.power = { x: x, y: y, kind: kind, time: 15 };
                this.shell.sound.play('powerup');
                return;
            }
        }
    };

    Tank.prototype.updatePower = function (dt) {
        var pw = this.power, p = this.player, self = this, shell = this.shell;
        if (!pw) {
            return;
        }
        pw.time -= dt;
        if (pw.time <= 0) {
            this.power = null;
            return;
        }
        if (!p.alive || p.spawn > 0 || Math.abs(p.x - pw.x) > 13 || Math.abs(p.y - pw.y) > 13) {
            return;
        }
        this.power = null;
        shell.addScore(500);
        shell.fx.text('500', pw.x + 8, pw.y + 4, '#ffd335');
        shell.sound.play(pw.kind === 'tank' ? 'coin' : 'powerup');
        switch (pw.kind) {
            case 'star': this.star = Math.min(3, this.star + 1); break;
            case 'helmet': p.helmet = 10; break;
            case 'clock': this.freeze = 10; break;
            case 'shovel': this.shovel = 15; this.shovelBlink = -1; this.setFortress(STEEL); break;
            case 'tank': this.lives++; break;
            case 'grenade':
                self.enemies.forEach(function (e) { if (e.spawn <= 0) { self.bigBoom(e.x + 8, e.y + 8); self.kills[e.type]++; } });
                self.enemies = self.enemies.filter(function (e) { return e.spawn > 0; });
                shell.sound.play('bigExplode');
                shell.shake(4, 0.4);
                break;
        }
    };

    Tank.prototype.smallBoom = function (x, y) {
        this.booms.push({ x: x, y: y, t: 0, big: false });
    };

    Tank.prototype.bigBoom = function (x, y) {
        this.booms.push({ x: x, y: y, t: 0, big: true });
        this.shell.fx.burst(OX + x, OY + y, { count: 14, colors: ['#ffffff', '#ffd335', '#ff7a1a', '#e83030'], speed: 60, life: 0.5 });
    };

    Tank.prototype.updateBooms = function (dt) {
        for (var i = this.booms.length - 1; i >= 0; i--) {
            this.booms[i].t += dt;
            if (this.booms[i].t > (this.booms[i].big ? 0.45 : 0.2)) {
                this.booms.splice(i, 1);
            }
        }
    };

    Tank.prototype.idle = function (dt) {
        this.t += dt;
    };

    // ---- render -----------------------------------------------------------------------------------

    Tank.prototype.tankImage = function (tank) {
        var key;
        if (tank.isPlayer) {
            key = 'player';
        } else if (tank.bonus && Math.floor(this.t * 6) % 2) {
            key = 'bonus';
        } else if (tank.type === 'armor') {
            key = tank.hp >= 4 ? 'armor4' : (tank.hp === 3 ? 'armor3' : (tank.hp === 2 ? 'armor2' : 'basic'));
        } else {
            key = tank.type;
        }
        return gfx.tanks[key][tank.frame || 0][tank.dir];
    };

    Tank.prototype.render = function (ctx, state) {
        var self = this, t = this.t;
        ctx.fillStyle = '#636363';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#000000';
        ctx.fillRect(OX, OY, FIELD, FIELD);

        if (state === 'title') {
            return;
        }
        if (this.mode === 'tally') {
            this.renderTally(ctx);
            return;
        }

        if (this.terrainDirty) {
            this.drawTerrain();
        }
        // water (animated)
        var phase = Math.floor(t * 1.5) % 2;
        for (var i = 0; i < this.waterCells.length; i++) {
            var idx = this.waterCells[i], cx = idx % GRID, cy = Math.floor(idx / GRID);
            ctx.fillStyle = '#1f3fbf';
            ctx.fillRect(OX + cx * CELL, OY + cy * CELL, CELL, CELL);
            if ((cx + cy + phase) % 3 === 0) {
                ctx.fillStyle = '#7c9cff';
                ctx.fillRect(OX + cx * CELL + phase, OY + cy * CELL + 1, 2, 1);
            }
        }
        ctx.drawImage(this.terrain, OX, OY);
        ctx.drawImage(this.eagleAlive ? gfx.eagle : gfx.eagleDead, OX + EAGLE.x, OY + EAGLE.y);

        // tanks
        var tanks = this.enemies.slice();
        if (this.player.alive) {
            tanks.push(this.player);
        }
        tanks.forEach(function (tk) {
            if (tk.spawn > 0) {
                self.drawSpawn(ctx, OX + tk.x + 8, OY + tk.y + 8, tk.spawn);
                return;
            }
            var img = tk.flash > 0 ? null : self.tankImage(tk);
            if (img) {
                ctx.drawImage(img, OX + Math.round(tk.x), OY + Math.round(tk.y));
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(OX + Math.round(tk.x) + 3, OY + Math.round(tk.y) + 3, 10, 10);
            }
            if (tk.isPlayer && tk.helmet > 0) {
                self.drawShield(ctx, OX + Math.round(tk.x), OY + Math.round(tk.y));
            }
        });

        // bullets
        this.bullets.forEach(function (b) {
            ctx.fillStyle = '#d8d8d8';
            ctx.fillRect(OX + Math.round(b.x) - 1, OY + Math.round(b.y) - 1, 3, 3);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(OX + Math.round(b.x), OY + Math.round(b.y), 1, 1);
        });

        ctx.drawImage(this.treesCanvas, OX, OY);

        // explosions
        this.booms.forEach(function (b) {
            var r = b.big ? 3 + b.t * 30 : 2 + b.t * 20;
            var colors = ['#ffffff', '#ffd335', '#ff7a1a', '#e83030'];
            for (var k = 0; k < (b.big ? 16 : 8); k++) {
                var a = k * 2.399 + b.t * 3, rr = r * (0.4 + (k % 3) * 0.3);
                ctx.fillStyle = colors[k % colors.length];
                ctx.fillRect(OX + Math.round(b.x + Math.cos(a) * rr) - 1, OY + Math.round(b.y + Math.sin(a) * rr) - 1, 2, 2);
            }
            if (b.t < 0.08) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(OX + Math.round(b.x) - 2, OY + Math.round(b.y) - 2, 4, 4);
            }
        });

        // power-up
        if (this.power && (this.power.time > 3 || Math.floor(t * 8) % 2) && Math.floor(t * 4) % 4) {
            ctx.drawImage(gfx.powers[this.power.kind], OX + this.power.x, OY + this.power.y);
        }

        if (this.freeze > 0 && Math.floor(t * 2) % 2) {
            A.drawText(ctx, 'FREEZE', OX + FIELD / 2, OY + 4, { color: '#4cc2ff', align: 'center', shadow: '#000' });
        }

        this.renderPanel(ctx);

        if (this.mode === 'curtain') {
            var c = Math.min(1, this.modeTime / 0.4), open = this.modeTime > 1.4 ? Math.min(1, (this.modeTime - 1.4) / 0.5) : 0;
            var hgt = Math.round((H / 2) * c * (1 - open));
            ctx.fillStyle = '#636363';
            ctx.fillRect(0, 0, W, hgt);
            ctx.fillRect(0, H - hgt, W, hgt);
            if (open === 0) {
                A.drawText(ctx, 'STAGE ' + this.stage, W / 2, H / 2 - 8, { scale: 2, color: '#000000', align: 'center' });
                A.drawText(ctx, this.mapName, W / 2, H / 2 + 10, { color: '#1b1b1b', align: 'center' });
            }
        } else if (this.mode === 'over') {
            var y = Math.max(OY + FIELD / 2 - 8, OY + FIELD - this.modeTime * 120);
            A.drawText(ctx, 'GAME', OX + FIELD / 2, y, { scale: 2, color: '#e83030', align: 'center', shadow: '#000' });
            A.drawText(ctx, 'OVER', OX + FIELD / 2, y + 16, { scale: 2, color: '#e83030', align: 'center', shadow: '#000' });
        }
    };

    Tank.prototype.drawSpawn = function (ctx, x, y, left) {
        var f = Math.floor((1 - left) * 12) % 4, r = [2, 4, 6, 4][f];
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(x) - r, Math.round(y), r * 2, 1);
        ctx.fillRect(Math.round(x), Math.round(y) - r, 1, r * 2);
        ctx.fillStyle = '#4cc2ff';
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
        if (r > 3) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(Math.round(x) - r + 2, Math.round(y) - r + 2, 1, 1);
            ctx.fillRect(Math.round(x) + r - 2, Math.round(y) - r + 2, 1, 1);
            ctx.fillRect(Math.round(x) - r + 2, Math.round(y) + r - 2, 1, 1);
            ctx.fillRect(Math.round(x) + r - 2, Math.round(y) + r - 2, 1, 1);
        }
    };

    Tank.prototype.drawShield = function (ctx, x, y) {
        var f = Math.floor(this.t * 16) % 2;
        ctx.fillStyle = f ? '#ffffff' : '#4cc2ff';
        for (var i = 0; i < 16; i += 3) {
            ctx.fillRect(x - 1 + i, y - 1 + (f ? 0 : 17), 2, 1);
            ctx.fillRect(x - 1 + (f ? 17 : 0), y - 1 + i, 1, 2);
            ctx.fillRect(x - 1 + i, y - 1 + (f ? 17 : 0), 1, 1);
            ctx.fillRect(x - 1 + (f ? 0 : 17), y - 1 + i, 1, 1);
        }
    };

    Tank.prototype.renderPanel = function (ctx) {
        var px = OX + FIELD + 8;
        // remaining enemies
        var remaining = this.queue.length;
        for (var i = 0; i < remaining; i++) {
            ctx.drawImage(gfx.smallTank, px + (i % 2) * 8, OY + 8 + Math.floor(i / 2) * 8);
        }
        A.drawText(ctx, 'IP', px, 120, { color: '#000000' });
        ctx.drawImage(gfx.lifeTank, px, 130);
        A.drawText(ctx, String(Math.max(0, this.lives - (this.player.alive ? 1 : 0))), px + 8, 129, { color: '#000000' });
        // stage flag
        ctx.fillStyle = '#000000';
        ctx.fillRect(px + 1, 168, 1, 14);
        ctx.fillStyle = '#e8a020';
        ctx.fillRect(px + 2, 168, 8, 6);
        A.drawText(ctx, String(this.stage), px + 14, 186, { color: '#000000', align: 'right' });
        // star level
        for (var s = 0; s < this.star; s++) {
            ctx.fillStyle = '#ffd335';
            ctx.fillRect(px + s * 5, 146, 3, 3);
        }
    };

    Tank.prototype.renderTally = function (ctx) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, W, H);
        A.drawText(ctx, 'STAGE ' + this.stage + ' CLEAR', W / 2, 20, { scale: 2, color: '#ffffff', align: 'center' });
        A.drawText(ctx, 'HI-SCORE ' + Math.max(this.shell.best, this.shell.score), W / 2, 44, { color: '#e83030', align: 'center' });
        var types = ['basic', 'fast', 'power', 'armor'], total = 0, self = this;
        var shown = Math.min(4, Math.floor(this.modeTime / 0.6));
        types.forEach(function (k, i) {
            var y = 70 + i * 24, n = self.kills[k];
            total += n;
            if (i < shown) {
                A.drawText(ctx, U.pad(n * TYPES[k].pts, 4) + ' PTS', 96, y + 4, { color: '#ffffff', align: 'right' });
                A.drawText(ctx, U.pad(n, 2) + ' <', 132, y + 4, { color: '#ffffff', align: 'right' });
            }
            ctx.drawImage(gfx.tanks[k === 'armor' ? 'armor4' : k][0][0], 140, y);
        });
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(80, 166, 96, 1);
        if (shown >= 4) {
            A.drawText(ctx, 'TOTAL ' + U.pad(total, 2), 132, 172, { color: '#ffffff', align: 'right' });
            A.drawText(ctx, 'SCORE ' + this.shell.score, W / 2, 196, { color: '#ffd335', align: 'center' });
        }
    };

    Tank.prototype.renderTitle = function (ctx) {
        var t = this.t;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, W, H);
        if (!this.titleArt) {
            this.titleArt = buildBrickTitle();
        }
        ctx.drawImage(this.titleArt, Math.floor((W - this.titleArt.width) / 2), 26);
        A.drawText(ctx, 'A TRIBUTE TO THE 1990 CLASSIC', W / 2, 98, { color: '#8d94b3', align: 'center' });

        ctx.drawImage(gfx.tanks.player[Math.floor(t * 8) % 2][1], 66, 120);
        A.drawText(ctx, 'DEFEND THE EAGLE', 90, 125, { color: '#ffffff' });
        var k = Math.floor(t / 1.4) % POWER_KINDS.length;
        ctx.drawImage(gfx.powers[POWER_KINDS[k]], 66, 142);
        A.drawText(ctx, 'HIT FLASHING TANKS', 90, 143, { color: '#ffffff' });
        A.drawText(ctx, 'FOR ' + POWER_KINDS[k].toUpperCase(), 90, 152, { color: '#ffd335' });

        if (Math.floor(t * 2) % 2 === 0) {
            A.drawText(ctx, 'PRESS SPACE OR CLICK', W / 2, 178, { color: '#ffd335', align: 'center' });
        }
        A.drawText(ctx, 'ARROWS/WASD MOVE   SPACE FIRE', W / 2, 198, { color: '#8d94b3', align: 'center' });
    };

    Tank.prototype.renderGameOver = function () {
        return false;
    };

    function buildBrickTitle() {
        var words = ['TANK', 'SIEGE'], scale = 4;
        var w = A.textWidth('SIEGE', scale) + 2, h = 2 * 7 * scale + 8;
        var mask = document.createElement('canvas');
        mask.width = w;
        mask.height = h;
        var g = mask.getContext('2d');
        A.drawText(g, words[0], w / 2, 0, { scale: scale, align: 'center', color: '#ffffff' });
        A.drawText(g, words[1], w / 2, 7 * scale + 8, { scale: scale, align: 'center', color: '#ffffff' });
        // brick texture on its own canvas, then keep it only where the letters are
        var tex = document.createElement('canvas');
        tex.width = w;
        tex.height = h;
        var tg = tex.getContext('2d');
        for (var y = 0; y < h; y += 4) {
            for (var x = 0; x < w; x += 4) {
                tg.fillStyle = '#9c3c0c';
                tg.fillRect(x, y, 4, 4);
                tg.fillStyle = '#d8783c';
                tg.fillRect(x, y, 4, 1);
                tg.fillStyle = '#5a2008';
                tg.fillRect(x, y + 3, 4, 1);
                if (((x / 4) + ((y / 4) % 2)) % 2 === 0) {
                    tg.fillRect(x, y, 1, 4);
                }
            }
        }
        g.globalCompositeOperation = 'source-in';
        g.drawImage(tex, 0, 0);
        return mask;
    }

    // ---------------------------------------------------------------------------------------------
    // Launcher cover
    // ---------------------------------------------------------------------------------------------
    function drawCover(ctx, w, h, t) {
        buildGfx();
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
        var rows = MAPS[1].rows;
        for (var ty = 0; ty < 9; ty++) {
            for (var tx = 0; tx < 13; tx++) {
                var ch = rows[ty + 2][tx], x = 24 + tx * 16, y = ty * 16;
                if (ch === 'B') {
                    ctx.fillStyle = '#9c3c0c';
                    ctx.fillRect(x, y, 16, 16);
                    ctx.fillStyle = '#d8783c';
                    for (var k = 0; k < 16; k += 4) { ctx.fillRect(x, y + k, 16, 1); }
                } else if (ch === '@') {
                    ctx.fillStyle = '#b4b4b4';
                    ctx.fillRect(x, y, 16, 16);
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(x + 2, y + 2, 5, 5);
                } else if (ch === '~') {
                    ctx.fillStyle = '#1f3fbf';
                    ctx.fillRect(x, y, 16, 16);
                } else if (ch === '%') {
                    ctx.fillStyle = '#2f9a2f';
                    ctx.fillRect(x, y, 16, 16);
                }
            }
        }
        var px = 24 + 6 * 16, py = 112 - ((t * 20) % 40);
        ctx.drawImage(gfx.tanks.player[Math.floor(t * 8) % 2][0], px, Math.round(py));
        ctx.drawImage(gfx.tanks.bonus[0][2], 24 + 6 * 16, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + 7, Math.round(py) - 10 - ((t * 120) % 50), 2, 3);
        A.drawText(ctx, 'TANK SIEGE', w / 2, h - 12, { color: '#ffd335', align: 'center', shadow: '#000' });
    }

    A.registerGame({
        id: 'tank',
        title: 'TANK SIEGE',
        description: 'Battle City tribute: defend the eagle from 20 enemy tanks per stage. Destructible bricks, steel, water, forests, ice and classic power-ups.',
        help: '<kbd>&larr;</kbd><kbd>&uarr;</kbd><kbd>&rarr;</kbd><kbd>&darr;</kbd> or <kbd>WASD</kbd> move &middot; <kbd>Space</kbd> fire &middot; <kbd>P</kbd> pause &middot; <kbd>M</kbd> sound',
        width: W,
        height: H,
        keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'KeyJ', 'KeyZ'],
        create: function (shell) { return new Tank(shell); },
        drawCover: drawCover
    });
})();

;
/* ===== DEVArcadeGalaxy.js ===== */
/*!
 * DEVArcadeGalaxy.js - "Galaxy Strike", a Galaga style space shooter for DEV Arcade.
 */
(function () {
    'use strict';

    var A = window.DEVArcade, U = A.util;

    var W = 224, H = 288, PLAYER_Y = H - 30;

    // ---------------------------------------------------------------------------------------------
    // Sprites (pixel maps, enemies face down)
    // ---------------------------------------------------------------------------------------------
    var MAPS = {
        ship: [
            '.......w.......',
            '.......w.......',
            '......www......',
            '......wcw......',
            '...r..wcw..r...',
            '...r.wwwww.r...',
            '...wwwwbwwww...',
            'r..wwrwbwrww..r',
            'r.wwwrwwwrwww.r',
            'wwwwrrwwwrrwwww',
            'ww.rrr.w.rrr.ww',
            'w..rr..w..rr..w',
            'w......w......w'
        ],
        beeA: [
            'b.........b',
            'bb..yyy..bb',
            '.bbyyyyybb.',
            '..byyryyb..',
            '...yyyyy...',
            '..yyryryy..',
            '...yyyyy...',
            '....yry....',
            '.....r.....'
        ],
        beeB: [
            '...........',
            '....yyy....',
            '...yyyyy...',
            'bbbyyryybbb',
            'bb.yyyyy.bb',
            'b.yyryryy.b',
            '...yyyyy...',
            '....yry....',
            '.....r.....'
        ],
        flyA: [
            'r.........r',
            'rr..www..rr',
            'rrr.wbw.rrr',
            'rrrrwwwrrrr',
            '.rrwwbwwrr.',
            '..rrwwwrr..',
            '...wwbww...',
            '....w.w....'
        ],
        flyB: [
            '...........',
            '....www....',
            '..r.wbw.r..',
            '.rrrwwwrrr.',
            'rrrwwbwwrrr',
            'rr.rwwwr.rr',
            'r..wwbww..r',
            '....w.w....'
        ],
        bossA: [
            '......ooo......',
            '.....ggggg.....',
            '....ggwgwgg....',
            '...ggggggggg...',
            'g..ggggggggg..g',
            'gg.gyyyyyyyg.gg',
            'ggggyyyyyyygggg',
            'gg.ggggggggg.gg',
            'g...ggg.ggg...g',
            'g....g...g....g'
        ],
        bossB: [
            '......ooo......',
            '.....ggggg.....',
            '....ggwgwgg....',
            '...ggggggggg...',
            '...ggggggggg...',
            '.g.gyyyyyyyg.g.',
            'ggggyyyyyyygggg',
            'gg.ggggggggg.gg',
            'gg..ggg.ggg..gg',
            '.g...g...g...g.'
        ]
    };

    var PAL = {
        ship: { w: '#f2f2f2', r: '#e8322b', b: '#3a6bff', c: '#4cc2ff' },
        bee: { y: '#ffd335', b: '#3a6bff', r: '#e8322b' },
        fly: { r: '#e8322b', w: '#f2f2f2', b: '#3a6bff' },
        boss: { g: '#2fd34a', o: '#ff9a2e', w: '#ffffff', y: '#ffe23a' },
        bossHurt: { g: '#a24bff', o: '#ff4fd8', w: '#ffffff', y: '#ffe23a' }
    };

    var ENEMY = {
        bee: { a: 'beeA', b: 'beeB', pal: 'bee', ptsForm: 50, ptsDive: 100, hp: 1, w: 11, h: 9, colors: ['#ffd335', '#3a6bff', '#ffffff'] },
        fly: { a: 'flyA', b: 'flyB', pal: 'fly', ptsForm: 80, ptsDive: 160, hp: 1, w: 11, h: 8, colors: ['#e8322b', '#f2f2f2', '#3a6bff'] },
        boss: { a: 'bossA', b: 'bossB', pal: 'boss', ptsForm: 150, ptsDive: 400, hp: 2, w: 15, h: 10, colors: ['#2fd34a', '#a24bff', '#ffe23a'] }
    };

    var POWERS = {
        T: { color: '#4cc2ff', name: 'TWIN SHIP' },
        R: { color: '#ffd335', name: 'RAPID FIRE' },
        S: { color: '#7cff6b', name: 'SHIELD' }
    };

    var gfx = null;

    function buildGfx() {
        if (gfx) {
            return gfx;
        }
        gfx = {};
        gfx.ship = A.sprite(MAPS.ship, PAL.ship);
        gfx.shipSmall = A.sprite(MAPS.ship, PAL.ship);
        ['bee', 'fly', 'boss'].forEach(function (k) {
            var e = ENEMY[k];
            gfx[k] = [A.sprite(MAPS[e.a], PAL[e.pal]), A.sprite(MAPS[e.b], PAL[e.pal])];
            gfx[k + 'Flash'] = [A.tintSprite(gfx[k][0], '#ffffff'), A.tintSprite(gfx[k][1], '#ffffff')];
        });
        gfx.bossHurt = [A.sprite(MAPS.bossA, PAL.bossHurt), A.sprite(MAPS.bossB, PAL.bossHurt)];
        Object.keys(POWERS).forEach(function (k) {
            var c = document.createElement('canvas');
            c.width = 11;
            c.height = 11;
            var g = c.getContext('2d');
            g.fillStyle = POWERS[k].color;
            g.fillRect(2, 0, 7, 11);
            g.fillRect(0, 2, 11, 7);
            g.fillRect(1, 1, 9, 9);
            g.fillStyle = '#0b0e1a';
            g.fillRect(2, 2, 7, 7);
            A.drawText(g, k, 3, 2, { color: POWERS[k].color });
            gfx['cap' + k] = c;
        });
        return gfx;
    }

    // ---------------------------------------------------------------------------------------------
    // Paths (Catmull-Rom through points, sampled by arc length)
    // ---------------------------------------------------------------------------------------------
    function buildPath(points, mirror) {
        var pts = points.map(function (p) { return mirror ? [W - p[0], p[1]] : p; });
        var samples = [], i, t;
        for (i = 0; i < pts.length - 1; i++) {
            var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
            for (t = 0; t < 1; t += 0.05) {
                var t2 = t * t, t3 = t2 * t;
                samples.push([
                    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
                ]);
            }
        }
        samples.push(pts[pts.length - 1]);
        var lens = [0];
        for (i = 1; i < samples.length; i++) {
            lens.push(lens[i - 1] + Math.hypot(samples[i][0] - samples[i - 1][0], samples[i][1] - samples[i - 1][1]));
        }
        return {
            length: lens[lens.length - 1],
            at: function (d) {
                if (d <= 0) {
                    return { x: samples[0][0], y: samples[0][1] };
                }
                var lo = 0, hi = lens.length - 1;
                while (hi - lo > 1) {
                    var mid = (lo + hi) >> 1;
                    if (lens[mid] < d) { lo = mid; } else { hi = mid; }
                }
                var seg = lens[hi] - lens[lo] || 1, f = Math.min(1, (d - lens[lo]) / seg);
                return { x: samples[lo][0] + (samples[hi][0] - samples[lo][0]) * f, y: samples[lo][1] + (samples[hi][1] - samples[lo][1]) * f };
            }
        };
    }

    var PATH_DEFS = {
        top: [[96, -16], [96, 40], [88, 110], [60, 160], [36, 190], [40, 225], [70, 240], [100, 220], [104, 180], [84, 150]],
        side: [[-16, 250], [30, 236], [80, 210], [120, 170], [136, 130], [120, 100], [90, 100], [76, 124], [92, 150], [118, 140]],
        chalA: [[-16, 60], [60, 80], [112, 140], [164, 200], [200, 170], [180, 120], [112, 110], [44, 150], [30, 220], [60, 300]],
        chalB: [[112, -16], [112, 100], [150, 160], [190, 140], [170, 90], [112, 80], [54, 90], [34, 140], [74, 160], [112, 100], [112, -30]],
        chalC: [[-16, 180], [50, 160], [100, 110], [112, 60], [130, 110], [180, 160], [240, 150]]
    };
    var PATHS = {};
    Object.keys(PATH_DEFS).forEach(function (k) {
        PATHS[k + 'L'] = buildPath(PATH_DEFS[k], false);
        PATHS[k + 'R'] = buildPath(PATH_DEFS[k], true);
    });

    // formation stage waves: [delay, path, kinds...]; kinds are assigned to slots by row
    var WAVES = [
        { at: 0.0, groups: [{ path: 'topL', kinds: ['bee', 'bee', 'bee', 'bee'] }, { path: 'topR', kinds: ['fly', 'fly', 'fly', 'fly'] }] },
        { at: 3.2, groups: [{ path: 'sideL', kinds: ['boss', 'fly', 'boss', 'fly', 'boss', 'fly', 'boss', 'fly'] }] },
        { at: 6.2, groups: [{ path: 'sideR', kinds: ['fly', 'fly', 'fly', 'fly', 'fly', 'fly', 'fly', 'fly'] }] },
        { at: 9.0, groups: [{ path: 'topR', kinds: ['bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee'] }] },
        { at: 11.8, groups: [{ path: 'topL', kinds: ['bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee'] }] }
    ];
    var CHALLENGE_WAVES = [
        { at: 0.0, groups: [{ path: 'chalAL', kinds: ['bee', 'bee', 'bee', 'bee'] }, { path: 'chalAR', kinds: ['bee', 'bee', 'bee', 'bee'] }] },
        { at: 3.4, groups: [{ path: 'chalBL', kinds: ['fly', 'fly', 'fly', 'fly', 'fly', 'fly', 'fly', 'fly'] }] },
        { at: 6.8, groups: [{ path: 'chalCL', kinds: ['boss', 'boss', 'boss', 'boss'] }, { path: 'chalCR', kinds: ['boss', 'boss', 'boss', 'boss'] }] },
        { at: 10.2, groups: [{ path: 'chalBR', kinds: ['fly', 'bee', 'fly', 'bee', 'fly', 'bee', 'fly', 'bee'] }] },
        { at: 13.6, groups: [{ path: 'chalAR', kinds: ['bee', 'fly', 'bee', 'fly'] }, { path: 'chalAL', kinds: ['fly', 'bee', 'fly', 'bee'] }] }
    ];

    // formation slots: row 0 = bosses (4), rows 1-2 = butterflies (8), rows 3-4 = bees (10)
    var ROWS = [{ kind: 'boss', n: 4 }, { kind: 'fly', n: 8 }, { kind: 'fly', n: 8 }, { kind: 'bee', n: 10 }, { kind: 'bee', n: 10 }];

    // ---------------------------------------------------------------------------------------------
    // Game
    // ---------------------------------------------------------------------------------------------
    function Galaxy(shell) {
        this.shell = shell;
        this.t = 0;
        buildGfx();
        shell.setBackground('DEVArcadeNebulaPurple.png', { scroll: 10 });
        this.stars = [];
        var colors = ['#ffffff', '#ff6b6b', '#ffd335', '#4cc2ff', '#7cff6b', '#ff4fd8'];
        for (var i = 0; i < 70; i++) {
            this.stars.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() < 0.5 ? 18 : 34, c: U.pick(colors), p: Math.random() * 6 });
        }
        this.enemies = [];
        this.newGame();
    }

    Galaxy.prototype.newGame = function () {
        this.stage = 0;
        this.lives = 3;
        this.nextLife = 20000;
        this.player = { x: W / 2, alive: true, dead: 0, inv: 0, twin: false, rapid: 0, shield: 0, cool: 0 };
        this.startStage(1);
    };

    Galaxy.prototype.startStage = function (n) {
        this.stage = n;
        this.challenge = n % 4 === 3;
        this.enemies = [];
        this.bullets = [];
        this.ebullets = [];
        this.capsules = [];
        this.booms = [];
        this.mode = 'intro';
        this.modeTime = 0;
        this.waveTime = 0;
        this.spawnQueue = [];
        this.formationTime = 0;
        this.diveTimer = 2.5;
        this.challengeHits = 0;
        this.challengeTotal = 0;
        this.slotsUsed = {};
        var self = this;
        (this.challenge ? CHALLENGE_WAVES : WAVES).forEach(function (wave) {
            wave.groups.forEach(function (g, gi) {
                g.kinds.forEach(function (kind, k) {
                    self.spawnQueue.push({ time: wave.at + k * 0.16 + gi * 0.08, path: g.path, kind: kind });
                    self.challengeTotal++;
                });
            });
        });
        this.spawnQueue.sort(function (a, b) { return a.time - b.time; });
    };

    Galaxy.prototype.difficulty = function () {
        var s = this.stage;
        return {
            diveEvery: Math.max(0.55, 2.3 - s * 0.17),
            maxDivers: Math.min(2 + Math.floor(s / 2), 7),
            diveSpeed: Math.min(165, 92 + s * 7),
            shotRate: Math.min(1.6, 0.45 + s * 0.12),
            bulletSpeed: Math.min(185, 120 + s * 6)
        };
    };

    Galaxy.prototype.takeSlot = function (kind) {
        // fill rows of the kind from the center outwards
        for (var r = 0; r < ROWS.length; r++) {
            if (ROWS[r].kind !== kind) {
                continue;
            }
            var n = ROWS[r].n, order = [];
            for (var i = 0; i < n; i++) {
                order.push(i);
            }
            order.sort(function (a, b) { return Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2); });
            for (var k = 0; k < order.length; k++) {
                var key = r + ':' + order[k];
                if (!this.slotsUsed[key]) {
                    this.slotsUsed[key] = true;
                    return { row: r, col: order[k] - (n - 1) / 2 };
                }
            }
        }
        return { row: 4, col: 0 };
    };

    Galaxy.prototype.slotPos = function (slot) {
        var spread = 1, sway = 0;
        if (this.spawnQueue.length || this.enemies.some(function (e) { return e.state === 'entry'; })) {
            sway = Math.sin(this.formationTime * 0.9) * 12;
        } else {
            spread = 1 + 0.13 * (Math.sin(this.formationTime * 1.7) + 1) / 2;
        }
        return { x: W / 2 + sway + slot.col * 16 * spread, y: 34 + slot.row * 15 * spread };
    };

    Galaxy.prototype.spawn = function (item) {
        var e = {
            kind: item.kind, hp: ENEMY[item.kind].hp, path: PATHS[item.path], dist: 0,
            speed: this.challenge ? 120 : 112, state: 'entry', x: -50, y: -50, vx: 0, vy: 1, flash: 0,
            challenge: this.challenge, slot: this.challenge ? null : this.takeSlot(item.kind)
        };
        var p = e.path.at(0);
        e.x = p.x;
        e.y = p.y;
        this.enemies.push(e);
    };

    // ---- input ------------------------------------------------------------------------------------

    Galaxy.prototype.onPointer = function (type, x) {
        if (type === 'move' || type === 'down') {
            this.pointerX = x;
        }
        if (type === 'down' && this.shell.state === 'playing') {
            this.mouseFire = true;
            return true;
        }
        if (type === 'up') {
            this.mouseFire = false;
        }
        return false;
    };

    // ---- update -----------------------------------------------------------------------------------

    Galaxy.prototype.update = function (dt) {
        this.t += dt;
        this.modeTime += dt;
        this.formationTime += dt;
        this.updateStars(dt);
        this.updateBooms(dt);
        this.updatePlayer(dt);
        this.updateBullets(dt);

        if (this.mode === 'intro') {
            if (this.modeTime > 2.2) {
                this.mode = 'battle';
                this.modeTime = 0;
                this.waveTime = 0;
            }
            return;
        }
        if (this.mode === 'battle') {
            this.waveTime += dt;
            while (this.spawnQueue.length && this.spawnQueue[0].time <= this.waveTime) {
                this.spawn(this.spawnQueue.shift());
            }
            this.updateEnemies(dt);
            this.updateDives(dt);
            this.collide();
            if (!this.spawnQueue.length && !this.enemies.length) {
                this.mode = this.challenge ? 'result' : 'cleared';
                this.modeTime = 0;
                if (this.challenge) {
                    var bonus = this.challengeHits === this.challengeTotal ? 10000 : this.challengeHits * 100;
                    this.challengeBonus = bonus;
                    this.shell.addScore(bonus);
                    this.shell.sound.play(this.challengeHits === this.challengeTotal ? 'win' : 'coin');
                }
            }
        } else if (this.mode === 'cleared' || this.mode === 'result') {
            if (this.modeTime > (this.mode === 'result' ? 3.2 : 1.6)) {
                this.startStage(this.stage + 1);
            }
        }
        this.updateCapsules(dt);
        this.checkExtraLife();
    };

    Galaxy.prototype.idle = function (dt) {
        this.t += dt;
        this.formationTime += dt;
        if (this.shell.state !== 'paused') {
            this.updateStars(dt);
            this.updateBooms(dt);
        }
    };

    Galaxy.prototype.updateStars = function (dt) {
        for (var i = 0; i < this.stars.length; i++) {
            var s = this.stars[i];
            s.y += s.s * dt;
            if (s.y > H) {
                s.y -= H;
                s.x = Math.random() * W;
            }
        }
    };

    Galaxy.prototype.updatePlayer = function (dt) {
        var p = this.player, shell = this.shell;
        if (!p.alive) {
            p.dead += dt;
            var diving = this.enemies.some(function (e) { return e.state === 'dive'; });
            if (p.dead > 2.4 && !diving && this.mode !== 'result') {
                if (this.lives <= 0) {
                    shell.gameOver({ reason: 'gameover', stage: this.stage });
                    return;
                }
                p.alive = true;
                p.inv = 2;
                p.x = W / 2;
                p.twin = false;
            }
            return;
        }
        if (p.inv > 0) { p.inv -= dt; }
        if (p.rapid > 0) { p.rapid -= dt; }
        if (p.shield > 0) { p.shield -= dt; }
        if (p.cool > 0) { p.cool -= dt; }

        var ax = shell.axisX();
        var maxX = W - (p.twin ? 23 : 8);
        if (ax) {
            this.pointerX = undefined;
            p.x += ax * 112 * dt;
        } else if (this.pointerX !== undefined) {
            p.x += U.clamp(this.pointerX - (p.twin ? 7 : 0) - p.x, -150 * dt, 150 * dt);
        }
        p.x = U.clamp(p.x, 8, maxX);

        var wantFire = shell.isDown('Space', 'KeyZ', 'KeyJ', 'ArrowUp') || this.mouseFire;
        var maxShots = (p.twin ? 4 : 2) + (p.rapid > 0 ? 2 : 0);
        if (wantFire && p.cool <= 0 && this.bullets.length + (p.twin ? 1 : 0) < maxShots && this.mode !== 'intro') {
            this.bullets.push({ x: p.x, y: PLAYER_Y - 6 });
            if (p.twin) {
                this.bullets.push({ x: p.x + 15, y: PLAYER_Y - 6 });
            }
            p.cool = p.rapid > 0 ? 0.1 : 0.2;
            shell.sound.play('shoot');
        }
    };

    Galaxy.prototype.updateBullets = function (dt) {
        var i;
        for (i = this.bullets.length - 1; i >= 0; i--) {
            this.bullets[i].y -= 300 * dt;
            if (this.bullets[i].y < -8) {
                this.bullets.splice(i, 1);
                if (this.challenge === false) { /* missed shot */ }
            }
        }
        for (i = this.ebullets.length - 1; i >= 0; i--) {
            var b = this.ebullets[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (b.y > H + 6 || b.x < -6 || b.x > W + 6) {
                this.ebullets.splice(i, 1);
            }
        }
    };

    Galaxy.prototype.updateEnemies = function (dt) {
        var self = this;
        for (var i = self.enemies.length - 1; i >= 0; i--) {
            var e = self.enemies[i], ox = e.x, oy = e.y;
            if (e.flash > 0) { e.flash -= dt; }

            if (e.state === 'entry') {
                e.dist += e.speed * dt;
                var p = e.path.at(e.dist);
                e.x = p.x;
                e.y = p.y;
                if (e.dist >= e.path.length) {
                    if (e.challenge) {
                        self.enemies.splice(i, 1);   // challenging stage: enemies fly away
                        continue;
                    }
                    e.state = 'home';
                }
            } else if (e.state === 'home') {
                var target = self.slotPos(e.slot);
                var dx = target.x - e.x, dy = target.y - e.y, d = Math.hypot(dx, dy);
                var step = 125 * dt;
                if (d <= step) {
                    e.x = target.x;
                    e.y = target.y;
                    e.state = 'formation';
                } else {
                    e.x += dx / d * step;
                    e.y += dy / d * step;
                }
            } else if (e.state === 'formation') {
                var sp = self.slotPos(e.slot);
                e.x = sp.x;
                e.y = sp.y;
            } else if (e.state === 'dive') {
                self.updateDiver(e, dt);
            }

            if (e.state !== 'formation') {
                var vx = e.x - ox, vy = e.y - oy;
                if (vx * vx + vy * vy > 0.0001) {
                    e.vx = vx;
                    e.vy = vy;
                }
            } else {
                e.vx = 0;
                e.vy = 1;
            }
        }
    };

    Galaxy.prototype.updateDives = function (dt) {
        var self = this, d = self.difficulty();
        if (self.challenge || !self.player.alive || self.spawnQueue.length) {
            return;
        }
        var inFormation = self.enemies.filter(function (e) { return e.state === 'formation'; });
        if (!inFormation.length || inFormation.length !== self.enemies.length - self.enemies.filter(function (e) { return e.state === 'dive' || e.state === 'home'; }).length) {
            // still entering
        }
        self.diveTimer -= dt;
        var divers = self.enemies.filter(function (e) { return e.state === 'dive'; }).length;
        if (self.diveTimer > 0 || divers >= d.maxDivers || !inFormation.length) {
            return;
        }
        self.diveTimer = d.diveEvery * U.rand(0.7, 1.3);
        // fewer enemies left -> everybody attacks
        var leader;
        var bosses = inFormation.filter(function (e) { return e.kind === 'boss'; });
        if (bosses.length && Math.random() < 0.3) {
            leader = U.pick(bosses);
            self.startDive(leader, d);
            var escorts = inFormation.filter(function (e) { return e.kind === 'fly' && e.slot.row === 1 && Math.abs(e.slot.col - leader.slot.col * 2) <= 2.5; });
            escorts.slice(0, 2).forEach(function (es, k) {
                self.startDive(es, d);
                es.leader = leader;
                es.offX = k === 0 ? -14 : 14;
                es.offY = 6;
            });
            leader.escorts = Math.min(2, escorts.length);
            leader.escortKills = 0;
        } else {
            var pool = inFormation.filter(function (e) { return e.kind !== 'boss'; });
            if (!pool.length) {
                pool = inFormation;
            }
            // prefer the outer columns like the arcade
            pool.sort(function (a, b) { return Math.abs(b.slot.col) - Math.abs(a.slot.col); });
            leader = pool[Math.floor(Math.random() * Math.min(pool.length, 6))];
            self.startDive(leader, d);
        }
        if (self.enemies.length <= 6) {
            self.diveTimer *= 0.5;
        }
    };

    Galaxy.prototype.startDive = function (e, d) {
        e.state = 'dive';
        e.phase = 'turn';
        e.phaseTime = 0;
        e.turnDir = e.x < W / 2 ? -1 : 1;
        e.dvx = 0;
        e.dvy = -d.diveSpeed;
        e.speedNow = d.diveSpeed;
        e.shots = 0;
        e.leader = null;
        e.wiggle = Math.random() * 6;
        this.shell.sound.play('beam');
    };

    Galaxy.prototype.updateDiver = function (e, dt) {
        var d = this.difficulty(), p = this.player;
        e.phaseTime += dt;
        if (e.leader && this.enemies.indexOf(e.leader) >= 0 && e.leader.state === 'dive') {
            e.x = e.leader.x + e.offX;
            e.y = e.leader.y + e.offY;
        } else {
            e.leader = null;
            var vx = e.dvx, vy = e.dvy, sp = e.speedNow;
            if (e.phase === 'turn') {
                var ang = Math.atan2(vy, vx) + e.turnDir * Math.PI * dt / 0.6;
                vx = Math.cos(ang) * sp;
                vy = Math.sin(ang) * sp;
                if (e.phaseTime >= 0.6) {
                    e.phase = 'attack';
                }
            } else {
                var tx = (p.alive ? p.x : W / 2) + (e.kind === 'fly' ? Math.sin(this.t * 3 + e.wiggle) * 46 : 0);
                var ty = H + 40;
                var want = Math.atan2(ty - e.y, tx - e.x), cur = Math.atan2(vy, vx);
                var diff = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
                cur += U.clamp(diff, -2.4 * dt, 2.4 * dt);
                vx = Math.cos(cur) * sp;
                vy = Math.sin(cur) * sp;
                if (e.y > 60 && e.y < PLAYER_Y - 50 && e.shots < (e.kind === 'boss' ? 3 : 2) && Math.random() < d.shotRate * dt && p.alive) {
                    this.enemyFire(e, d);
                }
            }
            e.dvx = vx;
            e.dvy = vy;
            e.x += vx * dt;
            e.y += vy * dt;
        }
        if (e.y > H + 14) {
            var slot = this.slotPos(e.slot);
            e.x = slot.x;
            e.y = -16;
            e.state = 'home';
            e.leader = null;
        }
    };

    Galaxy.prototype.enemyFire = function (e, d) {
        var p = this.player;
        var ang = Math.atan2(PLAYER_Y - e.y, p.x - e.x);
        ang = U.clamp(ang, Math.PI * 0.28, Math.PI * 0.72);
        this.ebullets.push({ x: e.x, y: e.y + 5, vx: Math.cos(ang) * d.bulletSpeed, vy: Math.sin(ang) * d.bulletSpeed });
        e.shots++;
        this.shell.sound.play('enemyShoot');
    };

    Galaxy.prototype.collide = function () {
        var self = this, p = self.player, i, j;
        // player bullets vs enemies
        for (i = self.bullets.length - 1; i >= 0; i--) {
            var b = self.bullets[i];
            for (j = self.enemies.length - 1; j >= 0; j--) {
                var e = self.enemies[j], def = ENEMY[e.kind];
                if (Math.abs(b.x - e.x) <= def.w / 2 && Math.abs(b.y - e.y) <= def.h / 2 + 3) {
                    self.bullets.splice(i, 1);
                    self.hitEnemy(j);
                    break;
                }
            }
        }
        if (!p.alive || p.inv > 0) {
            return;
        }
        var ships = [p.x];
        if (p.twin) {
            ships.push(p.x + 15);
        }
        // enemy bullets vs player
        for (i = self.ebullets.length - 1; i >= 0; i--) {
            var eb = self.ebullets[i];
            for (var s = 0; s < ships.length; s++) {
                if (Math.abs(eb.x - ships[s]) <= 4 && eb.y >= PLAYER_Y - 4 && eb.y <= PLAYER_Y + 9) {
                    self.ebullets.splice(i, 1);
                    self.playerHit(s);
                    return;
                }
            }
        }
        // divers vs player
        for (j = self.enemies.length - 1; j >= 0; j--) {
            var en = self.enemies[j];
            if (en.state !== 'dive' && en.state !== 'home') {
                continue;
            }
            for (s = 0; s < ships.length; s++) {
                if (Math.abs(en.x - ships[s]) <= 9 && Math.abs(en.y - (PLAYER_Y + 3)) <= 9) {
                    self.killEnemy(j, true);
                    self.playerHit(s);
                    return;
                }
            }
        }
    };

    Galaxy.prototype.hitEnemy = function (j) {
        var e = this.enemies[j];
        e.hp--;
        if (e.hp > 0) {
            e.flash = 0.12;
            this.shell.sound.play('hit');
            return;
        }
        this.killEnemy(j, false);
    };

    Galaxy.prototype.killEnemy = function (j, crash) {
        var e = this.enemies[j], def = ENEMY[e.kind], shell = this.shell;
        this.enemies.splice(j, 1);
        var diving = e.state === 'dive' || e.state === 'entry' || e.state === 'home';
        var pts = e.challenge ? 100 : (diving ? def.ptsDive : def.ptsForm);
        if (e.kind === 'boss' && e.state === 'dive' && e.escorts) {
            pts = [400, 800, 1600][Math.min(2, e.escortKills || 0)];
        }
        if (e.leader && e.leader.state === 'dive') {
            e.leader.escortKills = (e.leader.escortKills || 0) + 1;
        }
        shell.addScore(pts);
        if (e.challenge) {
            this.challengeHits++;
        }
        if (diving && pts >= 100) {
            shell.fx.text(String(pts), e.x, e.y - 8, pts >= 800 ? '#ffd335' : '#4cc2ff');
        }
        this.booms.push({ x: e.x, y: e.y, t: 0, big: e.kind === 'boss', colors: def.colors });
        shell.fx.burst(e.x, e.y, { count: e.kind === 'boss' ? 22 : 12, colors: def.colors, speed: 70, life: 0.6 });
        shell.sound.play(e.kind === 'boss' ? 'bigExplode' : 'explode');
        if (!crash && !e.challenge && e.state === 'dive') {
            var chance = e.kind === 'boss' ? 0.35 : 0.07;
            if (Math.random() < chance) {
                var kinds = this.player.twin ? ['R', 'S'] : ['T', 'R', 'S'];
                this.capsules.push({ x: e.x, y: e.y, k: U.pick(kinds) });
            }
        }
    };

    Galaxy.prototype.playerHit = function (shipIndex) {
        var p = this.player, shell = this.shell;
        if (p.shield > 0) {
            p.shield = 0;
            p.inv = 1;
            shell.sound.play('metal');
            shell.fx.burst(p.x, PLAYER_Y, { count: 16, colors: ['#7cff6b', '#ffffff'], speed: 60, life: 0.5 });
            return;
        }
        if (p.twin) {
            var x = shipIndex === 0 ? p.x : p.x + 15;
            p.twin = false;
            if (shipIndex === 0) {
                p.x += 15;
            }
            p.inv = 1;
            this.booms.push({ x: x, y: PLAYER_Y + 3, t: 0, big: true, colors: ['#ffffff', '#e8322b', '#ffd335'] });
            shell.sound.play('bigExplode');
            return;
        }
        p.alive = false;
        p.dead = 0;
        p.rapid = 0;
        this.lives--;
        this.booms.push({ x: p.x, y: PLAYER_Y + 3, t: 0, big: true, colors: ['#ffffff', '#e8322b', '#ffd335'] });
        shell.fx.burst(p.x, PLAYER_Y + 3, { count: 40, colors: ['#ffffff', '#e8322b', '#ffd335', '#4cc2ff'], speed: 100, life: 1.1 });
        shell.sound.play('bigExplode');
        shell.shake(4, 0.5);
        this.ebullets = [];
    };

    Galaxy.prototype.updateCapsules = function (dt) {
        var p = this.player;
        for (var i = this.capsules.length - 1; i >= 0; i--) {
            var c = this.capsules[i];
            c.y += 50 * dt;
            if (c.y > H + 10) {
                this.capsules.splice(i, 1);
                continue;
            }
            if (p.alive && Math.abs(c.x - (p.x + (p.twin ? 7 : 0))) < 11 && Math.abs(c.y - (PLAYER_Y + 3)) < 10) {
                this.capsules.splice(i, 1);
                if (c.k === 'T') { p.twin = true; p.x = Math.min(p.x, W - 23); }
                if (c.k === 'R') { p.rapid = 15; }
                if (c.k === 'S') { p.shield = 12; }
                this.shell.addScore(300);
                this.shell.sound.play('powerup');
                this.shell.fx.text(POWERS[c.k].name, p.x, PLAYER_Y - 16, POWERS[c.k].color);
            }
        }
    };

    Galaxy.prototype.updateBooms = function (dt) {
        for (var i = this.booms.length - 1; i >= 0; i--) {
            this.booms[i].t += dt;
            if (this.booms[i].t > 0.5) {
                this.booms.splice(i, 1);
            }
        }
    };

    Galaxy.prototype.checkExtraLife = function () {
        if (this.shell.score >= this.nextLife) {
            this.nextLife = this.nextLife < 70000 ? 70000 : this.nextLife + 70000;
            this.lives++;
            this.shell.sound.play('coin');
            this.shell.fx.text('EXTRA SHIP!', W / 2, H / 2, '#7cff6b');
        }
    };

    // ---- render -----------------------------------------------------------------------------------

    Galaxy.prototype.drawEnemy = function (ctx, e, frame) {
        var g = gfx[e.kind][frame];
        if (e.kind === 'boss' && e.hp === 1) {
            g = gfx.bossHurt[frame];
        }
        if (e.flash > 0) {
            g = gfx[e.kind + 'Flash'][frame];
        }
        var ang = e.state === 'formation' ? 0 : Math.atan2(e.vy, e.vx) - Math.PI / 2;
        if (Math.abs(ang) < 0.05) {
            ctx.drawImage(g, Math.round(e.x - g.width / 2), Math.round(e.y - g.height / 2));
            return;
        }
        ctx.save();
        ctx.translate(Math.round(e.x), Math.round(e.y));
        ctx.rotate(Math.round(ang / (Math.PI / 8)) * (Math.PI / 8));   // 16 directions like the arcade
        ctx.drawImage(g, -Math.floor(g.width / 2), -Math.floor(g.height / 2));
        ctx.restore();
    };

    Galaxy.prototype.render = function (ctx, state) {
        var self = this, t = this.t, i;
        // starfield
        for (i = 0; i < this.stars.length; i++) {
            var s = this.stars[i];
            if (Math.sin(t * 3 + s.p) > -0.3) {
                ctx.fillStyle = s.c;
                ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
            }
        }

        if (state === 'title') {
            return;
        }

        var frame = Math.floor(this.formationTime * 2.2) % 2;
        this.enemies.forEach(function (e) { self.drawEnemy(ctx, e, frame); });

        // explosions
        this.booms.forEach(function (b) {
            var r = 2 + b.t * (b.big ? 44 : 30), n = b.big ? 14 : 10;
            for (var k = 0; k < n; k++) {
                var a = k / n * Math.PI * 2 + b.t * 2;
                ctx.fillStyle = b.colors[k % b.colors.length];
                var sz = b.t < 0.25 ? 2 : 1;
                ctx.fillRect(Math.round(b.x + Math.cos(a) * r), Math.round(b.y + Math.sin(a) * r), sz, sz);
            }
            if (b.t < 0.12) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(Math.round(b.x) - 3, Math.round(b.y) - 3, 7, 7);
            }
        });

        // bullets
        ctx.fillStyle = '#fff27a';
        this.bullets.forEach(function (b) {
            ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y), 2, 6);
        });
        ctx.fillStyle = '#ff5a5a';
        this.ebullets.forEach(function (b) {
            ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 2, 2, 5);
        });
        ctx.fillStyle = '#ffffff';
        this.ebullets.forEach(function (b) {
            ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) + 2, 2, 1);
        });

        // capsules
        this.capsules.forEach(function (c) {
            if (Math.floor(t * 8) % 4) {
                ctx.drawImage(gfx['cap' + c.k], Math.round(c.x) - 5, Math.round(c.y) - 5);
            }
        });

        // player
        var p = this.player;
        if (p.alive && (p.inv <= 0 || Math.floor(t * 12) % 2 === 0)) {
            ctx.drawImage(gfx.ship, Math.round(p.x) - 7, PLAYER_Y - 4);
            if (p.twin) {
                ctx.drawImage(gfx.ship, Math.round(p.x) + 8, PLAYER_Y - 4);
            }
            if (p.shield > 0 && (p.shield > 2 || Math.floor(t * 8) % 2)) {
                ctx.strokeStyle = 'rgba(124,255,107,0.8)';
                ctx.beginPath();
                ctx.arc(Math.round(p.x + (p.twin ? 7.5 : 0)) + 0.5, PLAYER_Y + 2.5, p.twin ? 17 : 11, 0, Math.PI * 2);
                ctx.stroke();
            }
            // engine flame
            ctx.fillStyle = Math.floor(t * 20) % 2 ? '#ff9a2e' : '#ffd335';
            ctx.fillRect(Math.round(p.x) - 1, PLAYER_Y + 9, 2, 2);
            if (p.twin) {
                ctx.fillRect(Math.round(p.x) + 14, PLAYER_Y + 9, 2, 2);
            }
        }

        this.renderHud(ctx);

        if (this.mode === 'intro') {
            A.drawText(ctx, this.challenge ? 'CHALLENGING STAGE' : 'STAGE ' + this.stage, W / 2, 130, { scale: this.challenge ? 1 : 2, color: '#4cc2ff', align: 'center', shadow: '#000' });
            if (this.modeTime > 1) {
                A.drawText(ctx, 'READY', W / 2, 152, { color: '#ff5a5a', align: 'center', shadow: '#000' });
            }
        } else if (this.mode === 'result') {
            A.drawText(ctx, 'NUMBER OF HITS  ' + this.challengeHits, W / 2, 120, { color: '#4cc2ff', align: 'center', shadow: '#000' });
            if (this.modeTime > 1) {
                var perfect = this.challengeHits === this.challengeTotal;
                A.drawText(ctx, perfect ? 'PERFECT !' : 'BONUS  ' + this.challengeBonus, W / 2, 140, { scale: perfect ? 2 : 1, color: '#ffd335', align: 'center', shadow: '#000' });
                if (perfect) {
                    A.drawText(ctx, 'SPECIAL BONUS 10000', W / 2, 164, { color: '#ffd335', align: 'center', shadow: '#000' });
                }
            }
        } else if (!p.alive && this.lives > 0 && p.dead > 1) {
            A.drawText(ctx, 'READY', W / 2, 150, { color: '#ff5a5a', align: 'center', shadow: '#000' });
        }
    };

    Galaxy.prototype.renderHud = function (ctx) {
        A.drawText(ctx, '1UP', 8, 3, { color: '#ff5a5a' });
        A.drawText(ctx, String(this.shell.score), 50, 3, { color: '#ffffff', align: 'right' });
        A.drawText(ctx, 'HIGH SCORE', W / 2 + 14, 3, { color: '#ff5a5a', align: 'center' });
        A.drawText(ctx, String(Math.max(this.shell.best, this.shell.score)), W - 8, 3, { color: '#ffffff', align: 'right' });
        for (var i = 0; i < Math.min(this.lives - (this.player.alive ? 1 : 0), 6); i++) {
            ctx.drawImage(gfx.ship, 0, 0, 15, 13, 4 + i * 12, H - 11, 11, 9);
        }
        // stage pennants
        var x = W - 6;
        for (var s = 0; s < Math.min(this.stage, 10); s++) {
            ctx.fillStyle = '#ffd335';
            ctx.fillRect(x - 1, H - 11, 1, 9);
            ctx.fillStyle = s % 5 === 4 ? '#4cc2ff' : '#e8322b';
            ctx.fillRect(x, H - 11, 4, 4);
            x -= 7;
        }
        if (this.stage > 10) {
            A.drawText(ctx, String(this.stage), x - 2, H - 10, { color: '#ffd335', align: 'right' });
        }
        var p = this.player;
        if (p.rapid > 0) {
            A.drawText(ctx, 'RAPID', W / 2, H - 10, { color: Math.floor(this.t * 4) % 2 ? '#ffd335' : '#ffffff', align: 'center' });
        }
    };

    Galaxy.prototype.renderTitle = function (ctx) {
        var t = this.t;
        var colors = ['#ff5a5a', '#ff9a2e', '#ffd335', '#7cff6b', '#4cc2ff', '#a24bff'];
        var word = 'GALAXY', x0 = W / 2 - A.textWidth(word, 4) / 2;
        for (var i = 0; i < word.length; i++) {
            A.drawText(ctx, word[i], x0 + i * 24, 36 + Math.round(Math.sin(t * 2.5 + i * 0.7) * 2), { scale: 4, color: colors[(i + Math.floor(t * 3)) % colors.length], shadow: '#000' });
        }
        A.drawText(ctx, 'STRIKE', W / 2, 72, { scale: 3, color: '#ffffff', align: 'center', shadow: '#a24bff' });

        A.drawText(ctx, '-- SCORE ADVANCE TABLE --', W / 2, 112, { color: '#4cc2ff', align: 'center' });
        A.drawText(ctx, 'FORMATION  DIVING', 150, 126, { color: '#8d94b3', align: 'center' });
        var rows = [['boss', '150', '400'], ['fly', '80', '160'], ['bee', '50', '100']];
        var frame = Math.floor(t * 2.2) % 2;
        rows.forEach(function (r, k) {
            var g = gfx[r[0]][frame], y = 140 + k * 18;
            ctx.drawImage(g, 52 - Math.floor(g.width / 2), y - 2);
            A.drawText(ctx, r[1], 118, y, { color: '#ffffff', align: 'center' });
            A.drawText(ctx, r[2], 180, y, { color: '#ffd335', align: 'center' });
        });
        ctx.drawImage(gfx.capT, 40, 198);
        ctx.drawImage(gfx.capR, 92, 198);
        ctx.drawImage(gfx.capS, 144, 198);
        A.drawText(ctx, 'TWIN', 54, 200, { color: '#c9d1e8' });
        A.drawText(ctx, 'RAPID', 106, 200, { color: '#c9d1e8' });
        A.drawText(ctx, 'SHIELD', 158, 200, { color: '#c9d1e8' });

        if (Math.floor(t * 2) % 2 === 0) {
            A.drawText(ctx, 'PRESS SPACE OR CLICK', W / 2, 228, { color: '#ffd335', align: 'center', shadow: '#000' });
        }
        A.drawText(ctx, 'ARROWS/MOUSE MOVE  SPACE/CLICK FIRE', W / 2, 246, { color: '#8d94b3', align: 'center' });
        ctx.drawImage(gfx.ship, W / 2 - 7, 262);
    };

    Galaxy.prototype.renderGameOver = function (ctx) {
        this.renderHud(ctx);
        return false;
    };

    // ---------------------------------------------------------------------------------------------
    // Launcher cover
    // ---------------------------------------------------------------------------------------------
    var coverStars = null;

    function drawCover(ctx, w, h, t) {
        buildGfx();
        if (!coverStars) {
            coverStars = [];
            for (var i = 0; i < 50; i++) {
                coverStars.push({ x: Math.random() * w, y: Math.random() * h, s: 10 + Math.random() * 30, c: U.pick(['#ffffff', '#ffd335', '#4cc2ff', '#ff6b6b']) });
            }
        }
        var grd = ctx.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, '#0a0618');
        grd.addColorStop(1, '#1f0b33');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
        coverStars.forEach(function (s) {
            ctx.fillStyle = s.c;
            ctx.fillRect(Math.round(s.x), Math.round((s.y + t * s.s) % h), 1, 1);
        });
        var frame = Math.floor(t * 2.2) % 2;
        var spread = 1 + 0.12 * (Math.sin(t * 1.7) + 1) / 2;
        for (var r = 0; r < 3; r++) {
            var kind = ['boss', 'fly', 'bee'][r], n = [4, 8, 10][r];
            for (var c = 0; c < n; c++) {
                var g = gfx[kind][frame];
                var x = w / 2 + (c - (n - 1) / 2) * 16 * spread, y = 18 + r * 15 * spread;
                ctx.drawImage(g, Math.round(x - g.width / 2), Math.round(y));
            }
        }
        var px = w / 2 + Math.sin(t * 1.3) * 60;
        ctx.drawImage(gfx.ship, Math.round(px) - 7, h - 34);
        var by = h - 40 - ((t * 140) % 80);
        ctx.fillStyle = '#fff27a';
        ctx.fillRect(Math.round(px) - 1, Math.round(by), 2, 6);
        A.drawText(ctx, 'GALAXY STRIKE', w / 2, h - 14, { color: '#ffd335', align: 'center', shadow: '#000' });
    }

    A.registerGame({
        id: 'galaxy',
        title: 'GALAXY STRIKE',
        description: 'Galaga style shooter: alien formations swoop in and dive at you. Power-ups, bonus challenging stages and a nebula backdrop.',
        help: 'Mouse or <kbd>&larr;</kbd><kbd>&rarr;</kbd> move &middot; hold click or <kbd>Space</kbd> fire &middot; <kbd>P</kbd> pause &middot; <kbd>M</kbd> sound',
        width: W,
        height: H,
        keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyA', 'KeyD', 'Space', 'KeyZ', 'KeyJ'],
        create: function (shell) { return new Galaxy(shell); },
        drawCover: drawCover
    });
})();

;
/* ===== DEVArcadeBricks.js ===== */
/*!
 * DEVArcadeBricks.js - "Brick Blaster", an Arkanoid style brick breaker for DEV Arcade.
 */
(function () {
    'use strict';

    var A = window.DEVArcade, U = A.util;

    var W = 256, H = 240;
    var FX = 8, FW = 240, FTOP = 24, BRICK_W = 16, BRICK_H = 8, BRICK_TOP = 40, COLS = 15;
    var PADDLE_Y = 222, PADDLE_H = 7;

    var BRICKS = {
        w: { color: '#f4f4f4', pts: 50 }, o: { color: '#ff9a2e', pts: 60 }, c: { color: '#2ee6ff', pts: 70 },
        g: { color: '#3ef05a', pts: 80 }, r: { color: '#ff3b3b', pts: 90 }, b: { color: '#3a6bff', pts: 100 },
        m: { color: '#ff4fd8', pts: 110 }, y: { color: '#ffe23a', pts: 120 },
        s: { color: '#b8bfd0', pts: 50, silver: true }, G: { color: '#e8b830', pts: 0, gold: true }
    };

    var LEVELS = [
        { name: 'WARM UP', rows: [
            '...............',
            'rrrrrrrrrrrrrrr',
            'ooooooooooooooo',
            'yyyyyyyyyyyyyyy',
            'ggggggggggggggg',
            'ccccccccccccccc',
            'bbbbbbbbbbbbbbb']
        },
        { name: 'PYRAMID', rows: [
            '.......w.......',
            '......wow......',
            '.....wocow.....',
            '....wocgcow....',
            '...wocgrgcow...',
            '..wocgrbrgcow..',
            '.wocgrbmbrgcow.']
        },
        { name: 'INVADER', rows: [
            '....g.....g....',
            '.....g...g.....',
            '....ggggggg....',
            '...gg.ggg.gg...',
            '..ggggggggggg..',
            '..g.ggggggg.g..',
            '..g.g.....g.g..',
            '.....gg.gg.....']
        },
        { name: 'CHECKERS', rows: [
            'r.o.y.g.c.b.m.w',
            '.o.y.g.c.b.m.w.',
            'r.o.y.g.c.b.m.w',
            '.o.y.g.c.b.m.w.',
            'r.o.y.g.c.b.m.w',
            '.o.y.g.c.b.m.w.']
        },
        { name: 'DEV', rows: [
            'sssssssssssssss',
            '...............',
            'bbb..yyyy.c...c',
            'b..b.y....c...c',
            'b..b.yyy..c...c',
            'b..b.y.....c.c.',
            'bbb..yyyy...c..',
            '...............',
            'mmmmmmmmmmmmmmm']
        },
        { name: 'GATES', rows: [
            'GGGG.......GGGG',
            'bbbb.......bbbb',
            'mmmmmmmmmmmmmmm',
            '...............',
            'yyyy.GGGGG.yyyy',
            'oooo.......oooo',
            'rrrrrrrrrrrrrrr']
        },
        { name: 'HEART', rows: [
            '...rrr...rrr...',
            '..rrrrr.rrrrr..',
            '.rrwwrrrrrrrrr.',
            '.rwrrrrrrrrrrr.',
            '.rrrrrrrrrrrrr.',
            '..rrrrrrrrrrr..',
            '...rrrrrrrrr...',
            '....rrrrrrr....',
            '.....rrrrr.....',
            '......rrr......',
            '.......r.......']
        },
        { name: 'COLUMNS', rows: [
            'sssssssssssssss',
            'w.w.w.w.w.w.w.w',
            'o.o.o.o.o.o.o.o',
            'y.y.y.y.y.y.y.y',
            'g.g.g.g.g.g.g.g',
            'c.c.c.c.c.c.c.c',
            'sssssssssssssss']
        },
        { name: 'RAINBOW', rows: [
            'm..............',
            'mm.............',
            'bmm............',
            'cbmm...........',
            'gcbmm..........',
            'ygcbmm.........',
            'oygcbmm........',
            'roygcbmm.......',
            'sroygcbmm......',
            '.sroygcbmm.....']
        },
        { name: 'CASTLE', rows: [
            'G.G.G.....G.G.G',
            'sssss.....sssss',
            's...s.....s...s',
            's.y.s.www.s.y.s',
            's...s.wmw.s...s',
            'sssssswwwssssss',
            'rrrrrrrrrrrrrrr']
        },
        { name: 'X++', rows: [
            'sssssssssssssss',
            '...............',
            'r...r..........',
            '.r.r...g....g..',
            '..r...ggg..ggg.',
            '.r.r...g....g..',
            'r...r..........',
            '...............',
            'yyyyyyyyyyyyyyy']
        },
        { name: 'FINALE', rows: [
            'GsssssssssssssG',
            'smmmmmmmmmmmmms',
            'smbbbbbbbbbbbms',
            'smbcccccccccbms',
            'smbcgggggggcbms',
            'smbcgyyyyygcbms',
            'smbcgyrrryygcbm',
            '...............',
            'GG.GG.GG.GG.GG.']
        }
    ];

    var POWERS = {
        E: { color: '#3a78ff', name: 'EXPAND', weight: 20 },
        L: { color: '#ff3b3b', name: 'LASER', weight: 15 },
        C: { color: '#2fd34a', name: 'CATCH', weight: 14 },
        S: { color: '#ff9a2e', name: 'SLOW', weight: 14 },
        D: { color: '#20d5ee', name: 'TRIPLE BALL', weight: 16 },
        F: { color: '#ff4fd8', name: 'FIREBALL', weight: 10 },
        P: { color: '#9aa3b8', name: 'EXTRA LIFE', weight: 4 }
    };

    // ---------------------------------------------------------------------------------------------
    // Pre-rendered graphics
    // ---------------------------------------------------------------------------------------------
    var gfx = null;

    function shade(hex, f) {
        var n = parseInt(hex.slice(1), 16);
        var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        if (f > 0) {
            r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f;
        } else {
            r *= 1 + f; g *= 1 + f; b *= 1 + f;
        }
        return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
    }

    function makeBrick(color, kind) {
        var c = document.createElement('canvas');
        c.width = BRICK_W;
        c.height = BRICK_H;
        var g = c.getContext('2d');
        g.fillStyle = shade(color, -0.55);
        g.fillRect(0, 0, BRICK_W, BRICK_H);
        g.fillStyle = color;
        g.fillRect(0, 0, BRICK_W - 1, BRICK_H - 1);
        g.fillStyle = shade(color, 0.55);
        g.fillRect(0, 0, BRICK_W - 1, 1);
        g.fillRect(0, 0, 1, BRICK_H - 1);
        g.fillStyle = shade(color, -0.25);
        g.fillRect(1, BRICK_H - 2, BRICK_W - 2, 1);
        g.fillRect(BRICK_W - 2, 1, 1, BRICK_H - 2);
        if (kind === 'silver' || kind === 'gold') {
            g.fillStyle = shade(color, 0.8);
            g.fillRect(3, 2, 3, 1);
            g.fillRect(2, 3, 1, 1);
        }
        return c;
    }

    function buildGfx() {
        if (gfx) {
            return gfx;
        }
        gfx = { bricks: {}, capsules: {} };
        Object.keys(BRICKS).forEach(function (k) {
            var b = BRICKS[k];
            gfx.bricks[k] = makeBrick(b.color, b.silver ? 'silver' : (b.gold ? 'gold' : ''));
        });
        gfx.shine = A.tintSprite(makeBrick('#ffffff', ''), 'rgba(255,255,255,0.9)');

        // walls: metallic pipes
        var wall = document.createElement('canvas');
        wall.width = W;
        wall.height = H;
        var g = wall.getContext('2d');
        function pipeV(x, y, h) {
            var cols = ['#2b3147', '#59627f', '#9aa4c2', '#d7ddf0', '#8b95b4', '#4a5372', '#2b3147', '#1b2033'];
            for (var i = 0; i < 8; i++) {
                g.fillStyle = cols[i];
                g.fillRect(x + i, y, 1, h);
            }
        }
        function pipeH(x, y, w) {
            var cols = ['#2b3147', '#59627f', '#9aa4c2', '#d7ddf0', '#8b95b4', '#4a5372', '#2b3147', '#1b2033'];
            for (var i = 0; i < 8; i++) {
                g.fillStyle = cols[i];
                g.fillRect(x, y + i, w, 1);
            }
        }
        pipeV(0, 16, H - 16);
        pipeV(W - 8, 16, H - 16);
        pipeH(0, 16, W);
        for (var y = 40; y < H; y += 48) {   // pipe joints
            [0, W - 8].forEach(function (x) {
                g.fillStyle = '#1b2033';
                g.fillRect(x, y, 8, 6);
                g.fillStyle = '#c8a040';
                g.fillRect(x + 1, y + 1, 6, 4);
                g.fillStyle = '#ffe08a';
                g.fillRect(x + 1, y + 1, 6, 1);
            });
        }
        for (var x = 24; x < W - 8; x += 56) {
            g.fillStyle = '#1b2033';
            g.fillRect(x, 16, 6, 8);
            g.fillStyle = '#c8a040';
            g.fillRect(x + 1, 17, 4, 6);
            g.fillStyle = '#ffe08a';
            g.fillRect(x + 1, 17, 1, 6);
        }
        gfx.walls = wall;

        // capsules
        Object.keys(POWERS).forEach(function (k) {
            var c = document.createElement('canvas');
            c.width = 16;
            c.height = 9;
            var cg = c.getContext('2d');
            var col = POWERS[k].color;
            cg.fillStyle = shade(col, -0.5);
            cg.fillRect(1, 0, 14, 9);
            cg.fillRect(0, 1, 16, 7);
            cg.fillStyle = col;
            cg.fillRect(1, 1, 14, 7);
            cg.fillStyle = shade(col, 0.5);
            cg.fillRect(2, 1, 12, 1);
            A.drawText(cg, k, 8, 1, { color: '#ffffff', align: 'center', shadow: shade(col, -0.6) });
            gfx.capsules[k] = c;
        });
        return gfx;
    }

    function drawPaddle(ctx, x, w, laser, t) {
        var y = PADDLE_Y, h = PADDLE_H;
        x = Math.round(x - w / 2);
        // body
        ctx.fillStyle = '#3c4560';
        ctx.fillRect(x + 4, y, w - 8, h);
        ctx.fillStyle = '#c9d1e8';
        ctx.fillRect(x + 4, y + 1, w - 8, 2);
        ctx.fillStyle = '#8a95b5';
        ctx.fillRect(x + 4, y + 3, w - 8, 2);
        ctx.fillStyle = '#4cc2ff';
        ctx.fillRect(x + w / 2 - 3, y + 2, 6, 3);
        // red caps
        var capCol = laser ? '#ffd335' : '#ff3b3b';
        [x, x + w - 6].forEach(function (cx) {
            ctx.fillStyle = shade(capCol, -0.5);
            ctx.fillRect(cx, y + 1, 6, h - 2);
            ctx.fillRect(cx + 1, y, 4, h);
            ctx.fillStyle = capCol;
            ctx.fillRect(cx + 1, y + 1, 4, h - 3);
            ctx.fillStyle = shade(capCol, 0.6);
            ctx.fillRect(cx + 1, y + 1, 4, 1);
        });
        if (laser) {
            ctx.fillStyle = '#ffd335';
            ctx.fillRect(x + 2, y - 3, 2, 3);
            ctx.fillRect(x + w - 4, y - 3, 2, 3);
        }
        // moving light
        var lx = x + 6 + ((t * 40) % Math.max(1, w - 12));
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(Math.round(lx), y + 1, 2, 1);
    }

    function drawBall(ctx, x, y, fire) {
        x = Math.round(x - 2);
        y = Math.round(y - 2);
        ctx.fillStyle = fire ? '#ff7a1a' : '#9ad8ff';
        ctx.fillRect(x + 1, y, 2, 4);
        ctx.fillRect(x, y + 1, 4, 2);
        ctx.fillStyle = fire ? '#fff2a0' : '#ffffff';
        ctx.fillRect(x + 1, y + 1, 1, 1);
    }

    // ---------------------------------------------------------------------------------------------
    // Game
    // ---------------------------------------------------------------------------------------------
    function Bricks(shell) {
        this.shell = shell;
        this.t = 0;
        buildGfx();
        shell.setBackground('DEVArcadeNebulaBlue.png', { scroll: 3 });
        this.demo = { x: W / 2, bx: 120, by: 150, vx: 70, vy: -90 };
        this.newGame();
        this.mode = 'title';
    }

    Bricks.prototype.newGame = function () {
        this.round = 0;
        this.lives = 3;
        this.nextLifeAt = 20000;
        this.loopSpeed = 1;
        this.loadRound(0);
    };

    Bricks.prototype.loadRound = function (index) {
        this.round = index;
        var def = LEVELS[index % LEVELS.length];
        this.loopSpeed = 1 + Math.floor(index / LEVELS.length) * 0.15;
        this.levelName = def.name;
        this.bricks = [];
        var hitsSilver = 2 + Math.floor(index / 8);
        for (var r = 0; r < def.rows.length; r++) {
            for (var c = 0; c < COLS; c++) {
                var ch = def.rows[r][c];
                if (!ch || ch === '.') {
                    continue;
                }
                var b = BRICKS[ch];
                this.bricks.push({
                    x: FX + c * BRICK_W, y: BRICK_TOP + r * BRICK_H, w: BRICK_W, h: BRICK_H, k: ch,
                    hits: b.silver ? hitsSilver : 1, gold: !!b.gold,
                    pts: b.silver ? 50 * (index + 1) : b.pts, shine: 0
                });
            }
        }
        this.remaining = this.bricks.filter(function (b) { return !b.gold; }).length;
        this.capsule = null;
        this.lasers = [];
        this.lifeGiven = false;
        this.resetPaddle();
        this.mode = 'intro';
        this.modeTime = 0;
    };

    Bricks.prototype.resetPaddle = function () {
        this.paddleX = W / 2;
        this.paddleW = 32;
        this.targetW = 32;
        this.laser = false;
        this.catchMode = false;
        this.fireTime = 0;
        this.slowTime = 0;
        this.laserCooldown = 0;
        this.balls = [this.newBall()];
        this.balls[0].stuck = true;
        this.balls[0].stuckOffset = 4;
        this.serveTime = 0;
    };

    Bricks.prototype.newBall = function () {
        return { x: this.paddleX, y: PADDLE_Y - 2, vx: 0, vy: 0, speed: 130 * this.loopSpeed, stuck: false, stuckOffset: 0, trail: [] };
    };

    Bricks.prototype.launch = function (ball) {
        var angle = (ball.stuckOffset / (this.paddleW / 2)) * 0.9 || U.rand(-0.35, 0.35);
        angle = U.clamp(angle, -1, 1);
        ball.stuck = false;
        ball.vx = Math.sin(angle) * ball.speed;
        ball.vy = -Math.cos(angle) * ball.speed;
        this.shell.sound.play('paddle');
    };

    Bricks.prototype.onPointer = function (type, x) {
        if (type === 'move') {
            this.pointerTarget = x;
        }
        if (type === 'down' && this.shell.state === 'playing') {
            this.fire();
            return true;
        }
        return false;
    };

    Bricks.prototype.fire = function () {
        var self = this, launched = false;
        self.balls.forEach(function (b) {
            if (b.stuck && self.mode === 'play') {
                self.launch(b);
                launched = true;
            }
        });
        if (!launched && self.laser && self.laserCooldown <= 0 && self.mode === 'play') {
            var x = self.paddleX - self.paddleW / 2;
            self.lasers.push({ x: x + 3, y: PADDLE_Y - 4 }, { x: x + self.paddleW - 3, y: PADDLE_Y - 4 });
            self.laserCooldown = 0.28;
            self.shell.sound.play('laser');
        }
    };

    // ---- update -----------------------------------------------------------------------------------

    Bricks.prototype.update = function (dt) {
        var shell = this.shell;
        this.t += dt;
        this.modeTime += dt;

        if (this.mode === 'intro') {
            this.movePaddle(dt);
            this.stickBalls();
            if (this.modeTime > 1.6) {
                this.mode = 'play';
                this.modeTime = 0;
            }
            return;
        }
        if (this.mode === 'clear') {
            if (this.modeTime > 2.2) {
                this.loadRound(this.round + 1);
            }
            return;
        }
        if (this.mode === 'dying') {
            if (this.modeTime > 1.4) {
                if (this.lives <= 0) {
                    shell.gameOver({ reason: 'gameover', round: this.round + 1 });
                } else {
                    this.resetPaddle();
                    this.mode = 'intro';
                    this.modeTime = 0.8;
                }
            }
            return;
        }

        // play
        if (shell.wasPressed('Space', 'ArrowUp', 'KeyW')) {
            this.fire();
        }
        this.movePaddle(dt);
        this.paddleW += U.clamp(this.targetW - this.paddleW, -60 * dt, 60 * dt);
        if (this.fireTime > 0) { this.fireTime -= dt; }
        if (this.slowTime > 0) { this.slowTime -= dt; }
        if (this.laserCooldown > 0) { this.laserCooldown -= dt; }

        this.stickBalls();
        var self = this;
        self.balls.forEach(function (b) {
            if (b.stuck) {
                self.serveTime += dt;
                if (self.serveTime > 3.5) {
                    self.launch(b);
                }
            }
        });
        if (!self.balls.some(function (b) { return b.stuck; })) {
            self.serveTime = 0;
        }

        for (var i = self.balls.length - 1; i >= 0; i--) {
            var ball = self.balls[i];
            if (ball.stuck) {
                continue;
            }
            // gradual speed up
            var maxSpeed = 250 * self.loopSpeed;
            ball.speed = Math.min(maxSpeed, ball.speed + dt * 1.5);
            var sp = ball.speed * (self.slowTime > 0 ? 0.65 : 1);
            var cur = Math.hypot(ball.vx, ball.vy) || 1;
            ball.vx = ball.vx / cur * sp;
            ball.vy = ball.vy / cur * sp;
            self.moveBall(ball, dt);
            ball.trail.unshift({ x: ball.x, y: ball.y });
            if (ball.trail.length > 6) {
                ball.trail.pop();
            }
            if (ball.y > H + 6) {
                self.balls.splice(i, 1);
            }
        }
        if (!self.balls.length) {
            self.loseLife();
            return;
        }

        self.updateLasers(dt);
        self.updateCapsule(dt);
        self.bricks.forEach(function (b) { if (b.shine > 0) { b.shine -= dt; } });

        if (self.remaining <= 0) {
            self.mode = 'clear';
            self.modeTime = 0;
            self.capsule = null;
            self.lasers = [];
            shell.sound.play('win');
            shell.addScore(1000 * (self.round + 1));
            shell.fx.text('+' + 1000 * (self.round + 1), W / 2, 150, '#ffd335');
        }
    };

    Bricks.prototype.idle = function (dt) {
        this.t += dt;
        if (this.shell.state === 'title') {
            var d = this.demo;   // attract mode: a ball bouncing behind the title
            d.bx += d.vx * dt;
            d.by += d.vy * dt;
            if (d.bx < FX + 2 || d.bx > FX + FW - 2) { d.vx = -d.vx; }
            if (d.by < FTOP + 2) { d.vy = Math.abs(d.vy); }
            if (d.by > PADDLE_Y - 2) { d.vy = -Math.abs(d.vy); }
            d.x += U.clamp(d.bx - d.x, -120 * dt, 120 * dt);
        }
    };

    Bricks.prototype.movePaddle = function (dt) {
        var shell = this.shell, half = this.paddleW / 2;
        var ax = shell.axisX();
        if (ax) {
            this.pointerTarget = undefined;
            this.paddleX += ax * 230 * dt;
        } else if (this.pointerTarget !== undefined) {
            this.paddleX += U.clamp(this.pointerTarget - this.paddleX, -600 * dt, 600 * dt);
        }
        this.paddleX = U.clamp(this.paddleX, FX + half, FX + FW - half);
    };

    Bricks.prototype.stickBalls = function () {
        var self = this;
        self.balls.forEach(function (b) {
            if (b.stuck) {
                b.x = self.paddleX + b.stuckOffset;
                b.y = PADDLE_Y - 2;
                b.trail.length = 0;
            }
        });
    };

    Bricks.prototype.moveBall = function (ball, dt) {
        var dist = Math.hypot(ball.vx, ball.vy) * dt;
        var n = Math.max(1, Math.ceil(dist / 2.5));
        var h = dt / n;
        for (var s = 0; s < n; s++) {
            var px = ball.x, py = ball.y;
            ball.x += ball.vx * h;
            ball.y += ball.vy * h;
            // walls
            if (ball.x < FX + 2) { ball.x = FX + 2; ball.vx = Math.abs(ball.vx); this.shell.sound.play('bounce'); }
            if (ball.x > FX + FW - 2) { ball.x = FX + FW - 2; ball.vx = -Math.abs(ball.vx); this.shell.sound.play('bounce'); }
            if (ball.y < FTOP + 2) { ball.y = FTOP + 2; ball.vy = Math.abs(ball.vy); this.shell.sound.play('bounce'); }
            // paddle
            if (ball.vy > 0 && ball.y + 2 >= PADDLE_Y && ball.y - 2 <= PADDLE_Y + PADDLE_H &&
                ball.x + 2 >= this.paddleX - this.paddleW / 2 && ball.x - 2 <= this.paddleX + this.paddleW / 2) {
                this.hitPaddle(ball);
                return;
            }
            // bricks
            if (this.collideBricks(ball, px, py)) {
                ball.x = px;
                ball.y = py;
            }
        }
    };

    Bricks.prototype.hitPaddle = function (ball) {
        var rel = U.clamp((ball.x - this.paddleX) / (this.paddleW / 2), -1, 1);
        var angle = rel * 1.05;   // up to ~60 degrees from vertical
        var sp = Math.hypot(ball.vx, ball.vy);
        ball.vx = Math.sin(angle) * sp;
        ball.vy = -Math.cos(angle) * sp;
        ball.y = PADDLE_Y - 2;
        ball.speed = Math.min(250 * this.loopSpeed, ball.speed + 3);
        if (this.catchMode) {
            ball.stuck = true;
            ball.stuckOffset = ball.x - this.paddleX;
            this.serveTime = 0;
        }
        this.shell.sound.play('paddle');
    };

    Bricks.prototype.collideBricks = function (ball, px, py) {
        var br = { x: ball.x - 2, y: ball.y - 2, w: 4, h: 4 };
        for (var i = 0; i < this.bricks.length; i++) {
            var b = this.bricks[i];
            if (!U.rectsOverlap(br, b)) {
                continue;
            }
            var fire = this.fireTime > 0 && !b.gold;
            if (!fire) {
                var wasOverlapX = px + 2 > b.x && px - 2 < b.x + b.w;
                var wasOverlapY = py + 2 > b.y && py - 2 < b.y + b.h;
                if (wasOverlapX && !wasOverlapY) {
                    ball.vy = -ball.vy;
                } else if (wasOverlapY && !wasOverlapX) {
                    ball.vx = -ball.vx;
                } else {
                    ball.vx = -ball.vx;
                    ball.vy = -ball.vy;
                }
                // never let the ball move too flat
                var sp = Math.hypot(ball.vx, ball.vy);
                if (Math.abs(ball.vy) < sp * 0.28) {
                    ball.vy = (ball.vy < 0 ? -1 : 1) * sp * 0.28;
                    ball.vx = (ball.vx < 0 ? -1 : 1) * Math.sqrt(sp * sp - ball.vy * ball.vy);
                }
            }
            this.hitBrick(i, fire);
            return !fire;
        }
        return false;
    };

    Bricks.prototype.hitBrick = function (i, fire) {
        var b = this.bricks[i], shell = this.shell;
        if (b.gold) {
            b.shine = 0.3;
            shell.sound.play('metal');
            return;
        }
        b.hits -= fire ? b.hits : 1;
        if (b.hits > 0) {
            b.shine = 0.3;
            shell.sound.play('metal');
            return;
        }
        this.bricks.splice(i, 1);
        this.remaining--;
        shell.addScore(b.pts);
        shell.sound.play('brick');
        shell.fx.burst(b.x + 8, b.y + 4, { count: 10, colors: [BRICKS[b.k].color, '#ffffff'], speed: 70, life: 0.5, gravity: 140 });
        if (shell.score >= this.nextLifeAt) {
            this.nextLifeAt += 40000;
            this.extraLife();
        }
        this.maybeDropCapsule(b);
    };

    Bricks.prototype.maybeDropCapsule = function (b) {
        if (this.capsule || this.remaining <= 0 || Math.random() > 0.17) {
            return;
        }
        var self = this, total = 0, options = [];
        Object.keys(POWERS).forEach(function (k) {
            if (k === 'P' && self.lifeGiven) { return; }
            if (k === 'D' && self.balls.length > 1) { return; }
            options.push(k);
            total += POWERS[k].weight;
        });
        var roll = Math.random() * total, kind = options[0];
        for (var i = 0; i < options.length; i++) {
            roll -= POWERS[options[i]].weight;
            if (roll <= 0) {
                kind = options[i];
                break;
            }
        }
        this.capsule = { x: b.x, y: b.y, k: kind };
    };

    Bricks.prototype.updateCapsule = function (dt) {
        var c = this.capsule;
        if (!c) {
            return;
        }
        c.y += 55 * dt;
        if (c.y > H) {
            this.capsule = null;
            return;
        }
        if (c.y + 9 >= PADDLE_Y && c.y <= PADDLE_Y + PADDLE_H && c.x + 16 >= this.paddleX - this.paddleW / 2 && c.x <= this.paddleX + this.paddleW / 2) {
            this.capsule = null;
            this.applyPower(c.k);
        }
    };

    Bricks.prototype.applyPower = function (k) {
        var shell = this.shell, self = this;
        shell.addScore(100);
        shell.sound.play(k === 'P' ? 'coin' : 'powerup');
        shell.fx.text(POWERS[k].name, this.paddleX, PADDLE_Y - 14, POWERS[k].color);
        this.laser = false;
        this.catchMode = false;
        this.targetW = 32;
        switch (k) {
            case 'E': this.targetW = 48; break;
            case 'L': this.laser = true; break;
            case 'C': this.catchMode = true; break;
            case 'S': this.slowTime = 12; break;
            case 'F': this.fireTime = 9; break;
            case 'P': this.lifeGiven = true; this.extraLife(); break;
            case 'D':
                var src = this.balls[0];
                if (src.stuck) {
                    this.launch(src);
                }
                [-0.5, 0.5].forEach(function (da) {
                    var nb = self.newBall();
                    var ang = Math.atan2(src.vx, -src.vy) + da;
                    nb.x = src.x;
                    nb.y = src.y;
                    nb.speed = src.speed;
                    nb.vx = Math.sin(ang) * src.speed;
                    nb.vy = -Math.abs(Math.cos(ang) * src.speed);
                    self.balls.push(nb);
                });
                break;
        }
    };

    Bricks.prototype.extraLife = function () {
        this.lives = Math.min(9, this.lives + 1);
        this.shell.fx.text('1UP', this.paddleX, PADDLE_Y - 24, '#7cff6b');
    };

    Bricks.prototype.updateLasers = function (dt) {
        for (var i = this.lasers.length - 1; i >= 0; i--) {
            var l = this.lasers[i];
            l.y -= 320 * dt;
            var hit = false;
            for (var j = 0; j < this.bricks.length; j++) {
                var b = this.bricks[j];
                if (l.x >= b.x && l.x < b.x + b.w && l.y < b.y + b.h && l.y + 5 > b.y) {
                    this.hitBrick(j, false);
                    hit = true;
                    break;
                }
            }
            if (hit || l.y < FTOP) {
                this.lasers.splice(i, 1);
            }
        }
    };

    Bricks.prototype.loseLife = function () {
        var shell = this.shell;
        this.lives--;
        this.mode = 'dying';
        this.modeTime = 0;
        this.capsule = null;
        this.lasers = [];
        shell.sound.play('life');
        shell.shake(3, 0.5);
        shell.fx.burst(this.paddleX, PADDLE_Y + 3, { count: 40, colors: ['#ff3b3b', '#c9d1e8', '#ffd335', '#4cc2ff'], speed: 110, life: 1.0, gravity: 120 });
    };

    // ---- render -----------------------------------------------------------------------------------

    Bricks.prototype.render = function (ctx, state) {
        var self = this;
        ctx.fillStyle = 'rgba(2, 4, 14, 0.35)';
        ctx.fillRect(FX, FTOP, FW, H - FTOP);
        ctx.fillStyle = '#05060d';
        ctx.fillRect(0, 0, W, 16);
        ctx.drawImage(gfx.walls, 0, 0);

        // HUD
        A.drawText(ctx, '1UP', 6, 4, { color: '#ff3b3b' });
        A.drawText(ctx, U.pad(this.shell.score, 6), 28, 4, { color: '#ffffff' });
        A.drawText(ctx, 'HI', 92, 4, { color: '#ff3b3b' });
        A.drawText(ctx, U.pad(Math.max(this.shell.best, this.shell.score), 6), 108, 4, { color: '#ffffff' });
        A.drawText(ctx, 'ROUND ' + (this.round + 1), 176, 4, { color: '#4cc2ff' });
        for (var i = 0; i < Math.min(this.lives - (state === 'title' ? 0 : 0), 6); i++) {
            ctx.fillStyle = '#ff3b3b';
            ctx.fillRect(FX + 4 + i * 12, H - 6, 3, 3);
            ctx.fillRect(FX + 11 + i * 12, H - 6, 3, 3);
            ctx.fillStyle = '#c9d1e8';
            ctx.fillRect(FX + 7 + i * 12, H - 6, 4, 3);
        }

        // bricks
        this.bricks.forEach(function (b) {
            ctx.drawImage(gfx.bricks[b.k], b.x, b.y);
            if (b.shine > 0) {
                ctx.globalAlpha = b.shine / 0.3 * 0.8;
                ctx.drawImage(gfx.shine, b.x, b.y);
                ctx.globalAlpha = 1;
            }
        });

        if (state === 'title') {
            var d = this.demo;
            drawPaddle(ctx, d.x, 32, false, this.t);
            drawBall(ctx, d.bx, d.by, false);
            return;
        }

        // capsule
        if (this.capsule) {
            var c = this.capsule;
            ctx.drawImage(gfx.capsules[c.k], Math.round(c.x), Math.round(c.y));
            var sx = Math.floor((this.t * 30) % 20) - 2;
            if (sx >= 1 && sx < 15) {
                ctx.fillStyle = 'rgba(255,255,255,0.6)';
                ctx.fillRect(Math.round(c.x) + sx, Math.round(c.y) + 1, 1, 7);
            }
        }

        // lasers
        ctx.fillStyle = '#fff27a';
        this.lasers.forEach(function (l) { ctx.fillRect(Math.round(l.x) - 1, Math.round(l.y), 2, 5); });

        // paddle and balls
        if (this.mode !== 'dying') {
            drawPaddle(ctx, this.paddleX, Math.round(this.paddleW), this.laser, this.t);
        }
        var fire = this.fireTime > 0;
        this.balls.forEach(function (b) {
            for (var k = b.trail.length - 1; k >= 1; k--) {
                ctx.globalAlpha = 0.35 * (1 - k / b.trail.length);
                ctx.fillStyle = fire ? '#ff7a1a' : '#4cc2ff';
                ctx.fillRect(Math.round(b.trail[k].x) - 1, Math.round(b.trail[k].y) - 1, 3, 3);
            }
            ctx.globalAlpha = 1;
            if (self.mode !== 'dying') {
                drawBall(ctx, b.x, b.y, fire);
            }
        });

        // timers for timed power-ups
        var tx = FX + FW - 4;
        if (this.fireTime > 0) { tx = this.timerBar(ctx, tx, this.fireTime / 9, POWERS.F.color); }
        if (this.slowTime > 0) { this.timerBar(ctx, tx, this.slowTime / 12, POWERS.S.color); }

        if (this.mode === 'intro') {
            A.drawText(ctx, 'ROUND ' + (this.round + 1), W / 2, 150, { scale: 2, color: '#ffd335', align: 'center', shadow: '#000' });
            A.drawText(ctx, this.levelName, W / 2, 170, { color: '#4cc2ff', align: 'center', shadow: '#000' });
            if (this.modeTime > 0.7) {
                A.drawText(ctx, 'READY', W / 2, 186, { color: '#ffffff', align: 'center', shadow: '#000' });
            }
        } else if (this.mode === 'clear') {
            A.drawText(ctx, 'ROUND CLEAR!', W / 2, 160, { scale: 2, color: '#7cff6b', align: 'center', shadow: '#000' });
        } else if (this.mode === 'play' && this.balls.some(function (b) { return b.stuck; }) && Math.floor(this.t * 2) % 2 === 0) {
            A.drawText(ctx, 'CLICK OR SPACE TO LAUNCH', W / 2, 196, { color: '#ffffff', align: 'center', shadow: '#000' });
        }
    };

    Bricks.prototype.timerBar = function (ctx, right, frac, color) {
        var w = 30;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(right - w, FTOP + 3, w, 4);
        ctx.fillStyle = color;
        ctx.fillRect(right - w, FTOP + 3, Math.round(w * frac), 4);
        return right - w - 4;
    };

    Bricks.prototype.renderTitle = function (ctx) {
        ctx.fillStyle = 'rgba(3, 5, 16, 0.72)';
        ctx.fillRect(FX, FTOP, FW, H - FTOP);
        var t = this.t;
        var colors = ['#ff3b3b', '#ff9a2e', '#ffe23a', '#3ef05a', '#2ee6ff', '#3a6bff', '#ff4fd8'];
        var word = 'BRICK', x0 = W / 2 - A.textWidth(word, 4) / 2;
        for (var i = 0; i < word.length; i++) {
            var dy = Math.round(Math.sin(t * 3 + i * 0.6) * 2);
            A.drawText(ctx, word[i], x0 + i * 24, 40 + dy, { scale: 4, color: colors[(i + Math.floor(t * 4)) % colors.length], shadow: '#000' });
        }
        A.drawText(ctx, 'BLASTER', W / 2, 74, { scale: 3, color: '#ffffff', align: 'center', shadow: '#3a6bff' });

        var keys = Object.keys(POWERS);
        for (var k = 0; k < keys.length; k++) {
            var col = k % 2, row = Math.floor(k / 2);
            var px = 34 + col * 100, py = 108 + row * 15;
            ctx.drawImage(gfx.capsules[keys[k]], px, py);
            A.drawText(ctx, POWERS[keys[k]].name, px + 20, py + 1, { color: '#c9d1e8' });
        }
        if (Math.floor(t * 2) % 2 === 0) {
            A.drawText(ctx, 'PRESS SPACE OR CLICK TO START', W / 2, 180, { color: '#ffd335', align: 'center', shadow: '#000' });
        }
        A.drawText(ctx, 'MOUSE OR ARROWS MOVE - SPACE LAUNCH/FIRE', W / 2, 196, { color: '#8d94b3', align: 'center' });
    };

    Bricks.prototype.onGameOver = function () {
        this.mode = 'over';
    };

    // ---------------------------------------------------------------------------------------------
    // Launcher cover
    // ---------------------------------------------------------------------------------------------
    function drawCover(ctx, w, h, t) {
        buildGfx();
        var grd = ctx.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, '#081028');
        grd.addColorStop(1, '#0b1f3a');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
        var rows = LEVELS[1].rows;
        for (var r = 0; r < rows.length; r++) {
            for (var c = 0; c < COLS; c++) {
                var ch = rows[r][c];
                if (ch !== '.') {
                    ctx.drawImage(gfx.bricks[ch], 8 + c * BRICK_W, 14 + r * BRICK_H);
                }
            }
        }
        var bx = 128 + Math.sin(t * 1.7) * 90, by = 100 - Math.abs(Math.sin(t * 2.6)) * 30;
        var px = 128 + Math.sin(t * 1.7 - 0.2) * 80;
        ctx.save();
        ctx.translate(0, -96);
        drawPaddle(ctx, px, 32, false, t);
        ctx.restore();
        drawBall(ctx, bx, by + 10, false);
        A.drawText(ctx, 'BRICK BLASTER', w / 2, h - 14, { color: '#ffd335', align: 'center', shadow: '#000' });
    }

    A.registerGame({
        id: 'bricks',
        title: 'BRICK BLASTER',
        description: 'Arkanoid style brick breaker with 12 rounds (look for the DEV and X++ levels), power-ups, lasers and multiball.',
        help: 'Mouse or <kbd>&larr;</kbd><kbd>&rarr;</kbd> move &middot; click or <kbd>Space</kbd> launch / fire &middot; <kbd>P</kbd> pause &middot; <kbd>M</kbd> sound',
        width: W,
        height: H,
        keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'KeyA', 'KeyD', 'KeyW', 'Space'],
        create: function (shell) { return new Bricks(shell); },
        drawCover: drawCover
    });
})();

;
/* ===== DEVArcadeMines.js ===== */
/*!
 * DEVArcadeMines.js - Minesweeper in classic desktop style for DEV Arcade.
 */
(function () {
    'use strict';

    var A = window.DEVArcade, U = A.util;

    var CELL = 16, TOP = 18, BORDER = 8, PANEL_H = 34;
    var LEVELS = [
        { label: 'EASY', cols: 9, rows: 9, mines: 10, base: 1000, par: 200, perSec: 10, mult: 1 },
        { label: 'MEDIUM', cols: 16, rows: 16, mines: 40, base: 4000, par: 600, perSec: 20, mult: 2 },
        { label: 'HARD', cols: 30, rows: 16, mines: 99, base: 10000, par: 1200, perSec: 30, mult: 3 }
    ];
    var NUM_COLORS = [null, '#1a3cff', '#0b8a1c', '#e41b1b', '#0d1a8c', '#8a1010', '#0a8a8a', '#111111', '#7a7a7a'];
    var C = { face: '#c0c0c0', light: '#ffffff', dark: '#808080', open: '#bdbdbd', hover: '#d6d6d6', grid: '#8a8a8a' };

    // ---------------------------------------------------------------------------------------------
    // Sprites
    // ---------------------------------------------------------------------------------------------
    var sprites = null;

    function buildSprites() {
        if (sprites) {
            return sprites;
        }
        var faceRows = [
            '......#####......',
            '....##yyyyy##....',
            '...#yyyyyyyyy#...',
            '..#yyyyyyyyyyy#..',
            '.#yyyyyyyyyyyyy#.',
            '.#yyyyyyyyyyyyy#.',
            '#yyyyyyyyyyyyyyy#',
            '#yyyyyyyyyyyyyyy#',
            '#yyyyyyyyyyyyyyy#',
            '#yyyyyyyyyyyyyyy#',
            '#yyyyyyyyyyyyyyy#',
            '.#yyyyyyyyyyyyy#.',
            '.#yyyyyyyyyyyyy#.',
            '..#yyyyyyyyyyy#..',
            '...#yyyyyyyyy#...',
            '....##yyyyy##....',
            '......#####......'
        ];
        var pal = { '#': '#000000', 'y': '#ffe000' };
        function face(features) {
            var c = A.sprite(faceRows, pal);
            var g = c.getContext('2d');
            g.fillStyle = '#000000';
            features.forEach(function (r) { g.fillRect(r[0], r[1], r[2], r[3]); });
            return c;
        }
        var smileMouth = [[4, 10, 1, 1], [12, 10, 1, 1], [5, 11, 1, 1], [11, 11, 1, 1], [6, 12, 5, 1]];
        var eyes = [[5, 5, 2, 2], [10, 5, 2, 2]];
        sprites = {
            smile: face(eyes.concat(smileMouth)),
            oh: face(eyes.concat([[7, 10, 3, 1], [6, 11, 1, 2], [10, 11, 1, 2], [7, 13, 3, 1]])),
            dead: face([[4, 4, 1, 1], [6, 4, 1, 1], [5, 5, 1, 1], [4, 6, 1, 1], [6, 6, 1, 1],
                [10, 4, 1, 1], [12, 4, 1, 1], [11, 5, 1, 1], [10, 6, 1, 1], [12, 6, 1, 1],
                [6, 11, 5, 1], [5, 12, 1, 1], [11, 12, 1, 1]]),
            cool: face(smileMouth.concat([[3, 5, 11, 1], [4, 6, 4, 2], [9, 6, 4, 2], [2, 5, 1, 1], [14, 5, 1, 1]]))
        };

        // mine (16x16)
        var mine = document.createElement('canvas');
        mine.width = mine.height = CELL;
        var g = mine.getContext('2d');
        g.fillStyle = '#000000';
        for (var y = 0; y < 16; y++) {
            for (var x = 0; x < 16; x++) {
                var dx = x - 7.5, dy = y - 7.5;
                if (dx * dx + dy * dy <= 17) {
                    g.fillRect(x, y, 1, 1);
                }
            }
        }
        g.fillRect(2, 7, 12, 2);
        g.fillRect(7, 2, 2, 12);
        g.fillRect(4, 4, 1, 1); g.fillRect(11, 4, 1, 1); g.fillRect(4, 11, 1, 1); g.fillRect(11, 11, 1, 1);
        g.fillStyle = '#ffffff';
        g.fillRect(5, 5, 2, 2);
        sprites.mine = mine;

        sprites.flag = A.sprite([
            '................',
            '................',
            '................',
            '.......rr.......',
            '.....rrrr.......',
            '....rrrrr.......',
            '.....rrrr.......',
            '.......rr.......',
            '........#.......',
            '........#.......',
            '........#.......',
            '......####......',
            '....########....',
            '....########....',
            '................',
            '................'
        ], { 'r': '#f01818', '#': '#000000' });

        var cross = document.createElement('canvas');
        cross.width = cross.height = CELL;
        g = cross.getContext('2d');
        g.drawImage(mine, 0, 0);
        g.fillStyle = '#f01818';
        for (var i = 2; i < 14; i++) {
            g.fillRect(i, i, 2, 1);
            g.fillRect(15 - i - 1, i, 2, 1);
        }
        sprites.wrongFlag = cross;
        return sprites;
    }

    // ---------------------------------------------------------------------------------------------
    // Drawing helpers (shared by the game and the launcher cover)
    // ---------------------------------------------------------------------------------------------
    function bevel(ctx, x, y, w, h, raised, width) {
        width = width || 2;
        ctx.fillStyle = raised ? C.light : C.dark;
        ctx.fillRect(x, y, w, width);
        ctx.fillRect(x, y, width, h);
        ctx.fillStyle = raised ? C.dark : C.light;
        for (var i = 0; i < width; i++) {
            ctx.fillRect(x + i + 1, y + h - 1 - i, w - i - 1, 1);
            ctx.fillRect(x + w - 1 - i, y + i + 1, 1, h - i - 1);
        }
    }

    function drawHidden(ctx, x, y, hover) {
        ctx.fillStyle = hover ? C.hover : C.face;
        ctx.fillRect(x, y, CELL, CELL);
        bevel(ctx, x, y, CELL, CELL, true, 2);
    }

    function drawOpen(ctx, x, y, n, bg) {
        ctx.fillStyle = bg || C.open;
        ctx.fillRect(x, y, CELL, CELL);
        ctx.fillStyle = C.grid;
        ctx.fillRect(x, y, CELL, 1);
        ctx.fillRect(x, y, 1, CELL);
        if (n > 0) {
            A.drawText(ctx, String(n), x + 5, y + 5, { color: NUM_COLORS[n] });
            A.drawText(ctx, String(n), x + 6, y + 5, { color: NUM_COLORS[n] });
        }
    }

    var SEGMENTS = {
        a: [2, 0, 7, 2], f: [0, 1, 2, 9], b: [9, 1, 2, 9], g: [2, 9, 7, 2], e: [0, 11, 2, 9], c: [9, 11, 2, 9], d: [2, 19, 7, 2]
    };
    var DIGIT_SEGS = {
        '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc',
        '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': ''
    };

    function drawLed(ctx, x, y, value) {
        var s = value < 0 ? '-' + U.pad(Math.min(99, -value), 2) : U.pad(Math.min(999, value), 3);
        bevel(ctx, x - 1, y - 1, 43, 25, false, 1);
        ctx.fillStyle = '#000000';
        ctx.fillRect(x, y, 41, 23);
        for (var i = 0; i < 3; i++) {
            var on = DIGIT_SEGS[s[i]] || '';
            Object.keys(SEGMENTS).forEach(function (k) {
                var r = SEGMENTS[k];
                ctx.fillStyle = on.indexOf(k) >= 0 ? '#ff2a2a' : '#3a0505';
                ctx.fillRect(x + 2 + i * 13 + r[0], y + 1 + r[1], r[2], r[3]);
            });
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Game
    // ---------------------------------------------------------------------------------------------
    function Mines(shell) {
        this.shell = shell;
        this.levelIndex = U.clamp(A.store.get('mines.level', 0), 0, LEVELS.length - 1);
        this.clock = 0;
        this.hover = -1;
        this.pressed = -1;
        this.pressedButton = -1;
        this.faceDown = false;
        this.cursor = 0;
        this.cursorVisible = false;
        buildSprites();
        this.layout();
        this.reset();
    }

    Mines.prototype.layout = function () {
        var L = this.L = LEVELS[this.levelIndex];
        var boardW = L.cols * CELL;
        this.W = Math.max(boardW + 2 * BORDER + 6, 200);
        this.boardX = Math.floor((this.W - boardW) / 2);
        this.panelY = TOP;
        this.boardY = TOP + PANEL_H + 8 + 3;
        this.H = this.boardY + L.rows * CELL + 3 + BORDER;
        this.faceX = Math.floor(this.W / 2) - 13;
        this.faceY = this.panelY + 4;
        this.shell.resize(this.W, this.H);
    };

    Mines.prototype.reset = function () {
        var n = this.L.cols * this.L.rows;
        this.mine = new Uint8Array(n);
        this.open = new Uint8Array(n);
        this.flag = new Uint8Array(n);
        this.adj = new Uint8Array(n);
        this.openAt = new Float32Array(n);
        this.mineAt = new Float32Array(n);
        this.mineShown = new Uint8Array(n);
        this.placed = false;
        this.seconds = 0;
        this.timerRunning = false;
        this.exploded = -1;
        this.won = false;
        this.lost = false;
        this.opened = 0;
        this.flags = 0;
        this.confetti = 0;
        this.resultScore = 0;
        this.cursor = Math.min(this.cursor, n - 1);
    };

    Mines.prototype.newGame = function () {
        this.reset();
    };

    Mines.prototype.selectLevel = function (i) {
        if (i === this.levelIndex) {
            return;
        }
        this.shell.toTitle();
        this.levelIndex = i;
        A.store.set('mines.level', i);
        this.cursor = 0;
        this.layout();
        this.reset();
        this.shell.sound.play('select');
    };

    Mines.prototype.neighbors = function (idx) {
        var cols = this.L.cols, rows = this.L.rows;
        var r = Math.floor(idx / cols), c = idx % cols, out = [];
        for (var dr = -1; dr <= 1; dr++) {
            for (var dc = -1; dc <= 1; dc++) {
                if (dr || dc) {
                    var rr = r + dr, cc = c + dc;
                    if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) {
                        out.push(rr * cols + cc);
                    }
                }
            }
        }
        return out;
    };

    Mines.prototype.placeMines = function (safeIdx) {
        var n = this.L.cols * this.L.rows, self = this;
        var safe = {};
        safe[safeIdx] = true;
        if (n - 9 >= this.L.mines) {
            this.neighbors(safeIdx).forEach(function (i) { safe[i] = true; });
        }
        var candidates = [];
        for (var i = 0; i < n; i++) {
            if (!safe[i]) {
                candidates.push(i);
            }
        }
        U.shuffle(candidates);
        for (i = 0; i < this.L.mines; i++) {
            this.mine[candidates[i]] = 1;
        }
        for (i = 0; i < n; i++) {
            var count = 0;
            self.neighbors(i).forEach(function (j) { count += self.mine[j]; });
            this.adj[i] = count;
        }
        this.placed = true;
        this.timerRunning = true;
    };

    /** Starts the round on the first action (title state) and places the mines. */
    Mines.prototype.ensureStarted = function (idx) {
        if (this.shell.state === 'title') {
            this.shell.start();
        }
        if (!this.placed && idx >= 0) {
            this.placeMines(idx);
        }
    };

    Mines.prototype.reveal = function (idx) {
        if (this.open[idx] || this.flag[idx]) {
            return;
        }
        if (this.mine[idx]) {
            this.lose(idx);
            return;
        }
        var self = this, layer = [idx], depth = 0, seen = {};
        seen[idx] = true;
        while (layer.length) {
            var next = [];
            for (var k = 0; k < layer.length; k++) {
                var i = layer[k];
                if (self.open[i]) {
                    continue;
                }
                self.open[i] = 1;
                self.openAt[i] = self.clock + depth * 0.018;
                self.opened++;
                if (self.adj[i] === 0) {
                    self.neighbors(i).forEach(function (j) {
                        if (!seen[j] && !self.open[j] && !self.flag[j] && !self.mine[j]) {
                            seen[j] = true;
                            next.push(j);
                        }
                    });
                }
            }
            layer = next;
            depth++;
        }
        self.shell.sound.play(depth > 2 ? 'open' : 'click');
        self.shell.setScore(self.opened * self.L.mult);
        if (self.opened === self.L.cols * self.L.rows - self.L.mines) {
            self.win();
        }
    };

    Mines.prototype.chord = function (idx) {
        if (!this.open[idx] || this.adj[idx] === 0) {
            return;
        }
        var self = this, flags = 0, toOpen = [];
        this.neighbors(idx).forEach(function (j) {
            if (self.flag[j]) {
                flags++;
            } else if (!self.open[j]) {
                toOpen.push(j);
            }
        });
        if (flags !== this.adj[idx] || !toOpen.length) {
            return;
        }
        for (var k = 0; k < toOpen.length && !this.lost && !this.won; k++) {
            this.reveal(toOpen[k]);
        }
    };

    Mines.prototype.toggleFlag = function (idx) {
        if (this.open[idx]) {
            return;
        }
        this.flag[idx] = this.flag[idx] ? 0 : 1;
        this.flags += this.flag[idx] ? 1 : -1;
        this.shell.sound.play('flag');
    };

    Mines.prototype.lose = function (idx) {
        var self = this, cols = this.L.cols;
        self.lost = true;
        self.exploded = idx;
        self.timerRunning = false;
        self.open[idx] = 1;
        self.openAt[idx] = self.clock;
        var er = Math.floor(idx / cols), ec = idx % cols, list = [];
        for (var i = 0; i < self.mine.length; i++) {
            if (self.mine[i] && i !== idx && !self.flag[i]) {
                list.push({ i: i, d: Math.hypot(Math.floor(i / cols) - er, i % cols - ec) });
            }
        }
        list.sort(function (a, b) { return a.d - b.d; });
        var step = Math.min(0.06, 1.6 / Math.max(1, list.length));
        list.forEach(function (m, k) { self.mineAt[m.i] = self.clock + 0.25 + k * step; });
        self.shell.sound.play('bigExplode');
        self.shell.shake(3, 0.4);
        self.shell.flash('#ff3020', 0.2);
        var p = self.cellPos(idx);
        self.shell.fx.burst(p.x + 8, p.y + 8, { count: 30, colors: ['#ffdd55', '#ff7a1a', '#ff2a2a', '#555555'], speed: 90, life: 0.9, gravity: 60 });
        self.shell.gameOver({ reason: 'gameover', level: self.L.label, seconds: Math.floor(self.seconds), opened: self.opened });
    };

    Mines.prototype.win = function () {
        var self = this;
        self.won = true;
        self.timerRunning = false;
        for (var i = 0; i < self.mine.length; i++) {
            if (self.mine[i] && !self.flag[i]) {
                self.flag[i] = 1;
                self.flags++;
            }
        }
        var secs = Math.floor(self.seconds);
        self.resultScore = self.L.base + Math.max(0, self.L.par - secs) * self.L.perSec;
        self.shell.setScore(self.resultScore);
        self.confetti = 1.8;
        self.shell.gameOver({ reason: 'won', level: self.L.label, seconds: secs, opened: self.opened });
    };

    Mines.prototype.cellPos = function (idx) {
        return { x: this.boardX + (idx % this.L.cols) * CELL, y: this.boardY + Math.floor(idx / this.L.cols) * CELL };
    };

    Mines.prototype.cellAt = function (x, y) {
        var c = Math.floor((x - this.boardX) / CELL), r = Math.floor((y - this.boardY) / CELL);
        if (c < 0 || r < 0 || c >= this.L.cols || r >= this.L.rows) {
            return -1;
        }
        return r * this.L.cols + c;
    };

    Mines.prototype.tabRects = function () {
        var rects = [], x = 0, gap = 8;
        var total = LEVELS.reduce(function (s, l) { return s + A.textWidth(l.label) + 10; }, 0) + gap * (LEVELS.length - 1);
        x = Math.floor((this.W - total) / 2);
        LEVELS.forEach(function (l) {
            var w = A.textWidth(l.label) + 10;
            rects.push({ x: x, y: 3, w: w, h: 12 });
            x += w + gap;
        });
        return rects;
    };

    Mines.prototype.inFace = function (x, y) {
        return x >= this.faceX && x < this.faceX + 26 && y >= this.faceY && y < this.faceY + 26;
    };

    // ---- input ------------------------------------------------------------------------------------

    Mines.prototype.onPointer = function (type, x, y, button) {
        var shell = this.shell, idx = this.cellAt(x, y);
        if (type === 'move') {
            this.hover = idx;
            if (this.pressed >= 0 && this.pressedButton === 0) {
                this.pressed = idx;
            }
            return true;
        }
        if (type === 'down') {
            this.cursorVisible = false;
            if (y < TOP) {
                var rects = this.tabRects();
                for (var i = 0; i < rects.length; i++) {
                    var r = rects[i];
                    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
                        this.selectLevel(i);
                    }
                }
                return true;
            }
            if (this.inFace(x, y)) {
                this.faceDown = true;
                return true;
            }
            if (shell.state === 'paused') {
                return false;
            }
            if (idx < 0 || shell.state === 'over') {
                return true;
            }
            if (button === 2) {
                if (this.open[idx]) {
                    return true;
                }
                this.ensureStarted(-1);
                this.toggleFlag(idx);
                return true;
            }
            this.pressed = idx;
            this.pressedButton = button;
            return true;
        }
        if (type === 'up') {
            if (this.faceDown) {
                this.faceDown = false;
                if (this.inFace(x, y)) {
                    this.newRound();
                }
                return true;
            }
            var target = this.pressed;
            var btn = this.pressedButton;
            this.pressed = -1;
            this.pressedButton = -1;
            if (target < 0 || target !== idx || shell.state === 'over' || shell.state === 'paused') {
                return true;
            }
            this.act(target, btn === 1 ? 'chord' : 'open');
            return true;
        }
        return false;
    };

    Mines.prototype.act = function (idx, action) {
        if (action === 'flag') {
            if (!this.open[idx]) {
                this.ensureStarted(-1);
                this.toggleFlag(idx);
            }
            return;
        }
        if (this.open[idx]) {
            this.chord(idx);
            return;
        }
        if (action === 'open' && !this.flag[idx]) {
            this.ensureStarted(idx);
            this.reveal(idx);
        }
    };

    Mines.prototype.newRound = function () {
        this.shell.toTitle();
        this.reset();
        this.shell.sound.play('select');
    };

    Mines.prototype.onKey = function (code, down) {
        if (!down) {
            return;
        }
        var cols = this.L.cols, rows = this.L.rows, state = this.shell.state;
        var moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (moves[code]) {
            this.cursorVisible = true;
            var c = U.clamp(this.cursor % cols + moves[code][0], 0, cols - 1);
            var r = U.clamp(Math.floor(this.cursor / cols) + moves[code][1], 0, rows - 1);
            this.cursor = r * cols + c;
            return;
        }
        if (code === 'KeyN') {
            this.newRound();
            return;
        }
        if (state === 'over') {
            if (code === 'Space' || code === 'Enter') {
                this.newRound();
            }
            return;
        }
        if (state === 'paused') {
            return;
        }
        if (code === 'Space' || code === 'Enter') {
            this.cursorVisible = true;
            this.act(this.cursor, 'open');
        } else if (code === 'KeyF') {
            this.cursorVisible = true;
            this.act(this.cursor, 'flag');
        }
    };

    // ---- update -----------------------------------------------------------------------------------

    Mines.prototype.update = function (dt) {
        this.clock += dt;
        if (this.timerRunning) {
            this.seconds = Math.min(999, this.seconds + dt);
        }
    };

    Mines.prototype.idle = function (dt) {
        var self = this;
        self.clock += dt;
        if (self.lost) {
            for (var i = 0; i < self.mine.length; i++) {
                if (self.mineAt[i] && !self.mineShown[i] && self.clock >= self.mineAt[i]) {
                    self.mineShown[i] = 1;
                    var p = self.cellPos(i);
                    self.shell.fx.burst(p.x + 8, p.y + 8, { count: 8, colors: ['#ffb43a', '#ff5a1a', '#444444'], speed: 45, life: 0.5 });
                    if (Math.random() < 0.3) {
                        self.shell.sound.play('hit');
                    }
                }
            }
        }
        if (self.confetti > 0) {
            self.confetti -= dt;
            if (Math.random() < 0.5) {
                self.shell.fx.burst(U.rand(self.boardX, self.boardX + self.L.cols * CELL), U.rand(self.boardY, self.boardY + 40), {
                    count: 10, colors: ['#ffd335', '#4cc2ff', '#ff5ac8', '#7cff6b', '#ffffff'], speed: 70, life: 1.3, gravity: 90
                });
            }
        }
    };

    // ---- render -----------------------------------------------------------------------------------

    Mines.prototype.render = function (ctx, state) {
        var L = this.L, W = this.W, H = this.H, S = sprites;
        ctx.fillStyle = C.face;
        ctx.fillRect(0, 0, W, H);
        bevel(ctx, 0, 0, W, H, true, 3);

        // level tabs
        var rects = this.tabRects(), self = this;
        rects.forEach(function (r, i) {
            var active = i === self.levelIndex;
            if (active) {
                ctx.fillStyle = '#000080';
                ctx.fillRect(r.x, r.y, r.w, r.h);
            }
            A.drawText(ctx, LEVELS[i].label, r.x + 5, r.y + 3, { color: active ? '#ffffff' : '#303030' });
        });

        // panel
        var px = BORDER, pw = W - 2 * BORDER;
        bevel(ctx, px, this.panelY, pw, PANEL_H, false, 2);
        drawLed(ctx, px + 7, this.panelY + 6, L.mines - this.flags);
        drawLed(ctx, px + pw - 7 - 41, this.panelY + 6, Math.floor(this.seconds));
        ctx.fillStyle = C.face;
        ctx.fillRect(this.faceX, this.faceY, 26, 26);
        var faceDown = this.faceDown && this.inFace(this.shell.pointerX, this.shell.pointerY);
        bevel(ctx, this.faceX, this.faceY, 26, 26, !faceDown, 2);
        var face = this.won ? S.cool : (this.lost ? S.dead : (this.pressed >= 0 && this.pressedButton === 0 ? S.oh : S.smile));
        ctx.drawImage(face, this.faceX + 5 + (faceDown ? 1 : 0), this.faceY + 5 + (faceDown ? 1 : 0));

        // board
        bevel(ctx, this.boardX - 3, this.boardY - 3, L.cols * CELL + 6, L.rows * CELL + 6, false, 3);
        var chordPreview = {};
        if (this.pressed >= 0 && this.open[this.pressed]) {
            this.neighbors(this.pressed).forEach(function (j) { chordPreview[j] = true; });
        }
        var hidden = state === 'paused';
        for (var i = 0; i < this.mine.length; i++) {
            var x = this.boardX + (i % L.cols) * CELL, y = this.boardY + Math.floor(i / L.cols) * CELL;
            var isOpen = this.open[i] && this.openAt[i] <= this.clock && !hidden;
            if (isOpen) {
                if (this.mine[i]) {
                    drawOpen(ctx, x, y, 0, '#ff1a1a');
                    ctx.drawImage(S.mine, x, y);
                } else {
                    drawOpen(ctx, x, y, this.adj[i]);
                }
                continue;
            }
            if (hidden) {
                drawHidden(ctx, x, y, false);
                continue;
            }
            if (this.lost && this.mine[i] && this.mineShown[i] && !this.flag[i]) {
                drawOpen(ctx, x, y, 0);
                ctx.drawImage(S.mine, x, y);
                continue;
            }
            if (this.lost && this.flag[i] && !this.mine[i]) {
                drawOpen(ctx, x, y, 0);
                ctx.drawImage(S.wrongFlag, x, y);
                continue;
            }
            var pressedLook = !this.flag[i] && state !== 'over' && (i === this.pressed || chordPreview[i]);
            if (pressedLook) {
                drawOpen(ctx, x, y, 0);
            } else {
                drawHidden(ctx, x, y, i === this.hover && state !== 'over' && !this.flag[i]);
                if (this.flag[i]) {
                    ctx.drawImage(S.flag, x, y);
                }
            }
        }

        if (this.cursorVisible && state !== 'over') {
            var cp = this.cellPos(this.cursor);
            ctx.strokeStyle = (Math.floor(this.clock * 4) % 2) ? '#ffd335' : '#000080';
            ctx.lineWidth = 1;
            ctx.strokeRect(cp.x + 0.5, cp.y + 0.5, CELL - 1, CELL - 1);
            ctx.strokeRect(cp.x + 1.5, cp.y + 1.5, CELL - 3, CELL - 3);
        }
    };

    Mines.prototype.renderTitle = function (ctx) {
        if (this.hover >= 0 || this.cursorVisible) {
            return;
        }
        this.banner(ctx, ['CLICK A CELL TO START'], '#ffffff');
    };

    Mines.prototype.renderGameOver = function (ctx) {
        if (this.won) {
            this.banner(ctx, ['CLEARED IN ' + Math.floor(this.seconds) + 'S!   ' + this.shell.score + ' PTS', this.shell.newBest ? 'NEW RECORD!' : 'CLICK THE FACE FOR A NEW GAME'], '#ffd335');
        } else {
            this.banner(ctx, ['BOOM!  ' + this.shell.score + ' PTS', 'CLICK THE FACE OR PRESS SPACE'], '#ff6a5a');
        }
        return true;
    };

    Mines.prototype.banner = function (ctx, lines, color) {
        var w = 0;
        lines.forEach(function (l) { w = Math.max(w, A.textWidth(l)); });
        w = Math.min(this.W - 8, w + 16);
        var h = lines.length * 11 + 8;
        var x = Math.floor((this.W - w) / 2), y = this.boardY + this.L.rows * CELL - h - 6;
        ctx.fillStyle = 'rgba(0, 0, 40, 0.82)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = color;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        for (var i = 0; i < lines.length; i++) {
            A.drawText(ctx, lines[i], this.W / 2, y + 5 + i * 11, { color: i === 0 ? color : '#ffffff', align: 'center' });
        }
    };

    // ---------------------------------------------------------------------------------------------
    // Launcher cover
    // ---------------------------------------------------------------------------------------------
    var cover = null;

    function buildCover() {
        var cols = 16, rows = 9, n = cols * rows, seed = 7;
        function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
        var mine = [], adj = [], open = [], i;
        for (i = 0; i < n; i++) { mine[i] = rnd() < 0.16 ? 1 : 0; open[i] = 0; }
        function nb(idx) {
            var r = Math.floor(idx / cols), c = idx % cols, out = [];
            for (var dr = -1; dr <= 1; dr++) {
                for (var dc = -1; dc <= 1; dc++) {
                    var rr = r + dr, cc = c + dc;
                    if ((dr || dc) && rr >= 0 && rr < rows && cc >= 0 && cc < cols) { out.push(rr * cols + cc); }
                }
            }
            return out;
        }
        for (i = 0; i < n; i++) { adj[i] = nb(i).reduce(function (s, j) { return s + mine[j]; }, 0); }
        var start = 4 * cols + 7;
        mine[start] = 0;
        nb(start).forEach(function (j) { mine[j] = 0; });
        for (i = 0; i < n; i++) { adj[i] = nb(i).reduce(function (s, j) { return s + mine[j]; }, 0); }
        var q = [start];
        while (q.length) {
            var k = q.shift();
            if (open[k]) { continue; }
            open[k] = 1;
            if (adj[k] === 0) { nb(k).forEach(function (j) { if (!open[j] && !mine[j]) { q.push(j); } }); }
        }
        cover = { cols: cols, rows: rows, mine: mine, adj: adj, open: open };
    }

    function drawCover(ctx, w, h, t) {
        buildSprites();
        if (!cover) {
            buildCover();
        }
        for (var i = 0; i < cover.cols * cover.rows; i++) {
            var x = (i % cover.cols) * CELL, y = Math.floor(i / cover.cols) * CELL;
            if (cover.open[i]) {
                drawOpen(ctx, x, y, cover.adj[i]);
            } else {
                drawHidden(ctx, x, y, false);
                if (cover.mine[i] && (i * 7) % 3 === 0) {
                    ctx.drawImage(sprites.flag, x, y);
                }
            }
        }
        ctx.fillStyle = 'rgba(0,0,40,0.75)';
        ctx.fillRect(w / 2 - 70, h - 34, 140, 24);
        ctx.drawImage(sprites.smile, w / 2 - 66, h - 30);
        A.drawText(ctx, 'MINESWEEPER', w / 2 + 12, h - 26, { color: '#ffd335', align: 'center' });
        if (Math.floor(t * 2) % 2) {
            ctx.drawImage(sprites.mine, 13 * CELL, 1 * CELL);
        }
    }

    A.registerGame({
        id: 'mines',
        title: 'MINESWEEPER',
        description: 'The office classic: clear the field without touching a mine. Three sizes, a safe first click, chording and a timer.',
        help: 'Left click <kbd>open</kbd> &middot; right click <kbd>flag</kbd> &middot; click a number <kbd>chord</kbd> &middot; arrows + <kbd>Space</kbd>/<kbd>F</kbd> &middot; <kbd>N</kbd> new game',
        width: 200,
        height: 220,
        keyStart: false,
        keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter', 'KeyF', 'KeyN'],
        create: function (shell) { return new Mines(shell); },
        drawCover: drawCover
    });
})();

;
/* ===== DEVArcadeQuiz.js ===== */
/*!
 * DEVArcadeQuiz.js - "D365 Data Quiz": multiple choice questions generated from live Dynamics 365 data.
 * The questions and the scoring live on the server (X++ class DEVQuizEngine, or DEVArcadeQuizMock.js locally);
 * this file is only the UI. The correct answer is never sent to the browser before the player answers.
 * Look: TV quiz show (stage lights, hexagonal answer bars, "final answer" lock-in, question ladder).
 */
(function () {
    'use strict';

    var A = window.DEVArcade;

    var CATEGORY_COLORS = {
        ORGANIZATION: '#4cc2ff', CUSTOMERS: '#7cff6b', VENDORS: '#ff9a2e', PRODUCTS: '#ffd335', SALES: '#ff5ac8',
        PURCHASING: '#b07cff', PAYMENTS: '#2ee6ff', PEOPLE: '#ff6b6b', SYSTEM: '#c9d1e8', FINANCE: '#3ef05a'
    };
    var REVEAL_DELAY = 1500;   // ms of "final answer" suspense before the result is shown
    var KEYS = ['A', 'B', 'C', 'D'];
    var QUESTIONS_PER_GAME = 10;

    function option(i) {
        return '<button type="button" class="devquiz-opt" data-act="answer" data-i="' + i + '">' +
            '<span class="devquiz-key">' + KEYS[i] + '</span><span class="devquiz-label"></span></button>';
    }

    var HTML =
        '<div class="devquiz devquiz-theme-gameshow">' +
        '  <div class="devquiz-bgfx"></div>' +
        '  <section class="devquiz-screen devquiz-title">' +
        '    <div class="devquiz-logo"><span class="devquiz-logo-tag">D365</span><span class="devquiz-logo-text">DATA QUIZ</span></div>' +
        '    <p class="devquiz-sub">How well do you know <b>your</b> Dynamics 365? Every question is generated by X++ from live data in this environment.</p>' +
        '    <ul class="devquiz-rules">' +
        '      <li><b>' + QUESTIONS_PER_GAME + '</b> questions, <b>20</b> seconds each</li>' +
        '      <li>Faster answers score more &middot; 3 right in a row <b>x1.5</b> &middot; 5 in a row <b>x2</b></li>' +
        '      <li>One <b>50:50</b> joker per game</li>' +
        '    </ul>' +
        '    <button type="button" class="devquiz-big" data-act="start">START QUIZ</button>' +
        '  </section>' +
        '  <section class="devquiz-screen devquiz-loading">' +
        '    <div class="devquiz-spinner"></div><p class="devquiz-loading-text">Querying your database...</p>' +
        '    <button type="button" class="devquiz-big devquiz-retry" data-act="start">TRY AGAIN</button>' +
        '  </section>' +
        '  <section class="devquiz-screen devquiz-q">' +
        '    <div class="devquiz-main">' +
        '      <div class="devquiz-top">' +
        '        <span class="devquiz-cat"></span><span class="devquiz-num"></span><span class="devquiz-spacer"></span>' +
        '        <span class="devquiz-streak"></span><span class="devquiz-pts">0 PTS</span>' +
        '      </div>' +
        '      <div class="devquiz-timer"><div class="devquiz-timer-bar"></div><span class="devquiz-timer-text">20</span></div>' +
        '      <div class="devquiz-clock"><span>20</span></div>' +
        '      <h2 class="devquiz-text"></h2>' +
        '      <div class="devquiz-options">' +
        '        <div class="devquiz-row">' + option(0) + option(1) + '</div>' +
        '        <div class="devquiz-row">' + option(2) + option(3) + '</div>' +
        '      </div>' +
        '      <div class="devquiz-tools">' +
        '        <button type="button" class="devquiz-joker" data-act="fifty" title="Remove two wrong answers (F)">50:50</button>' +
        '        <span class="devquiz-hint">Answer with <kbd>1</kbd>-<kbd>4</kbd> or <kbd>A</kbd>-<kbd>D</kbd></span>' +
        '      </div>' +
        '      <div class="devquiz-result">' +
        '        <div class="devquiz-verdict"></div>' +
        '        <p class="devquiz-expl"></p>' +
        '        <div class="devquiz-howto"><span>How X++ knows</span><code></code></div>' +
        '        <button type="button" class="devquiz-next" data-act="next">NEXT QUESTION &#9654;</button>' +
        '      </div>' +
        '    </div>' +
        '    <aside class="devquiz-ladder"><div class="devquiz-ladder-score">SCORE <b>0</b></div><ol></ol></aside>' +
        '  </section>' +
        '  <section class="devquiz-screen devquiz-final">' +
        '    <div class="devquiz-final-head">' +
        '      <div class="devquiz-badge"></div>' +
        '      <div class="devquiz-final-score"></div>' +
        '      <div class="devquiz-final-correct"></div>' +
        '      <div class="devquiz-final-best"></div>' +
        '    </div>' +
        '    <ol class="devquiz-review"></ol>' +
        '    <button type="button" class="devquiz-big" data-act="again">PLAY AGAIN</button>' +
        '  </section>' +
        '  <div class="devquiz-paused"><div>PAUSED</div><small>Press P or the play button to continue</small></div>' +
        '</div>';

    function Quiz(shell) {
        var self = this;
        self.shell = shell;
        self.token = 0;
        self.root = document.createElement('div');
        self.root.innerHTML = HTML;
        shell.dom.appendChild(self.root);
        self.box = self.root.querySelector('.devquiz');
        self.el = function (sel) { return self.root.querySelector(sel); };
        self.opts = Array.prototype.slice.call(self.root.querySelectorAll('.devquiz-opt'));
        self._onClick = function (e) {
            var b = e.target.closest ? e.target.closest('[data-act]') : null;
            if (!b || b.disabled) {
                return;
            }
            self.action(b.getAttribute('data-act'), Number(b.getAttribute('data-i')));
        };
        self.root.addEventListener('click', self._onClick);
        self.show('title');
    }

    Quiz.prototype.show = function (name) {
        var screens = this.root.querySelectorAll('.devquiz-screen');
        for (var i = 0; i < screens.length; i++) {
            screens[i].style.display = screens[i].classList.contains('devquiz-' + name) ? '' : 'none';
        }
        this.screen = name;
        this.box.setAttribute('data-screen', name);
    };

    Quiz.prototype.action = function (act, i) {
        var shell = this.shell;
        switch (act) {
            case 'start':
            case 'again':
                if (shell.state === 'playing' || shell.state === 'paused') {
                    shell.restart();
                } else {
                    shell.start();
                }
                break;
            case 'answer': this.answer(i); break;
            case 'next': this.next(); break;
            case 'fifty': this.fifty(); break;
        }
    };

    Quiz.prototype.request = function (name, payload, cb) {
        var self = this, token = self.token;
        self.busy = true;
        self.shell.request(name, payload, function (resp) {
            if (token !== self.token) {
                return;   // an old quiz: ignore
            }
            self.busy = false;
            if (!resp || resp.error) {
                self.fail(resp && resp.error ? resp.error : 'No response from the server');
                return;
            }
            cb(resp);
        });
    };

    Quiz.prototype.fail = function (message) {
        this.show('loading');
        this.box.classList.add('devquiz-has-error');
        this.el('.devquiz-loading-text').textContent = 'Something went wrong: ' + message;
    };

    // ---- ladder (game show theme) ------------------------------------------------------------------

    Quiz.prototype.buildLadder = function (total) {
        var ol = this.el('.devquiz-ladder ol');
        ol.innerHTML = '';
        this.ladder = [];
        for (var i = total; i >= 1; i--) {
            var li = document.createElement('li');
            li.innerHTML = '<span class="devquiz-ln"></span><span class="devquiz-lv"></span>';
            li.querySelector('.devquiz-ln').textContent = String(i);
            li.querySelector('.devquiz-lv').textContent = '· · ·';
            if (i === total || i === Math.ceil(total / 2)) {
                li.classList.add('devquiz-milestone');
            }
            ol.appendChild(li);
            this.ladder[i] = li;
        }
        this.el('.devquiz-ladder-score b').textContent = '0';
    };

    Quiz.prototype.ladderSet = function (index, cls, text) {
        var li = this.ladder && this.ladder[index];
        if (!li) {
            return;
        }
        li.classList.remove('devquiz-current', 'devquiz-done-ok', 'devquiz-done-ko');
        if (cls) {
            li.classList.add(cls);
        }
        if (text !== undefined) {
            li.querySelector('.devquiz-lv').textContent = text;
        }
    };

    // ---- lifecycle (called by the shell) -----------------------------------------------------------

    Quiz.prototype.newGame = function () {
        var self = this;
        self.token++;
        self.quizId = null;
        self.question = null;
        self.fiftyUsed = false;
        self.box.classList.remove('devquiz-has-error');
        self.el('.devquiz-loading-text').textContent = 'Querying your database...';
        self.el('.devquiz-pts').textContent = '0 PTS';
        self.el('.devquiz-streak').textContent = '';
        self.el('.devquiz-joker').disabled = false;
        self.show('loading');
        self.request('quizStart', { count: QUESTIONS_PER_GAME }, function (resp) {
            self.quizId = resp.quizId;
            self.buildLadder(resp.total);
            self.showQuestion(resp.question);
        });
    };

    Quiz.prototype.showQuestion = function (q) {
        var self = this;
        self.question = q;
        self.answered = false;
        self.elapsed = 0;
        self.lastTick = -1;
        var cat = self.el('.devquiz-cat');
        cat.textContent = q.category;
        self.box.style.setProperty('--devquiz-cat', CATEGORY_COLORS[q.category] || '#ffd335');
        self.el('.devquiz-num').textContent = 'QUESTION ' + q.index + ' / ' + q.total;
        self.el('.devquiz-text').textContent = q.text;
        self.opts.forEach(function (b, i) {
            b.className = 'devquiz-opt';
            b.disabled = false;
            b.querySelector('.devquiz-label').textContent = q.options[i] !== undefined ? q.options[i] : '';
            b.style.visibility = q.options[i] !== undefined ? '' : 'hidden';
        });
        self.el('.devquiz-result').classList.remove('devquiz-show');
        self.el('.devquiz-joker').disabled = self.fiftyUsed;
        self.ladderSet(q.index, 'devquiz-current', q.category);
        self.updateTimer();
        self.show('q');
        self.box.classList.remove('devquiz-reveal', 'devquiz-locked');
    };

    Quiz.prototype.update = function (dt) {
        if (this.screen !== 'q' || this.answered || !this.question) {
            return;
        }
        this.elapsed += dt;
        var remaining = this.question.seconds - this.elapsed;
        var whole = Math.ceil(remaining);
        if (whole <= 5 && whole !== this.lastTick && whole > 0) {
            this.lastTick = whole;
            this.shell.sound.play('tick');
        }
        this.updateTimer();
        if (remaining <= 0) {
            this.answer(-1);
        }
    };

    Quiz.prototype.updateTimer = function () {
        var q = this.question;
        if (!q) {
            return;
        }
        var remaining = Math.max(0, q.seconds - (this.elapsed || 0));
        var frac = remaining / q.seconds;
        var heat = remaining <= 5 ? ' devquiz-hot' : (remaining <= 10 ? ' devquiz-warm' : '');
        var bar = this.el('.devquiz-timer-bar');
        bar.style.width = (frac * 100) + '%';
        bar.className = 'devquiz-timer-bar' + heat;
        this.el('.devquiz-timer-text').textContent = String(Math.ceil(remaining));
        var clock = this.el('.devquiz-clock');
        clock.style.setProperty('--devquiz-p', frac.toFixed(3));
        clock.className = 'devquiz-clock' + heat;
        clock.firstChild.textContent = String(Math.ceil(remaining));
    };

    Quiz.prototype.answer = function (i) {
        var self = this, q = self.question;
        if (!q || self.answered || self.busy || self.shell.state !== 'playing') {
            return;
        }
        if (i >= 0 && self.opts[i].disabled) {
            return;
        }
        self.answered = true;
        self.opts.forEach(function (b, k) {
            b.disabled = true;
            if (k === i) {
                b.classList.add('devquiz-chosen');
            }
        });
        self.box.classList.add('devquiz-locked');
        self.el('.devquiz-joker').disabled = true;
        self.shell.sound.play('select');
        var asked = Date.now();
        self.request('quizAnswer', { quizId: self.quizId, questionId: q.id, answer: i, ms: Math.round(self.elapsed * 1000) }, function (r) {
            // keep the "final answer" suspense for a moment
            var wait = Math.max(0, (i >= 0 ? REVEAL_DELAY : 300) - (Date.now() - asked));
            if (!wait) {
                self.reveal(i, r);
                return;
            }
            var token = self.token;
            self.busy = true;
            setTimeout(function () {
                if (token === self.token) {
                    self.busy = false;
                    self.reveal(i, r);
                }
            }, wait);
        });
    };

    Quiz.prototype.reveal = function (chosen, r) {
        var self = this, shell = self.shell;
        self.box.classList.add('devquiz-reveal');
        self.opts.forEach(function (b, k) {
            if (k === r.correctIndex) {
                b.classList.add('devquiz-right');
            } else if (k === chosen) {
                b.classList.add('devquiz-wrong');
            }
        });
        var verdict = self.el('.devquiz-verdict');
        if (r.correct) {
            verdict.innerHTML = 'CORRECT! <b>+' + r.points + '</b>';
            verdict.className = 'devquiz-verdict devquiz-good';
            shell.sound.play('correct');
        } else {
            verdict.textContent = chosen < 0 ? "TIME'S UP!" : 'WRONG!';
            verdict.className = 'devquiz-verdict devquiz-bad';
            shell.sound.play('wrong');
        }
        self.ladderSet(self.question.index, r.correct ? 'devquiz-done-ok' : 'devquiz-done-ko', r.correct ? '+' + r.points : '✘');
        self.el('.devquiz-ladder-score b').textContent = String(r.score);
        self.el('.devquiz-expl').textContent = r.explanation || '';
        self.el('.devquiz-howto code').textContent = r.query || '';
        self.el('.devquiz-howto').style.display = r.query ? '' : 'none';
        self.el('.devquiz-next').innerHTML = r.last ? 'SEE RESULTS &#9654;' : 'NEXT QUESTION &#9654;';
        self.el('.devquiz-result').classList.add('devquiz-show');
        self.el('.devquiz-pts').textContent = r.score + ' PTS';
        self.el('.devquiz-streak').textContent = r.streak >= 2 ? 'STREAK x' + r.streak : '';
        shell.setScore(r.score);
        self.last = !!r.last;
        self.el('.devquiz-next').focus({ preventScroll: true });
    };

    Quiz.prototype.next = function () {
        var self = this;
        if (!self.answered || self.busy) {
            return;
        }
        self.shell.sound.play('select');
        self.request('quizNext', { quizId: self.quizId }, function (r) {
            if (r.done) {
                self.finish();
            } else {
                self.showQuestion(r.question);
            }
        });
    };

    Quiz.prototype.fifty = function () {
        var self = this, q = self.question;
        if (self.fiftyUsed || self.answered || self.busy || !q || self.shell.state !== 'playing') {
            return;
        }
        self.fiftyUsed = true;
        self.el('.devquiz-joker').disabled = true;
        self.shell.sound.play('powerup');
        self.request('quizFiftyFifty', { quizId: self.quizId, questionId: q.id }, function (r) {
            (r.remove || []).forEach(function (k) {
                self.opts[k].disabled = true;
                self.opts[k].classList.add('devquiz-gone');
            });
        });
    };

    Quiz.prototype.finish = function () {
        var self = this, shell = self.shell;
        self.request('quizFinish', { quizId: self.quizId }, function (r) {
            self.el('.devquiz-badge').textContent = r.title || '';
            self.el('.devquiz-final-score').textContent = r.score + ' PTS';
            self.el('.devquiz-final-correct').textContent = r.correct + ' OF ' + r.total + ' CORRECT';
            var list = self.el('.devquiz-review');
            list.innerHTML = '';
            (r.review || []).forEach(function (it) {
                var li = document.createElement('li');
                li.className = it.correct ? 'devquiz-ok' : 'devquiz-ko';
                li.innerHTML = '<span class="devquiz-mark"></span><span class="devquiz-rq"></span><span class="devquiz-ra"></span><span class="devquiz-rp"></span>';
                li.querySelector('.devquiz-mark').textContent = it.correct ? '✔' : '✘';
                li.querySelector('.devquiz-rq').textContent = it.text;
                li.querySelector('.devquiz-ra').textContent = it.correct ? it.right : it.answer + '  →  ' + it.right;
                li.querySelector('.devquiz-rp').textContent = it.points ? '+' + it.points : '';
                list.appendChild(li);
            });
            shell.setScore(r.score);
            self.show('final');
            shell.sound.play(r.correct * 2 >= r.total ? 'win' : 'lose');
            shell.gameOver({ reason: 'finished', correct: r.correct, total: r.total, title: r.title }, true);
            self.el('.devquiz-final-best').textContent = shell.newBest ? 'NEW PERSONAL BEST!' : 'BEST ' + shell.best;
        });
    };

    Quiz.prototype.onGameOver = function (details) {
        if (details && details.reason !== 'finished') {
            // stopped from outside (form button / restart): back to the title screen
            this.token++;
            this.show('title');
        }
    };

    Quiz.prototype.onPause = function () {
        this.box.classList.add('devquiz-is-paused');
    };

    Quiz.prototype.onResume = function () {
        this.box.classList.remove('devquiz-is-paused');
    };

    Quiz.prototype.onKey = function (code, down) {
        if (!down) {
            return;
        }
        var map = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, KeyA: 0, KeyB: 1, KeyC: 2, KeyD: 3 };
        if (this.screen === 'q') {
            if (map[code] !== undefined && !this.answered) {
                this.answer(map[code]);
            } else if ((code === 'Enter' || code === 'Space') && this.answered) {
                this.next();
            } else if (code === 'KeyF') {
                this.fifty();
            }
        } else if ((code === 'Enter' || code === 'Space') && (this.screen === 'title' || this.screen === 'final')) {
            this.action('start');
        }
    };

    Quiz.prototype.destroy = function () {
        this.root.removeEventListener('click', this._onClick);
    };

    // ---------------------------------------------------------------------------------------------
    // Launcher cover
    // ---------------------------------------------------------------------------------------------
    function drawCover(ctx, w, h, t) {
        var grd = ctx.createLinearGradient(0, 0, w, h);
        grd.addColorStop(0, '#0a1a3a');
        grd.addColorStop(1, '#2a0b3a');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
        A.drawText(ctx, '?', 36, 26 + Math.round(Math.sin(t * 2) * 3), { scale: 8, color: '#ffd335', shadow: '#000' });
        A.drawText(ctx, 'HOW MANY COMPANIES', 92, 22, { color: '#ffffff' });
        A.drawText(ctx, 'DO WE HAVE?', 92, 32, { color: '#ffffff' });
        var answers = ['18', '24', '31', '12'];
        var pick = Math.floor(t / 1.2) % 5;
        for (var i = 0; i < 4; i++) {
            var x = 92 + (i % 2) * 78, y = 52 + Math.floor(i / 2) * 26;
            var good = pick === 4 && i === 1;
            ctx.fillStyle = good ? '#1f7a33' : (pick === i ? '#2b3a6a' : '#151a2e');
            ctx.fillRect(x, y, 70, 20);
            ctx.strokeStyle = good ? '#7cff6b' : '#3a4680';
            ctx.strokeRect(x + 0.5, y + 0.5, 69, 19);
            A.drawText(ctx, 'ABCD'[i] + '  ' + answers[i], x + 6, y + 7, { color: good ? '#ffffff' : '#c9d1e8' });
        }
        ctx.fillStyle = '#ffd335';
        ctx.fillRect(92, 108, Math.round(148 * (1 - (t % 5) / 5)), 3);
        A.drawText(ctx, 'D365 DATA QUIZ', w / 2, h - 14, { color: '#ffd335', align: 'center', shadow: '#000' });
    }

    A.registerGame({
        id: 'quiz',
        title: 'D365 DATA QUIZ',
        description: 'Trivia about YOUR environment: companies, customers, orders, payments and more. X++ generates the questions from live data.',
        help: '<kbd>1</kbd>-<kbd>4</kbd> / <kbd>A</kbd>-<kbd>D</kbd> answer &middot; <kbd>Enter</kbd> next &middot; <kbd>F</kbd> 50:50 &middot; <kbd>P</kbd> pause &middot; <kbd>M</kbd> sound',
        canvas: false,
        keyStart: false,
        keys: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'KeyA', 'KeyB', 'KeyC', 'KeyD', 'KeyF', 'Enter', 'Space'],
        create: function (shell) { return new Quiz(shell); },
        drawCover: drawCover
    });
})();

;
/* ===== DEVTutorialArcadeControl.js ===== */
/*!
 * DEVTutorialArcadeControl - client side of the X++ extensible control DEVTutorialArcadeControl.
 * Connects the DEV Arcade games (DEVArcadeShell + games, bundled into DEVTutorialArcade.js) to X++.
 *
 * X++ -> JS (properties, observed here):
 *   GameId      'tank' | 'galaxy' | 'bricks' | 'mines' | 'quiz'   - which game to show
 *   HighScore   personal best of the current user, read by X++ from table DEVTutorialArcadeSession
 *   GameCommand 'start|n' | 'toggle|n' | 'stop|n'                 - the form buttons
 *
 * JS -> X++ (commands, $dyn.callFunction with string arguments):
 *   GameStarted()                    -> X++ inserts a session record, returns its RecId
 *   ScoreChanged(score)              -> X++ writes the live score to the session record
 *   GameOver(score, detailsJson)     -> X++ saves the result, returns 'NEWBEST' for a personal best
 *   QuizStart(count) / QuizAnswer(questionId, answer, ms) / QuizNext() / QuizFiftyFifty(questionId) / QuizFinish()
 *                                    -> X++ quiz engine (DEVTutorialArcadeQuizEngine), returns JSON
 *
 * All state of this control is kept in this.devArcade, so nothing can collide with members of $dyn.ui.Control.
 */
(function () {
    'use strict';

    var SCORE_INTERVAL = 1500;   // ms between live score updates sent to X++

    // quiz request name -> [X++ command, payload fields sent as string arguments]
    var QUIZ_COMMANDS = {
        quizStart: ['QuizStart', ['count']],
        quizAnswer: ['QuizAnswer', ['questionId', 'answer', 'ms']],
        quizNext: ['QuizNext', []],
        quizFiftyFifty: ['QuizFiftyFifty', ['questionId']],
        quizFinish: ['QuizFinish', []]
    };

    function parseJson(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            return { error: 'Invalid response from X++' };
        }
    }

    function logError(where, e) {
        if (window.console) {
            window.console.error('DEVTutorialArcadeControl ' + where + ':', e);
        }
    }

    /**
     * Wraps a callback so it runs after the current server interaction has finished.
     * $dyn.callFunction must not be called during an interaction: a game often makes its next server call
     * from the callback of the previous one (quiz: QuizNext -> QuizFinish -> GameOver), and that call would be lost.
     */
    function afterInteraction(callback) {
        return function (result) {
            if (callback) {
                window.setTimeout(function () { callback(result); }, 0);
            }
        };
    }

    $dyn.controls.DEVTutorialArcadeControl = function (props, element) {
        var self = this;
        $dyn.ui.Control.apply(self, arguments);

        var rootEl = element && element.jquery ? element[0] : element;   // DOM element or jQuery wrapper
        var st = self.devArcade = {
            props: props,
            hostEl: (rootEl && rootEl.querySelector('.devtutorialarcade-host')) || rootEl,
            shell: null,
            lastSeq: null,
            scoreTimer: 0,
            pendingScore: null
        };

        st.host = {
            getBest: function () {
                return Number($dyn.peek(props.HighScore)) || 0;
            },
            assetUrl: function (fileName) {
                return '/resources/images/' + fileName;
            },
            gameStarted: function (gameId, callback) {
                st.pendingScore = null;
                $dyn.callFunction(props.GameStarted, self, [], afterInteraction(callback));
            },
            scoreChanged: function (gameId, score) {
                // throttle: at most one server call every SCORE_INTERVAL ms, always with the latest score
                st.pendingScore = score;
                if (!st.scoreTimer) {
                    st.scoreTimer = window.setTimeout(function () { self.devArcadeSendScore(); }, SCORE_INTERVAL);
                }
            },
            gameOver: function (gameId, score, detailsJson, callback) {
                self.devArcadeCancelScore();
                $dyn.callFunction(props.GameOver, self, [String(score), detailsJson], afterInteraction(callback));
            },
            request: function (name, payload, callback) {
                var cmd = QUIZ_COMMANDS[name];
                if (!cmd) {
                    callback({ error: 'Unknown request ' + name });
                    return;
                }
                var args = cmd[1].map(function (k) { return payload[k] === undefined ? '' : String(payload[k]); });
                $dyn.callFunction(props[cmd[0]], self, args, afterInteraction(function (json) { callback(parseJson(json)); }));
            }
        };

        // X++ -> JS: which game to show (fires once on registration as well)
        self.usingDisposable($dyn.observe(props.GameId, function (gameId) {
            self.devArcadeLoad(gameId);
        }));

        // X++ -> JS: personal best read from the session table
        self.usingDisposable($dyn.observe(props.HighScore, function (best) {
            if (st.shell) {
                st.shell.setBest(best);
            }
        }));

        // X++ -> JS: form buttons. The first value is only remembered so a re-created control does not replay it.
        self.usingDisposable($dyn.observe(props.GameCommand, function (value) {
            var parts = (value || '').split('|'), seq = parts[1] || '';
            if (st.lastSeq === null) {
                st.lastSeq = seq;
                return;
            }
            if (!value || seq === st.lastSeq) {
                return;
            }
            st.lastSeq = seq;
            // leave the current server interaction first: the command may call back into X++
            window.setTimeout(function () {
                if (st.shell) {
                    try {
                        st.shell.command(parts[0]);
                    } catch (e) {
                        logError('command ' + parts[0], e);
                    }
                }
            }, 0);
        }));
    };

    $dyn.controls.DEVTutorialArcadeControl.prototype = $dyn.extendPrototype($dyn.ui.Control.prototype, {

        devArcadeLoad: function (gameId) {
            var st = this.devArcade;
            this.devArcadeCancelScore();
            if (st.shell) {
                try {
                    st.shell.destroy();
                } catch (e) {
                    logError('destroy', e);
                }
                st.shell = null;
            }
            if (!gameId) {
                return;
            }
            try {
                if (!window.DEVArcade || !window.DEVArcade.games || !window.DEVArcade.games[gameId]) {
                    throw new Error('the game scripts (DEVTutorialArcade.js) are not loaded or do not contain "' + gameId + '"');
                }
                st.shell = window.DEVArcade.create(st.hostEl, gameId, st.host, { maxHeight: 600 });
            } catch (e) {
                // show the problem in the control instead of breaking the D365 client
                logError('load ' + gameId, e);
                st.shell = null;
                var box = document.createElement('div');
                box.className = 'devtutorialarcade-error';
                box.textContent = 'DEV Arcade could not start "' + gameId + '": ' + (e && e.message ? e.message : e);
                st.hostEl.innerHTML = '';
                st.hostEl.appendChild(box);
            }
        },

        devArcadeSendScore: function () {
            var st = this.devArcade;
            st.scoreTimer = 0;
            if (st.pendingScore !== null && st.shell && st.shell.state === 'playing') {
                $dyn.callFunction(st.props.ScoreChanged, this, [String(st.pendingScore)]);
            }
            st.pendingScore = null;
        },

        devArcadeCancelScore: function () {
            var st = this.devArcade;
            if (st.scoreTimer) {
                window.clearTimeout(st.scoreTimer);
                st.scoreTimer = 0;
            }
            st.pendingScore = null;
        },

        dispose: function () {
            var st = this.devArcade;
            if (st) {
                this.devArcadeCancelScore();
                if (st.shell) {
                    try {
                        st.shell.destroy();
                    } catch (e) {
                        logError('dispose', e);
                    }
                    st.shell = null;
                }
            }
            $dyn.ui.Control.prototype.dispose.apply(this, arguments);
        }
    });
})();
