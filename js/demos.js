import {exp01ToF, fromDb, linToDb, getUserMic, UserMicRecorder, visSpect01ToRGB, webAudioFrameRMS } from './audioHelpers.js';
import {PSTNizer} from './pstnizer.js';
import {VHSEffect} from './vhs.js';
import {Underwater} from './underwater.js';
import {demo_shifting_peaks} from './demo_shifting_peaks.js';
import {demo_waveforms} from './waveforms.js';
import AudioMotionAnalyzer from 'https://cdn.skypack.dev/audiomotion-analyzer?min';

export async function is_this_on(ctx) {
  let mic = ctx.createMediaStreamSource(await getUserMic());
  mic.connect(ctx.destination);
  return () => {
    mic.disconnect();
    mic = null;
  };
}

export async function shifting_peaks(ctx) {
  return demo_shifting_peaks(ctx);
}

export async function fft_3d(ctx) {
  let mic = ctx.createMediaStreamSource(await getUserMic());
  const analyser = ctx.createAnalyser();
  analyser.smoothingTimeConstant = 0;
  analyser.fftSize = 2048;
  mic.connect(analyser);

  // Display constants
  const W = Math.round($("#fft_3d_canvas").width());
  const H = Math.round($("#fft_3d_canvas").height());
  // Size for each timeslice in the plot (which also determines the speed
  // with which the plot moves)
  const TIMESLICE_W = 8;

  const tempCanvas = document.createElement('canvas');
  const displayCanvas = $("#fft_3d_canvas")[0];
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

  // Ensure everything has the same size
  displayCanvas.height = H;
  displayCanvas.width = W;
  tempCanvas.height = H;
  tempCanvas.width = W;

  // Draw fixed parts of canvas
  displayCtx.beginPath();
  displayCtx.strokeStyle = 'red';
  displayCtx.lineWidth = 2;
  displayCtx.moveTo(20, 20);
  displayCtx.lineTo(20, H-20);
  displayCtx.moveTo(20, H-20);
  displayCtx.lineTo(W-20, H-20);
  displayCtx.stroke();

  let animation = null;
  const renderNextFrame = () => {
    // Copy current frame, shifted by one timeslice
    renderCtx.clearRect(0, 0, W, H);
    renderCtx.drawImage(displayCanvas, 0, 0, W, H, -TIMESLICE_W, 0, W, H);

    // fft
    const bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(bins);

    const binRenderStartY = (bin) => {
      const binW = 48000 / 2 / analyser.frequencyBinCount;
      const mel = (f) => { return 2595 * Math.log10(1 + (f / 700)); };
      const h01 = mel(binW * bin) / mel(binW * analyser.frequencyBinCount);
      return H*(1-h01) - 410;
    }

    // Plot this timeslice
    const fHeight = Math.floor((H - 20) / bins.length);
    const tPos = W - 20;
    renderCtx.beginPath();
    for (let i=0; i < bins.length; ++i) {
      renderCtx.fillStyle = getColorForEnergy(bins[i]);
      renderCtx.fillRect(tPos-TIMESLICE_W, binRenderStartY(i), TIMESLICE_W, binRenderStartY(i+1));
    }
    renderCtx.stroke();

    // Copy to display
    displayCtx.drawImage(tempCanvas, 25, 25, W, H, 25, 25, W, H);

    // Register callback for next frame
    animation = requestAnimationFrame(renderNextFrame);
  };

  renderNextFrame();

  return () => {
    cancelAnimationFrame(animation);
    mic.disconnect();
    mic = null;
  };
}


export async function waveforms(ctx) {
  return demo_waveforms(ctx);
}

export async function hearing_colors(ctx) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.setValueAtTime(0, 0, 0);
  gain.gain.setValueAtTime(0.1, 0);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();

  $('#hearing_colors_slider')[0].addEventListener('input', (e) => {
    const p = e.target.value / 100;

    const soundF = exp01ToF(p);
    osc.frequency.setTargetAtTime(soundF, 0, 0);

    const bg = visSpect01ToRGB(p);
    var canvas = $('#hearing_colors_canvas')[0];
    var canvasCtx = canvas.getContext('2d');
    canvasCtx.fillStyle = "rgb("+bg[0]+','+bg[1]+','+bg[2]+")";
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    canvasCtx.stroke();
  });

  return () => {
    osc.disconnect();
    gain.disconnect();
  };
}

