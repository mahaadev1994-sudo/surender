(() => {
  const canvas = document.getElementById('animation-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { alpha: false });

  // -------------------------------------------------------------
  // ADVANCED FRAME INTERPOLATION CONFIGURATION
  // 150 Frames + Optical Sub-Frame Crossfading = 60/120 FPS Fluidity
  // -------------------------------------------------------------
  const TOTAL_FRAMES = 150;
  const frameNumbers = [];
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    frameNumbers.push(Math.round(1 + (i / (TOTAL_FRAMES - 1)) * 299));
  }

  // Pre-decoded GPU Bitmap cache (ImageBitmap)
  const bitmaps = new Array(TOTAL_FRAMES);
  const isLoaded = new Array(TOTAL_FRAMES).fill(false);

  let targetFrame = 0;
  let currentFrame = 0;
  let lastDrawnFloat = -1;
  let isCanvasReady = false;

  // DOM Elements
  const hudFrame = document.getElementById('hud-frame');
  const hudScrubber = document.getElementById('hud-scrubber-bar');
  const hudHandle = document.getElementById('hud-scrubber-handle');
  const hudStatus = document.getElementById('hud-status');
  const scrubberTrack = document.getElementById('hud-scrubber-track');
  const toggleViewBtn = document.getElementById('toggle-view-btn');
  const audioToggleBtn = document.getElementById('audio-toggle-btn');
  const sideNavDots = document.querySelectorAll('.nav-dot');
  const sections = document.querySelectorAll('.story-section');

  // Milestone labels across the sequence
  const getMilestoneLabel = (idx) => {
    const progress = idx / (TOTAL_FRAMES - 1);
    if (progress < 0.15) return "Executive Welcome";
    if (progress < 0.35) return "Culinary Roots & Philosophy";
    if (progress < 0.60) return "Station Prep & Knife Work";
    if (progress < 0.85) return "Signature Plating & Precision";
    return "Executive Presentation";
  };

  const getFramePath = (filteredIndex) => {
    const originalFrameNumber = frameNumbers[filteredIndex];
    const frameNumStr = String(originalFrameNumber).padStart(3, '0');
    return `Images-jpg/ezgif-frame-${frameNumStr}.jpg`;
  };

  // Find nearest loaded bitmap fallback
  const getNearestLoadedBitmap = (target) => {
    if (isLoaded[target] && bitmaps[target]) return bitmaps[target];

    for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
      const prev = target - offset;
      if (prev >= 0 && isLoaded[prev] && bitmaps[prev]) return bitmaps[prev];

      const next = target + offset;
      if (next < TOTAL_FRAMES && isLoaded[next] && bitmaps[next]) return bitmaps[next];
    }
    return null;
  };

  // Canvas Resizing with DPR handling
  const resizeCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    isCanvasReady = true;
    lastDrawnFloat = -1;
  };

  // -------------------------------------------------------------
  // HARDWARE-ACCELERATED ASYNC BITMAP LOADER
  // -------------------------------------------------------------
  const loadFrameBitmap = async (idx) => {
    if (bitmaps[idx]) return bitmaps[idx];

    const path = getFramePath(idx);

    try {
      const res = await fetch(path);
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob);
      bitmaps[idx] = bmp;
      isLoaded[idx] = true;

      if (lastDrawnFloat === -1 && idx === 0) {
        drawBlendedFrame(0);
      }
      return bmp;
    } catch (err) {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = path;
        img.onload = () => {
          bitmaps[idx] = img;
          isLoaded[idx] = true;
          if (lastDrawnFloat === -1 && idx === 0) {
            drawBlendedFrame(0);
          }
          resolve(img);
        };
      });
    }
  };

  // Preload frames in priority batches
  const preloadAllFrames = async () => {
    // 1. Immediate Priority: Frame 0 & Frame 149
    await loadFrameBitmap(0);
    loadFrameBitmap(TOTAL_FRAMES - 1);

    // 2. High Priority: Keyframes every 5th frame
    for (let i = 5; i < TOTAL_FRAMES; i += 5) {
      loadFrameBitmap(i);
    }

    // 3. Progressive Background Pool
    const queue = [];
    for (let i = 1; i < TOTAL_FRAMES; i++) {
      if (!isLoaded[i]) queue.push(i);
    }

    const CONCURRENCY = 6;
    let active = 0;
    let queueIdx = 0;

    const nextBatch = () => {
      while (active < CONCURRENCY && queueIdx < queue.length) {
        const idxToLoad = queue[queueIdx++];
        active++;
        loadFrameBitmap(idxToLoad).finally(() => {
          active--;
          nextBatch();
        });
      }
    };
    nextBatch();
  };

  // -------------------------------------------------------------
  // OPTICAL SUB-FRAME CROSSFADING RENDERER
  // -------------------------------------------------------------
  const drawBlendedFrame = (floatIdx) => {
    const clamped = Math.max(0, Math.min(TOTAL_FRAMES - 1, floatIdx));
    const baseIdx = Math.floor(clamped);
    const nextIdx = Math.min(TOTAL_FRAMES - 1, baseIdx + 1);
    const frac = clamped - baseIdx;

    const baseBmp = getNearestLoadedBitmap(baseIdx);
    if (!baseBmp) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#06080c';
    ctx.fillRect(0, 0, width, height);

    const imgW = baseBmp.width || baseBmp.naturalWidth || 720;
    const imgH = baseBmp.height || baseBmp.naturalHeight || 1280;
    const scale = Math.min(width / imgW, height / imgH);

    const drawW = imgW * scale;
    const drawH = imgH * scale;

    let drawX;
    if (width > 1200 && !document.body.classList.contains('cinema-mode')) {
      drawX = (width * 0.68) - (drawW / 2);
    } else {
      drawX = (width - drawW) / 2;
    }
    const drawY = (height - drawH) / 2;

    // 1. Draw base frame
    ctx.drawImage(baseBmp, drawX, drawY, drawW, drawH);

    // 2. Optical crossfade with next frame
    if (frac > 0.02 && isLoaded[nextIdx] && bitmaps[nextIdx]) {
      ctx.globalAlpha = frac;
      ctx.drawImage(bitmaps[nextIdx], drawX, drawY, drawW, drawH);
      ctx.globalAlpha = 1.0;
    }

    lastDrawnFloat = floatIdx;

    // Update HUD display
    const currentInt = Math.round(floatIdx);
    const pct = (floatIdx / (TOTAL_FRAMES - 1)) * 100;
    if (hudFrame) hudFrame.textContent = `Frame ${String(currentInt + 1).padStart(3, '0')}/${TOTAL_FRAMES}`;
    if (hudScrubber) hudScrubber.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    if (hudHandle) hudHandle.style.left = `${Math.min(100, Math.max(0, pct))}%`;
    if (hudStatus) hudStatus.textContent = getMilestoneLabel(currentInt);
  };

  const getScrollTop = () => {
    return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
  };

  const getMaxScroll = () => {
    const scrollHeight = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight
    );
    return Math.max(1, scrollHeight - window.innerHeight);
  };

  // Sync target frame from native scroll position
  const updateTargetFromScroll = () => {
    const maxScroll = getMaxScroll();
    const scrollY = Math.max(0, Math.min(getScrollTop(), maxScroll));
    const progress = maxScroll > 0 ? scrollY / maxScroll : 0;
    targetFrame = progress * (TOTAL_FRAMES - 1);

    // Preload nearby frames
    const targetIdx = Math.round(targetFrame);
    for (let offset = -4; offset <= 4; offset++) {
      const idx = targetIdx + offset;
      if (idx >= 0 && idx < TOTAL_FRAMES && !isLoaded[idx]) {
        loadFrameBitmap(idx);
      }
    }
  };

  // Native scroll listener: 100% natural, hardware-composited browser scrolling
  window.addEventListener('scroll', updateTargetFromScroll, { passive: true });
  window.addEventListener('wheel', updateTargetFromScroll, { passive: true });

  // Smooth anchor navigation for all in-page links
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (targetId && targetId !== '#') {
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          e.preventDefault();
          targetEl.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });

  // -------------------------------------------------------------
  // CONTINUOUS 60/120 FPS RAF RENDER LOOP
  // -------------------------------------------------------------
  const renderLoop = () => {
    // Continuous floating-point lerp towards target frame
    const frameDiff = targetFrame - currentFrame;
    if (Math.abs(frameDiff) > 0.0005) {
      currentFrame += frameDiff * 0.18; // Smooth optical response
    } else {
      currentFrame = targetFrame;
    }

    if (isCanvasReady && Math.abs(currentFrame - lastDrawnFloat) > 0.003) {
      drawBlendedFrame(currentFrame);
    }

    requestAnimationFrame(renderLoop);
  };

  window.addEventListener('resize', () => {
    resizeCanvas();
    if (lastDrawnFloat !== -1) {
      drawBlendedFrame(lastDrawnFloat);
    }
  }, { passive: true });

  // -------------------------------------------------------------
  // INTERACTIVE SCRUBBER DRAG
  // -------------------------------------------------------------
  if (scrubberTrack) {
    let isScrubbing = false;

    const handleScrub = (e) => {
      const rect = scrubberTrack.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const fraction = x / rect.width;

      const maxScroll = getMaxScroll();
      window.scrollTo({ top: fraction * maxScroll, behavior: 'auto' });
      updateTargetFromScroll();
    };

    scrubberTrack.addEventListener('mousedown', (e) => {
      isScrubbing = true;
      handleScrub(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (isScrubbing) handleScrub(e);
    });

    window.addEventListener('mouseup', () => { isScrubbing = false; });

    scrubberTrack.addEventListener('touchstart', (e) => {
      isScrubbing = true;
      handleScrub(e);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (isScrubbing) handleScrub(e);
    }, { passive: true });

    window.addEventListener('touchend', () => { isScrubbing = false; });
  }

  // -------------------------------------------------------------
  // ACTIVE SIDE NAV DOTS (Intersection Observer)
  // -------------------------------------------------------------
  if (sections.length > 0 && sideNavDots.length > 0) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.getAttribute('data-nav');
          sideNavDots.forEach((dot) => {
            if (dot.getAttribute('data-section') === sectionId) {
              dot.classList.add('active');
            } else {
              dot.classList.remove('active');
            }
          });
        }
      });
    }, { threshold: 0.25 });

    sections.forEach((sec) => observer.observe(sec));
  }

  // -------------------------------------------------------------
  // 3D CARD TILT ON MOUSEMOVE
  // -------------------------------------------------------------
  const init3DTilt = () => {
    const cards = document.querySelectorAll('[data-tilt]');
    cards.forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = ((y - centerY) / centerY) * -4;
        const rotateY = ((x - centerX) / centerX) * 4;

        card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-2px)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)';
      });
    });
  };

  // -------------------------------------------------------------
  // CINEMA 3D MODE TOGGLE
  // -------------------------------------------------------------
  if (toggleViewBtn) {
    toggleViewBtn.addEventListener('click', () => {
      document.body.classList.toggle('cinema-mode');
      const isCinema = document.body.classList.contains('cinema-mode');
      toggleViewBtn.querySelector('.btn-label').textContent = isCinema ? 'Story Mode' : 'Cinema 3D';
      toggleViewBtn.querySelector('.btn-icon').textContent = isCinema ? '📖' : '👁️';
      lastDrawnFloat = -1;
    });
  }

  // -------------------------------------------------------------
  // OPTIONAL AMBIENCE AUDIO TOGGLE (Web Audio API)
  // -------------------------------------------------------------
  if (audioToggleBtn) {
    let audioCtx = null;
    let isPlaying = false;

    audioToggleBtn.addEventListener('click', () => {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }

      isPlaying = !isPlaying;
      audioToggleBtn.querySelector('.sound-icon').textContent = isPlaying ? '🔊' : '🔇';

      if (isPlaying && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      if (isPlaying) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(528, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 1.2);
      }
    });
  }

  // Header Scroll Blur
  const siteHeader = document.getElementById('site-header');
  window.addEventListener('scroll', () => {
    if (siteHeader) {
      if (window.scrollY > 40) {
        siteHeader.style.padding = '12px 40px';
        siteHeader.style.boxShadow = '0 12px 35px rgba(0, 0, 0, 0.75)';
      } else {
        siteHeader.style.padding = '16px 40px';
        siteHeader.style.boxShadow = 'none';
      }
    }
  }, { passive: true });

  // Initialization
  const init = () => {
    resizeCanvas();
    preloadAllFrames();
    updateTargetFromScroll();
    init3DTilt();
    requestAnimationFrame(renderLoop);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
