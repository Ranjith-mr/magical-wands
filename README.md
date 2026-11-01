# Magical Wands — Interactive Flower Garden

A React + Vite webcam experience using MediaPipe Hand Landmarker. Point your index finger to paint a flower trail; pinch thumb and index finger to create a flower burst.

## Requirements
- Node.js 18+ (Node 20 LTS recommended)
- VS Code
- Webcam
- Internet connection for the first model/WASM download and Google Fonts

## Run
```bash
npm install
npm run dev
```
Open the localhost URL printed by Vite (usually http://localhost:5173) and allow camera access.

## Build
```bash
npm run build
npm run preview
```

## Gestures
- Index finger extended: leaves flowers along the fingertip path.
- Thumb + index pinch: creates a burst of flowers.
- Change palette from the right-side controls.
- Clear garden removes the current blooms.

## Notes
- Camera access works on `localhost` or an HTTPS deployment.
- If GPU delegate initialization fails on a device, change `delegate: "GPU"` to `delegate: "CPU"` in `src/App.jsx`.
- This is an original recreation inspired by the visible interaction, not the original creator's source code or exact hidden gesture implementation.
