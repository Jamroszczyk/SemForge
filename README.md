# SemForge

Backendless single-page React app for creating and visualizing ontologies on an interactive canvas.

## Features

- **Infinite canvas** with pan/zoom (D3 force layout, matching the openaxon_demo graph feel)
- **Minimap** overview in the bottom-right corner
- **Double-click canvas** to add a new class sphere with inline label editing
- **Double-click a node** to re-focus its label for editing
- **Click outside** a node to unfocus the label
- **Single-click a node** to open the properties sidebar
- **Left sidebar** — collapsible list of all classes on the canvas
- **Right sidebar** — edit label, delete with confirmation modal
- **Drag nodes** — animated force simulation keeps spheres dynamically spaced

## Quick start

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`).

## Stack

- React 19 + TypeScript
- Vite
- D3 (force simulation, zoom/pan, drag)
