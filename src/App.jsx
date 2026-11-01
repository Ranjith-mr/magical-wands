 
import React, { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  FaceLandmarker,
} from "@mediapipe/tasks-vision";

const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const PALETTE = [
  ["#ffe066", "#fff4b8", "#d69c16"],
  ["#a78bfa", "#e4d9ff", "#6941c6"],
  ["#55d6ff", "#c8f3ff", "#1686bd"],
  ["#ff83bd", "#ffd7ea", "#c52c75"],
  ["#78f0b2", "#d5ffe8", "#23965d"],
  ["#ff9866", "#ffdfc9", "#c45122"],
];

const random = (min, max) => Math.random() * (max - min) + min;

function makeStar(x, y, burst = false) {
  const colors = PALETTE[Math.floor(Math.random() * PALETTE.length)];

  return {
    x,
    y,
    vx: burst ? random(-2.5, 2.5) : 0,
    vy: burst ? random(-2.5, 2.5) : 0,
    size: burst ? random(10, 24) : random(9, 17),
    rotation: random(0, Math.PI * 2),
    spin: burst ? random(-0.025, 0.025) : random(-0.008, 0.008),
    life: 1,
    decay: burst ? 0.012 : 0.001,
    colors,
    points: Math.random() > 0.7 ? 6 : 5,
  };
}

function drawStarPath(ctx, radius, points = 5) {
  const inner = radius * 0.43;

  ctx.beginPath();

  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? radius : inner;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }

  ctx.closePath();
}