export async function every_sample_counts(ctx) {
  function linkMediaControls(primary, secondary) {
    const timeSync = () => { secondary.currentTime = primary.currentTime;  };
    primary.addEventListener('seeking', timeSync);
    primary.addEventListener('ended', timeSync);
    primary.addEventListener('play', _ => { timeSync(); secondary.play(); });
    primary.addEventListener('pause', _ => { timeSync(); secondary.pause(); });
  }

  const vid = $('#every_sample_counts_video')[0];
  const aud = $('#every_sample_counts_audio')[0];
  linkMediaControls(vid, aud);

  const src = ctx.createMediaElementSource(aud);
  const frameDropper = new AudioWorkletNode(ctx, 'framedropper');
  frameDropper.parameters.get('drop_n').setValueAtTime(0, 0);
  frameDropper.parameters.get('group_size').setValueAtTime(24, 0);

  src.connect(frameDropper);
  frameDropper.connect(ctx.destination);

  for (const fps of [24, 15, 10, 5]) {
    $(`#every_sample_counts_${fps}`)[0].addEventListener('click', () => {
      const drop = 24 - fps;
      frameDropper.parameters.get('drop_n').setValueAtTime(drop, 0);
    });
  }

  return () => {
    vid.pause();
    aud.pause();
    src.disconnect();
    frameDropper.disconnect();
  };
}

export async function lossily_hear_yourself(ctx) {
  const recorder = new UserMicRecorder(ctx);

  const frameDropper = new AudioWorkletNode(ctx, 'framedropper');
  frameDropper.parameters.get('drop_n').setValueAtTime(0, 0);
  frameDropper.parameters.get('group_size').setValueAtTime(100, 0);

  recorder.connect(frameDropper);
  frameDropper.connect(ctx.destination);

  $('#lossily_hear_yourself_rec')[0].addEventListener('click', async () => {
    if (!recorder.isRecording()) {
      await recorder.record(await getUserMic());
    } else {
      recorder.stopRecording();
    }
  });

  $('#lossily_hear_yourself_play')[0].addEventListener('click', () => {
    recorder.togglePlayLoop();
  });

  $('#lossily_hear_yourself_slider')[0].addEventListener('input', (e) => {
    frameDropper.parameters.get('drop_n').setValueAtTime(e.target.value, 0);
  });

  return () => {
    recorder.disconnect();
    frameDropper.disconnect();
  };
}

