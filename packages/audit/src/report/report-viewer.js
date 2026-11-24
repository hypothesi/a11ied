/*
 * Screenshot viewer for the audit report. The report is one file, so this module is
 * inlined into it. Without the script each thumbnail is still a plain link to its image.
 */
const PERCENT = 100;
/** A picture is shown whole when that fills at least this much of the viewer's width. */
const MIN_WHOLE_WIDTH = 0.5;
/** Enlarging a small crop further than this only blurs it. */
const MAX_ENLARGEMENT = 3;
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

/**
 * Sizes the picture to fill the viewer. A picture that fits is shown whole and enlarged.
 * A page-length capture would be a sliver shown whole, so it fills the width and
 * scrolls.
 */
function fitImage(viewer) {
   const { body, image } = viewer;
   const actual = viewer.zoom.getAttribute('aria-pressed') === 'true';
   if (actual || image.naturalWidth === 0) {
      image.style.inlineSize = '';
      return;
   }
   const style = getComputedStyle(body);
   const padding = (side) => Number.parseFloat(style.getPropertyValue(`padding-${side}`));
   const width = body.clientWidth - padding('left') - padding('right');
   const height = body.clientHeight - padding('top') - padding('bottom');
   const wholeWidth = Math.min(
      width,
      height * (image.naturalWidth / image.naturalHeight),
   );
   const fitted = wholeWidth >= width * MIN_WHOLE_WIDTH ? wholeWidth : width;
   const limit = image.naturalWidth * MAX_ENLARGEMENT;
   image.style.inlineSize = `${String(Math.floor(Math.min(fitted, limit)))}px`;
}

/** The overview strip takes room from the picture, so the fit runs again once it shows. */
function layOut(viewer) {
   viewer.map.hidden = true;
   fitImage(viewer);
   if (viewer.body.scrollHeight > viewer.body.clientHeight) {
      viewer.map.hidden = false;
      fitImage(viewer);
   }
   showPosition(viewer);
}

function setActualSize(viewer, actual) {
   viewer.zoom.setAttribute('aria-pressed', String(actual));
   layOut(viewer);
}

function openViewer(viewer, thumbnail) {
   viewer.image.src = thumbnail.currentSrc || thumbnail.src;
   viewer.mapImage.src = viewer.image.src;
   viewer.image.alt = thumbnail.alt;
   viewer.title.textContent = thumbnail.alt;
   viewer.size.textContent = describeSize(thumbnail);
   viewer.dialog.showModal();
   setActualSize(viewer, false);
   viewer.body.scrollTop = 0;
   viewer.body.scrollLeft = 0;
   viewer.body.focus();
}

/** A thumbnail cut off by the height cap gets a note and a button under it saying so. */
function markIfCropped(thumbnail) {
   const shot = thumbnail.closest('[data-report-shot]');
   const shownHeight =
      thumbnail.naturalHeight * (thumbnail.clientWidth / thumbnail.naturalWidth);
   if (shot && shownHeight > thumbnail.clientHeight + 1) {
      shot.querySelector('[data-shot-more]').hidden = false;
   }
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
      markIfCropped(thumbnail);
      return;
   }
   thumbnail.addEventListener('load', () => {
      markIfCropped(thumbnail);
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
   // The picture reports its size only once it has loaded, and the room for it can change.
   viewer.image.addEventListener('load', () => layOut(viewer));
   window.addEventListener('resize', () => {
      if (dialog.open) {
         layOut(viewer);
      }
   });
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