function draw3DStar(ctx, star, time) {
  const { x, y, size, rotation, colors, life, points } = star;

  const pulse = 0.96 + Math.sin(time * 0.004 + x) * 0.04;
  const radius = size * pulse;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = Math.max(0, life);

  ctx.shadowColor = colors[0];
  ctx.shadowBlur = 18;

  // 3D depth
  for (let depth = 7; depth >= 1; depth--) {
    ctx.save();
    ctx.translate(depth * 0.8, depth * 0.8);
    drawStarPath(ctx, radius, points);
    ctx.fillStyle = colors[2];
    ctx.fill();
    ctx.restore();
  }

  // Gradient face
  const gradient = ctx.createLinearGradient(
    -radius, -radius, radius, radius
  );

  gradient.addColorStop(0, colors[1]);
  gradient.addColorStop(0.45, colors[0]);
  gradient.addColorStop(1, colors[2]);

  drawStarPath(ctx, radius, points);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Center highlight
  ctx.beginPath();
  ctx.arc(
    -radius * 0.12,
    -radius * 0.17,
    radius * 0.16,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();

  ctx.restore();
}

function drawSparkle(ctx, x, y, size, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#ffffff";

  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size * 0.15, -size * 0.15, size, 0);
  ctx.quadraticCurveTo(size * 0.15, size * 0.15, 0, size);
  ctx.quadraticCurveTo(-size * 0.15, size * 0.15, -size, 0);
  ctx.quadraticCurveTo(-size * 0.15, -size * 0.15, 0, -size);
  ctx.fill();

  ctx.restore();
}

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const stageRef = useRef(null);

  const handLandmarkerRef = useRef(null);
  const faceLandmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);

  const lastHandsRef = useRef([]);
  const starsRef = useRef([]);
  const particlesRef = useRef([]);

  // Separate gesture state for each hand.
  const handStateRef = useRef([
    { previous: null, pinching: false },
    { previous: null, pinching: false },
  ]);

  const lastHandDetectionRef = useRef(0);
  const lastFaceDetectionRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);

  const lastBurstRef = useRef([0, 0]);
  const lastBlowRef = useRef(0);
  const blowFramesRef = useRef(0);
  const lastCounterRef = useRef(0);

  const [cameraOn, setCameraOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(true);
  const [mirrored, setMirrored] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const [canvasHeight, setCanvasHeight] = useState(520);
  const [starCount, setStarCount] = useState(0);
  const [status, setStatus] = useState("Ready to create magic ✨");
  const [error, setError] = useState("");

  // Add a burst of stars.
  function addBurst(x, y) {
    for (let i = 0; i < 20; i++) {
      starsRef.current.push(makeStar(x, y, true));
    }

    for (let i = 0; i < 12; i++) {
      particlesRef.current.push({
        x,
        y,
        vx: random(-5, 5),
        vy: random(-5, 5),
        life: 1,
        size: random(2, 5),
      });
    }

    if (starsRef.current.length > 220) {
      starsRef.current.splice(0, starsRef.current.length - 220);
    }
  }

  // Clear the entire universe.
  function clearUniverse() {
    starsRef.current = [];
    particlesRef.current = [];

    handStateRef.current.forEach((hand) => {
      hand.previous = null;
      hand.pinching = false;
    });

    setStarCount(0);
    setStatus("Universe cleared ✨");
  }

  function eraseUniverse() {
    starsRef.current = [];
    particlesRef.current = [];

    handStateRef.current.forEach((hand) => {
      hand.previous = null;
    });

    setStarCount(0);
    setStatus("🌬️ Stars erased!");
  }

  // Check whether the index finger is raised.
  function isIndexFingerDrawing(hand) {
    if (!hand || hand.length < 21) return false;

    const indexExtended = hand[8].y < hand[6].y;
    const middleFolded = hand[12].y > hand[10].y;
    const ringFolded = hand[16].y > hand[14].y;
    const pinkyFolded = hand[20].y > hand[18].y;

    return (
      indexExtended &&
      middleFolded &&
      ringFolded &&
      pinkyFolded
    );
  }

  // Process both hands independently.
  function handleHands(landmarks, width, height, now) {
    const states = handStateRef.current;

    for (let i = 0; i < 2; i++) {
      const hand = landmarks[i];
      const state = states[i];

      if (!hand || hand.length < 21) {
        state.previous = null;
        state.pinching = false;
        continue;
      }

      const indexTip = hand[8];
      const thumbTip = hand[4];

      const x = (mirrored ? 1 - indexTip.x : indexTip.x) * width;
      const y = indexTip.y * height;

      // Pinch gesture
      const pinchDistance = Math.hypot(
        indexTip.x - thumbTip.x,
        indexTip.y - thumbTip.y
      );

      const isPinching = pinchDistance < 0.045;

      if (isPinching && !state.pinching) {
        if (now - lastBurstRef.current[i] > 450) {
          addBurst(x, y);
          lastBurstRef.current[i] = now;
          setStatus(i === 0 ? "✨ Left-hand star burst!" : "✨ Right-hand star burst!");
        }
      }

      state.pinching = isPinching;

      // Index finger drawing
      if (isIndexFingerDrawing(hand) && !isPinching) {
        const previous = state.previous;

        if (!previous) {
          starsRef.current.push(makeStar(x, y));
        } else {
          const distance = Math.hypot(
            x - previous.x,
            y - previous.y
          );

          if (distance > 12) {
            const steps = Math.min(5, Math.ceil(distance / 12));

            for (let j = 1; j <= steps; j++) {
              const t = j / steps;

              const newX = previous.x + (x - previous.x) * t;
              const newY = previous.y + (y - previous.y) * t;

              starsRef.current.push(makeStar(newX, newY));
            }
          }
        }

        state.previous = { x, y };
        setStatus(i === 0 ? "⭐ Left hand painting..." : "⭐ Right hand painting...");
      } else if (!isPinching) {
        state.previous = null;
      }
    }

    if (starsRef.current.length > 220) {
      starsRef.current.splice(0, starsRef.current.length - 220);
    }
  }

  // Face gesture detection.
  function detectBlowingGesture(result, now) {
    const categories =
      result?.faceBlendshapes?.[0]?.categories || [];

    const pucker =
      categories.find(
        (item) => item.categoryName === "mouthPucker"
      )?.score || 0;

    const funnel =
      categories.find(
        (item) => item.categoryName === "mouthFunnel"
      )?.score || 0;

    if (pucker > 0.4 || funnel > 0.4) {
      blowFramesRef.current += 1;
    } else {
      blowFramesRef.current = 0;
    }

    if (
      blowFramesRef.current >= 2 &&
      now - lastBlowRef.current > 1200
    ) {
      eraseUniverse();

      lastBlowRef.current = now;
      blowFramesRef.current = 0;
    }
  }

  // Main animation.
  function animate(now) {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      animationRef.current = requestAnimationFrame(animate);
      return;
    }

    const ctx = canvas.getContext("2d");

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    // Canvas uses its displayed size as its drawing coordinate space.
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    // Detect hands every 35ms, only once per video frame.
    if (
      handLandmarkerRef.current &&
      video.readyState >= 2 &&
      now - lastHandDetectionRef.current > 35 &&
      video.currentTime !== lastVideoTimeRef.current
    ) {
      lastHandDetectionRef.current = now;
      lastVideoTimeRef.current = video.currentTime;

      try {
        const result = handLandmarkerRef.current.detectForVideo(video, now);
        lastHandsRef.current = result.landmarks || [];
      } catch (err) {
        console.error("Hand detection error:", err);
      }
    }

    // Face detection.
    if (
      faceLandmarkerRef.current &&
      video.readyState >= 2 &&
      now - lastFaceDetectionRef.current > 100
    ) {
      lastFaceDetectionRef.current = now;

      try {
        const result = faceLandmarkerRef.current.detectForVideo(video, now);
        detectBlowingGesture(result, now);
      } catch (err) {
        console.error("Face detection error:", err);
      }
    }

    // Convert hand coordinates to the visible canvas.
    if (lastHandsRef.current.length > 0) {
      handleHands(lastHandsRef.current, width, height, now);
    } else {
      handStateRef.current.forEach((hand) => {
        hand.previous = null;
        hand.pinching = false;
      });
    }

    ctx.clearRect(0, 0, width, height);

    // Draw stars.
    starsRef.current = starsRef.current.filter((star) => {
      star.x += star.vx;
      star.y += star.vy;
      star.rotation += star.spin;
      star.life -= star.decay;

      if (star.decay > 0.005) {
        star.vy += 0.025;
      }

      if (star.life <= 0) return false;

      draw3DStar(ctx, star, now);
      return true;
    });

    // Draw burst particles.
    particlesRef.current = particlesRef.current.filter((particle) => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.08;
      particle.life -= 0.025;

      if (particle.life <= 0) return false;

      drawSparkle(
        ctx,
        particle.x,
        particle.y,
        particle.size,
        particle.life
      );

      return true;
    });

    // Show both fingertip cursors.
    lastHandsRef.current.forEach((hand) => {
      if (isIndexFingerDrawing(hand)) {
        const tip = hand[8];
        const px = (mirrored ? 1 - tip.x : tip.x) * width;
        const py = tip.y * height;

        drawSparkle(ctx, px, py, 7, 0.9);
      }
    });

    if (now - lastCounterRef.current > 200) {
      lastCounterRef.current = now;
      setStarCount(starsRef.current.length);
    }

    animationRef.current = requestAnimationFrame(animate);
  }

  // Start camera and models.
  async function startCamera() {
    try {
      setError("");
      setLoading(true);
      setStatus("Requesting camera...");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });

      streamRef.current = stream;

      const video = videoRef.current;
      video.srcObject = stream;

      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = reject;
      });

      await video.play();

      setStatus("Loading MediaPipe models...");

      const vision = await FilesetResolver.forVisionTasks(WASM_URL);

      // Two-hand tracking.
      try {
        handLandmarkerRef.current =
          await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: HAND_MODEL,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numHands: 2,
          });
      } catch (gpuError) {
        console.warn("GPU hand tracking unavailable; using CPU.", gpuError);

        handLandmarkerRef.current =
          await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: HAND_MODEL,
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            numHands: 2,
          });
      }

      setStatus("Loading face tracking...");

      try {
        faceLandmarkerRef.current =
          await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: FACE_MODEL,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            outputFaceBlendshapes: true,
            numFaces: 1,
          });
      } catch (gpuError) {
        console.warn("GPU face tracking unavailable; using CPU.", gpuError);

        faceLandmarkerRef.current =
          await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: FACE_MODEL,
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            outputFaceBlendshapes: true,
            numFaces: 1,
          });
      }

      lastHandsRef.current = [];

      handStateRef.current = [
        { previous: null, pinching: false },
        { previous: null, pinching: false },
      ];

      lastVideoTimeRef.current = -1;
      lastHandDetectionRef.current = 0;
      lastFaceDetectionRef.current = 0;

      setCameraOn(true);
      setLoading(false);
      setStatus("Show one or both hands to paint ⭐");

      animationRef.current = requestAnimationFrame(animate);
    } catch (err) {
      console.error(err);

      setLoading(false);
      setCameraOn(false);

      setError(err?.message || "Unable to start camera or load models.");
      setStatus("Camera or model error");

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      handLandmarkerRef.current?.close();
      faceLandmarkerRef.current?.close();
      handLandmarkerRef.current = null;
      faceLandmarkerRef.current = null;
    }
  }

  // Stop camera.
  function stopCamera() {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    handLandmarkerRef.current?.close();
    faceLandmarkerRef.current?.close();

    handLandmarkerRef.current = null;
    faceLandmarkerRef.current = null;

    lastHandsRef.current = [];

    handStateRef.current = [
      { previous: null, pinching: false },
      { previous: null, pinching: false },
    ];

    setCameraOn(false);
    setStatus("Camera stopped");
  }

  // Fullscreen drawing area.
  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await stageRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
      setError("Fullscreen is not available in this browser.");
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      handLandmarkerRef.current?.close();
      faceLandmarkerRef.current?.close();
    };
  }, []);

  // Responsive design.
  const styles = `
    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: #090817;
    }

    .wand-app {
      min-height: 100vh;
      padding: 30px 18px 45px;
      color: white;
      background:
        radial-gradient(ellipse at 50% 0%, #30205c 0%, transparent 45%),
        linear-gradient(135deg, #090817, #111329 55%, #170c2b);
      font-family: Inter, system-ui, sans-serif;
    }

    .wand-container {
      width: 100%;
      max-width: 1150px;
      margin: auto;
    }

    .wand-heading {
      text-align: center;
      margin-bottom: 24px;
    }

    .wand-heading h1 {
      font-size: clamp(30px, 5vw, 48px);
      margin: 0 0 9px;
      background: linear-gradient(90deg, #fff, #c9a6ff, #7ee7ff);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }

    .wand-heading p {
      color: #bcb9d7;
      margin: 0;
    }

    .wand-stage {
      position: relative;
      width: 100%;
      overflow: hidden;
      border: 1px solid rgba(195,170,255,.45);
      border-radius: 22px;
      background: #070713;
      box-shadow: 0 0 45px rgba(134,79,255,.2);
      transition: height .2s ease;
    }

    .wand-stage:fullscreen {
      width: 100vw;
      height: 100vh !important;
      border: 0;
      border-radius: 0;
      background: #070713;
    }

    .wand-stage video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: #070713;
    }

    .wand-stage video.mirror {
      transform: scaleX(-1);
    }

    .wand-stage canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .wand-status,
    .wand-count {
      position: absolute;
      top: 14px;
      z-index: 2;
      padding: 9px 14px;
      background: rgba(10,10,25,.78);
      border: 1px solid rgba(255,255,255,.2);
      border-radius: 30px;
      color: white;
      font-size: 13px;
    }

    .wand-status { left: 14px; }
    .wand-count { right: 14px; color: #ffe99a; }

    .wand-placeholder {
      position: absolute;
      inset: 0;
      display: grid;
      place-content: center;
      text-align: center;
      color: #d4c9ff;
      gap: 12px;
      pointer-events: none;
    }

    .wand-placeholder strong { font-size: 26px; }

    .wand-controls {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 11px;
      margin: 19px 0;
    }

    .wand-button {
      border: 1px solid rgba(255,255,255,.2);
      border-radius: 12px;
      padding: 12px 19px;
      color: white;
      font-weight: 650;
      cursor: pointer;
      background: linear-gradient(135deg, #7852d8, #4a3a9c);
      transition: transform .15s ease, opacity .15s ease;
    }

    .wand-button:hover { transform: translateY(-2px); }

    .wand-button.secondary { background: #25243d; }

    .wand-button:disabled {
      opacity: .55;
      cursor: wait;
    }

    .wand-settings {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      margin: 18px 0;
    }

    .wand-setting {
      padding: 16px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,.12);
      background: rgba(255,255,255,.055);
    }

    .wand-setting label {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 12px;
      font-size: 13px;
      color: #ded7ff;
    }

    .wand-setting input {
      width: 100%;
      accent-color: #a78bfa;
      cursor: pointer;
    }

    .wand-instructions {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 13px;
      margin-top: 24px;
    }

    .wand-card {
      padding: 17px;
      background: rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.1);
      border-radius: 15px;
    }

    .wand-card h3 {
      margin: 0 0 7px;
      font-size: 16px;
    }

    .wand-card p {
      margin: 0;
      color: #bbb8d0;
      font-size: 13px;
      line-height: 1.6;
    }

    .wand-error {
      color: #ffaaaa;
      text-align: center;
      overflow-wrap: anywhere;
      margin: 12px 0;
    }

    .wand-footer {
      text-align: center;
      margin-top: 22px;
      color: #9b96b9;
      font-size: 12px;
    }

    @media(max-width: 650px) {
      .wand-app { padding: 20px 12px; }
      .wand-instructions { grid-template-columns: 1fr; }
      .wand-settings { grid-template-columns: 1fr; }
      .wand-stage { border-radius: 14px; }
      .wand-status, .wand-count {
        top: 9px;
        padding: 7px 9px;
        font-size: 11px;
      }
      .wand-status { left: 8px; }
      .wand-count { right: 8px; }
    }
  `;

  return (
    <>
      <style>{styles}</style>

      <main className="wand-app">
        <div className="wand-container">

          <header className="wand-heading">
            <h1>✨ Magical Wands 2.0 ✨</h1>
            <p>Two hands. Infinite stars. One magical universe.</p>
          </header>

          <section
            ref={stageRef}
            className="wand-stage"
            style={{
              height: fullscreen ? "100vh" : `${canvasHeight}px`,
            }}
          >
            {showCamera && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={mirrored ? "mirror" : ""}
              />
            )}

            <canvas ref={canvasRef} />

            <div className="wand-status">{status}</div>
            <div className="wand-count">⭐ Stars: {starCount}</div>

            {!cameraOn && (
              <div className="wand-placeholder">
                <strong>✨ Your magical universe awaits</strong>
                <span>Start the camera to begin painting</span>
              </div>
            )}

            {!showCamera && cameraOn && (
              <div className="wand-placeholder">
                <strong>✨ Magical Drawing Mode</strong>
                <span>Your hand tracking is still active</span>
              </div>
            )}
          </section>

          <div className="wand-controls">
            {!cameraOn ? (
              <button
                className="wand-button"
                onClick={startCamera}
                disabled={loading}
              >
                {loading ? "Loading models..." : "📷 Start Camera"}
              </button>
            ) : (
              <button
                className="wand-button"
                onClick={stopCamera}
              >
                Stop Camera
              </button>
            )}

            <button
              className="wand-button secondary"
              onClick={clearUniverse}
            >
              Clear Universe
            </button>

            <button
              className="wand-button secondary"
              onClick={toggleFullscreen}
            >
              {fullscreen ? "⤢ Exit Fullscreen" : "⛶ Fullscreen"}
            </button>
          </div>

          <section className="wand-settings">

            <div className="wand-setting">
              <label>
                <span>Drawing Canvas Height</span>
                <strong>{canvasHeight}px</strong>
              </label>

              <input
                type="range"
                min="300"
                max="850"
                step="10"
                value={canvasHeight}
                disabled={fullscreen}
                onChange={(e) => setCanvasHeight(Number(e.target.value))}
              />
            </div>

            <div className="wand-setting">
              <label>
                <span>Camera Preview</span>
                <strong>{showCamera ? "Visible" : "Hidden"}</strong>
              </label>

              <button
                className="wand-button secondary"
                onClick={() => setShowCamera((value) => !value)}
              >
                {showCamera ? "Hide Camera" : "Show Camera"}
              </button>

              <button
                className="wand-button secondary"
                style={{ marginLeft: 8 }}
                onClick={() => setMirrored((value) => !value)}
              >
                {mirrored ? "Unmirror" : "Mirror"}
              </button>
            </div>

          </section>

          {error && (
            <div className="wand-error">Error: {error}</div>
          )}

          <section className="wand-instructions">

            <article className="wand-card">
              <h3>⭐ Two-Hand Drawing</h3>
              <p>
                Raise the index finger on either hand and fold
                the other fingers. Both hands can paint at once.
              </p>
            </article>

            <article className="wand-card">
              <h3>✨ Star Explosion</h3>
              <p>
                Pinch your thumb and index finger on either hand
                to create a magical star burst.
              </p>
            </article>

            <article className="wand-card">
              <h3>🌬️ Blow to Erase</h3>
              <p>
                Pucker your lips to clear all stars from
                your magical universe.
              </p>
            </article>

          </section>

          <footer className="wand-footer">
            Magical Wands 2.0 · Powered by MediaPipe Hand and Face Tracking
          </footer>

        </div>
      </main>
    </>
  );
}
