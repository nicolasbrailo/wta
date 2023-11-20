export function specPlot(ctx, renderCanvasId, cfg) {
  const analyser = ctx.createAnalyser();
  analyser.smoothingTimeConstant = 0;
  analyser.fftSize = cfg.fftSize || 2048;

  // Display constants
  const W = Math.round($(`#${renderCanvasId}`).width());
  const H = Math.round($(`#${renderCanvasId}`).height());

  // Size for each timeslice in the plot (which also determines the speed
  // with which the plot moves)
  const TIMESLICE_W = cfg.timeSliceWidthPx || 5;
  const MARGIN_BOTTOM = 20;
  const MARGIN_TOP = 20;
  const MARGIN_LEFT = 50;
  const MARGIN_RIGHT = 20;
  const PLOT_PADDING = 5;

  const tempCanvas = document.createElement('canvas');
  const displayCanvas = $(`#${renderCanvasId}`)[0];
  const displayCtx = displayCanvas.getContext('2d');
  const renderCtx = tempCanvas.getContext('2d');

  // Render helpers
  renderCtx.drawLine = (x1, y1, x2, y2, col=null) => {
    if (col !== null) {
      renderCtx.strokeStyle = col;
    }
    renderCtx.moveTo(x1, y1);
    renderCtx.lineTo(x2, y2);
  };

  const getColorForEnergy = (m) => {
    // Colors from view-source:https://academo.org/demos/spectrum-analyzer/demo.js
    if (m < 5) { return 'rgb(0,0,0)'; }
    if (m < 25) { return 'rgb(75, 0, 159)'; }
    if (m < 50) { return 'rgb(104,0,251)'; }
    if (m < 75) { return 'rgb(131,0,255)'; }
    if (m < 100) { return 'rgb(155,18,157)'; }
    if (m < 125) { return 'rgb(175, 37, 0)'; }
    if (m < 150) { return 'rgb(191, 59, 0)'; }
    if (m < 175) { return 'rgb(206, 88, 0)'; }
    if (m < 200) { return 'rgb(223, 132, 0)'; }
    if (m < 225) { return 'rgb(240, 188, 0)'; }
    return 'rgb(255, 252, 0)';
  };

  // Given an fft bin, return its start render position in [0, H]
  const binBW = (ctx.sampleRate / 2) / analyser.frequencyBinCount;
  const mel = (f) => { return 2595 * Math.log10(1 + (f / 700)); };
  const melLastBin = mel(binBW * analyser.frequencyBinCount);
  const binRenderStartY = (bin) => {
    const h01 = mel(binBW * bin) / melLastBin;
    return H * (1-h01) - (H+MARGIN_BOTTOM)/2;
  }

  // Ensure everything has the same size
  displayCanvas.height = H;
  displayCanvas.width = W;
  tempCanvas.height = H;
  tempCanvas.width = W;

  // Draw fixed parts of canvas
  displayCtx.beginPath();
  displayCtx.strokeStyle = 'black';
  displayCtx.lineWidth = 2;
  displayCtx.moveTo(MARGIN_LEFT, MARGIN_TOP);
  displayCtx.lineTo(MARGIN_LEFT, H-MARGIN_BOTTOM);
  displayCtx.moveTo(MARGIN_LEFT, H-MARGIN_BOTTOM);
  displayCtx.lineTo(W-MARGIN_LEFT, H-MARGIN_BOTTOM);
  displayCtx.stroke();

  let animation = null;
  const renderNextFrame = () => {
    // Copy current frame, shifted by one timeslice
    renderCtx.clearRect(0, 0, W, H);
    renderCtx.drawImage(displayCanvas, 0, 0, W, H, -TIMESLICE_W, 0, W, H);

    // fft
    const bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(bins);

    // Plot this timeslice
    const tPos = W - MARGIN_RIGHT - TIMESLICE_W;
    renderCtx.beginPath();
    for (let i=0; i < bins.length; ++i) {
      renderCtx.fillStyle = getColorForEnergy(bins[i]);
      renderCtx.fillRect(tPos, binRenderStartY(i), TIMESLICE_W, binRenderStartY(i+1));
    }
    renderCtx.stroke();

    // Copy to display
    displayCtx.drawImage(tempCanvas,
                        MARGIN_LEFT + PLOT_PADDING, MARGIN_BOTTOM + PLOT_PADDING, W, H,
                        MARGIN_LEFT + PLOT_PADDING, MARGIN_BOTTOM + PLOT_PADDING, W, H);

    // Register callback for next frame
    animation = requestAnimationFrame(renderNextFrame);
  };

  renderNextFrame();

  return {
    stop: () => {
      cancelAnimationFrame(animation);
    },

    connectInput: (node) => {
      node.connect(analyser);
    },
  };
}
