import * as demos from './demos.js';
import { getUserMic } from './audioHelpers.js';

async function initDemos(currentSlide) {
  window.audioContext = new (window.AudioContext || webkitAudioContext)();

  // Load extra modules
  await audioContext.audioWorklet.addModule('js/framedropper.js');
  await audioContext.audioWorklet.addModule('js/pinknoise.js');
  await audioContext.audioWorklet.addModule('js/bitwidth.js');

  // Demo hooks to impress.js
  let cleanup = null;

  document.addEventListener('impress:stepenter', async (evt) => {
    const slideId = evt.target.id;
    if (demos[slideId]) {
      if (cleanup != null) {
        console.error('Previous slide failed to cleanup');
      }

      console.log(`Load demo ${evt.target.id}`);
      cleanup = await demos[slideId](audioContext);
    }
  });

  document.addEventListener('impress:stepleave', () =>{
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
  });

  // Init current demo, if deeplinking
  if (currentSlide && demos[currentSlide]) {
      console.log(`Load deeplinked demo: ${currentSlide}`);
      cleanup = await demos[currentSlide](audioContext);
  }
}

const devMode = true;

window.addEventListener('load', async () => {
  let currentSlide = null;
  document.addEventListener('impress:stepenter', async (evt) => {
    currentSlide = evt.target.id;
  });

  window.presentationManager = impress();
  window.presentationManager.init();

  if (devMode) {
    console.info("DEV MODE ENABLED, AUTO CAPTURE MIC");
    getUserMic().then(_ => {
      initDemos(currentSlide);
      $('#demos_disabled_msg').toggle();
    });
  }

  $('#demos_enable')[0].addEventListener("click", () => {
    initDemos(currentSlide);
    $('#demos_disabled_msg').toggle();
  });

  $('#demos_keep_disabled')[0].addEventListener("click", () => {
    $('#demos_disabled_msg').toggle();
  });
});