export async function effects(ctx) {
  let mic_on = true;
  let mic = ctx.createMediaStreamSource(await getUserMic());
  const mic_gain = ctx.createGain();
  const srcs = [ctx.createMediaElementSource($('#effects_music1')[0]),
                ctx.createMediaElementSource($('#effects_music2')[0]),
                ctx.createMediaElementSource($('#effects_voice1')[0]),
                mic_gain];

  const src_bus = ctx.createGain();
  src_bus.gain.setValueAtTime(1, ctx.currentTime);

  let audioMotion = null;

  const mkNewSpec = () => {
    return new AudioMotionAnalyzer(
                          document.getElementById('effects_graph_container'),
                          {
                            audioCtx: ctx,
                            connectSpeakers: true, // Implicit sink to speakers
                            //noteLabels: true,
                            maxFreq: 16000,
                            minFreq: 30,
                            height: window.innerHeight - 200,
                            mode: 1,
                            barSpace: .6,
                            ledBars: true,
                            weightingFilter: "D",
                          }
                        );
  };

  const vhs = new VHSEffect(ctx);
  const pstnizer = new PSTNizer(ctx);
  const underwater = new Underwater(ctx);

  const applyEffectNone = () => {
    mic.connect(mic_gain);
    for (let s of srcs) {
      s.connect(src_bus);
    }
    audioMotion = mkNewSpec();
    audioMotion.connectInput(src_bus);
  };

  const clearAll = () => {
    audioMotion.destroy();
    vhs.disconnect();
    pstnizer.disconnect();
    underwater.disconnect();
    src_bus.disconnect();
    for (let s of srcs) {
      s.disconnect();
    }
  };

  const applyEffect = (e) => {
    clearAll();
    mic.connect(mic_gain);
    for (let s of srcs) {
      s.connect(src_bus);
    }
    e.connectInput(src_bus);
    audioMotion = mkNewSpec();
    audioMotion.connectInput(e.getOutput());
  };

  $('#effects_name').change(() => {
    const effect = $('#effects_name').find(":selected").val();
    if (effect == "none") {
      applyEffectNone();
    } else if (effect == "vhs") {
      applyEffect(vhs);
    } else if (effect == "pstn") {
      applyEffect(pstnizer);
    } else if (effect == "underwater") {
      applyEffect(underwater);
    } else {
      console.error("Unknown effect", effect);
    }
  });

  $('#effects_mic_toggle')[0].addEventListener('click', () => {
    mic_on = ! mic_on;
    $('#effects_mic_toggle').text(mic_on? "Disable mic" : "Enable mic");
    mic_gain.gain.setValueAtTime(mic_on? 1 : 0, ctx.currentTime);
  });

  applyEffectNone();
  return () => {
    clearAll();
    mic.disconnect();
    mic = null;
  };
}

export async function echo_echo_echo_echo(ctx) {
  let mic = ctx.createMediaStreamSource(await getUserMic());
  const micGain = ctx.createGain();
  const micInfo = ctx.createAnalyser();
  const aecAttenuation = ctx.createGain();
  const delay = ctx.createDelay(/*maxDelaySecs=*/5);

  micInfo.fftSize = 2048;
  const signal = new Uint8Array(micInfo.fftSize);

  let attenuationNow = 20;
  let delayNow = 500;

  // Value not-very-carefully tuned to get an RMS similar to a webrtc call in a MacPro
  let micGainNow = 9;

  const setGainsAndDelay = () => {
    micGain.gain.setValueAtTime(1+fromDb(micGainNow), ctx.currentTime);
    aecAttenuation.gain.setValueAtTime(1/fromDb(attenuationNow), ctx.currentTime);
    delay.delayTime.setValueAtTime(delayNow/1000, ctx.currentTime);

    micInfo.getByteTimeDomainData(signal);
    const rms = linToDb(webAudioFrameRMS(signal));
    console.log("Echo delay=", delayNow, "ms, echo attenuation=", attenuationNow, "dB, mic gain=", micGainNow, "mic rms=", rms);

    $('#echo_echo_echo_echo_attenuation_lbl').text("Echo attenuation: " + attenuationNow + " dB");
    $('#echo_echo_echo_echo_delay_lbl').text("Echo delay: " + delayNow + " ms");
    $('#echo_echo_echo_echo_mic_gain_lbl').text("Mic gain: " + micGainNow + " dB");

    // These should be safe because they don't generate an event
    $('#echo_echo_echo_echo_attenuation').val(attenuationNow);
    $('#echo_echo_echo_echo_delay').val(delayNow);
    $('#echo_echo_echo_echo_mic_gain').val(micGainNow);
  }

  setGainsAndDelay();

  mic.connect(micGain);
  micGain.connect(micInfo);
  micInfo.connect(delay);
  delay.connect(aecAttenuation);
  aecAttenuation.connect(ctx.destination);

  $('#echo_echo_echo_echo_attenuation')[0].addEventListener('input', (e) => {
    attenuationNow = e.target.value;
    setGainsAndDelay();
  });

  $('#echo_echo_echo_echo_delay')[0].addEventListener('input', (e) => {
    delayNow = e.target.value;
    setGainsAndDelay();
  });

  $('#echo_echo_echo_echo_mic_gain')[0].addEventListener('input', (e) => {
    micGainNow = e.target.value;
    setGainsAndDelay();
  });

  return () => {
    mic.disconnect();
    mic = null;
  };
}
