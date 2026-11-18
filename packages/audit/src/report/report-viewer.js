/*
 * Screenshot viewer for the audit report. The report is one file, so this module is
 * inlined into it. Without the script each thumbnail is still a plain link to its image.
 */
const PERCENT = 100;
const numbers = new Intl.NumberFormat('en-US');

/** The viewer dialog and the parts of it the script updates. */
function findViewer() {
   const dialog = document.querySelector('[data-report-viewer]');
   if (!(dialog instanceof HTMLDialogElement)) {
      return;
   }
   const part = (name) => dialog.querySelector(`[data-viewer-${name}]`);
   return {
      body: part('body'),
      close: part('close'),
      dialog,
      image: part('image'),
      map: part('map'),
      mapImage: part('map-image'),
      position: part('position'),
      size: part('size'),
      slider: part('slider'),
      title: part('title'),
      window: part('window'),
      zoom: part('zoom'),
   };
}

function describeSize(picture) {
   return `${numbers.format(picture.naturalWidth)} by ${numbers.format(picture.naturalHeight)} pixels`;
}

/** Keeps the overview strip, its window, and the slider in step with the scroll position. */
function showPosition(viewer) {
   const { body } = viewer;
   const scrollable = body.scrollHeight - body.clientHeight;
   viewer.map.hidden = scrollable <= 0;
   if (scrollable <= 0) {
      viewer.position.textContent = 'Whole image shown';
      return;
   }
   const fraction = body.scrollTop / scrollable;
   const shown = Math.round(fraction * PERCENT);
   viewer.position.textContent = `Scrolled ${String(shown)}% down`;
   viewer.slider.value = String(Math.round(fraction * Number(viewer.slider.max)));
   viewer.slider.setAttribute('aria-valuetext', `${String(shown)}% down`);
   viewer.window.style.top = `${String((body.scrollTop / body.scrollHeight) * PERCENT)}%`;
   viewer.window.style.height = `${String((body.clientHeight / body.scrollHeight) * PERCENT)}%`;
}

function setActualSize(viewer, actual) {
   viewer.dialog.classList.toggle('report-viewer--actual', actual);
   viewer.zoom.setAttribute('aria-pressed', String(actual));
   showPosition(viewer);
}

function openViewer(viewer, thumbnail) {
   viewer.image.src = thumbnail.currentSrc || thumbnail.src;
   viewer.mapImage.src = viewer.image.src;
   viewer.image.alt = thumbnail.alt;
   viewer.title.textContent = thumbnail.alt;
   viewer.size.textContent = describeSize(thumbnail);
   setActualSize(viewer, false);
   viewer.dialog.showModal();
   viewer.body.scrollTop = 0;
   viewer.body.scrollLeft = 0;
   showPosition(viewer);
   viewer.body.focus();
}

/** A thumbnail cut off by the height cap gets a fade and a button saying so. */
function markIfTall(thumbnail) {
   const shot = thumbnail.closest('[data-report-shot]');
   const shownHeight =
      thumbnail.naturalHeight * (thumbnail.clientWidth / thumbnail.naturalWidth);
   if (!shot || shownHeight <= thumbnail.clientHeight + 1) {
      return;
   }
   shot.classList.add('report-shot--tall');
   const more = shot.querySelector('[data-shot-more]');
   more.hidden = false;
   more.querySelector('[data-shot-size]').textContent =
      `${numbers.format(thumbnail.naturalHeight)} pixels tall`;
}

function connectThumbnail(viewer, shot) {
   const thumbnail = shot.querySelector('img');
   shot.querySelector('a').addEventListener('click', (event) => {
      event.preventDefault();
      openViewer(viewer, thumbnail);
   });
   shot.querySelector('[data-shot-more] button').addEventListener('click', () => {
      openViewer(viewer, thumbnail);
   });
   if (thumbnail.complete && thumbnail.naturalWidth > 0) {
      markIfTall(thumbnail);
      return;
   }
   thumbnail.addEventListener('load', () => {
      markIfTall(thumbnail);
   });
}

function connectViewer(viewer) {
   const { body, dialog, slider, zoom } = viewer;
   slider.addEventListener('input', () => {
      body.scrollTop =
         (Number(slider.value) / Number(slider.max)) *
         (body.scrollHeight - body.clientHeight);
   });
   zoom.addEventListener('click', () => {
      setActualSize(viewer, zoom.getAttribute('aria-pressed') !== 'true');
   });
   body.addEventListener('scroll', () => showPosition(viewer), { passive: true });
   viewer.close.addEventListener('click', () => dialog.close());
   // A click on the backdrop lands on the dialog element itself.
   dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
         dialog.close();
      }
   });
   dialog.addEventListener('close', () => {
      viewer.image.removeAttribute('src');
      viewer.mapImage.removeAttribute('src');
   });
}

const viewer = findViewer();
if (viewer) {
   connectViewer(viewer);
   for (const shot of document.querySelectorAll('[data-report-shot]')) {
      connectThumbnail(viewer, shot);
   }
}
