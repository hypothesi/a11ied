/*
 * Live updates for the audit dashboard. The dashboard is one file, so this module is
 * inlined into it. It fetches the page again on a timer and replaces only the parts that
 * changed, so a reader keeps their scroll position, selected text, and keyboard focus,
 * and can pause the updates. Without the script the page reloads itself instead.
 */
const MS_PER_SECOND = 1000;
const clock = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' });
const calendar = new Intl.DateTimeFormat(undefined, {
   dateStyle: 'medium',
   timeStyle: 'short',
});

/** The controls the script updates, or nothing when the page is a static snapshot. */
function findControls() {
   const live = document.querySelector('[data-dash-live]');
   if (!(live instanceof HTMLElement)) {
      return;
   }
   return {
      announcer: document.querySelector('[data-dash-announcer]'),
      button: live.querySelector('[data-dash-pause]'),
      live,
      seconds: Number(live.dataset.refreshSeconds),
      state: live.querySelector('[data-dash-state]'),
   };
}

/** Rewrites the page's UTC times in the viewer's time zone. */
function showLocalTimes() {
   for (const time of document.querySelectorAll('time[data-dash-time]')) {
      const format = time.dataset.dashTime === 'time' ? clock : calendar;
      time.textContent = format.format(new Date(time.dateTime));
   }
   for (const zone of document.querySelectorAll('[data-dash-zone]')) {
      zone.textContent = 'your local time';
   }
}

/** The page's replaceable parts as the server sent them, by key. */
function readParts(root) {
   return new Map(
      Array.from(root.querySelectorAll('[data-live]'), (part) => [
         part.dataset.live,
         part,
      ]),
   );
}

function showState(controls, kind, text) {
   controls.live.dataset.dashLive = kind;
   controls.state.textContent = text;
}

/**
 * Replaces each part whose markup differs from what the server sent last time. Focus and
 * sideways scroll positions inside a replaced part are read first and restored after.
 */
function showPage(next, served) {
   const current = readParts(document);
   const changed = [...readParts(next)].filter(
      ([key, part]) => current.has(key) && served.get(key) !== part.outerHTML,
   );
   const focused = document.activeElement?.id ?? '';
   const scrolled = [...document.querySelectorAll('.dash-tableWrap')]
      .filter((region) => region.scrollLeft > 0)
      .map((region) => ({ id: region.id, left: region.scrollLeft }));
   for (const [key, part] of changed) {
      served.set(key, part.outerHTML);
      current.get(key).replaceWith(document.importNode(part, true));
   }
   if (changed.length === 0) {
      return;
   }
   for (const { id, left } of scrolled) {
      const region = document.querySelector(`#${CSS.escape(id)}`);
      if (region) {
         region.scrollLeft = left;
      }
   }
   if (focused !== '' && document.activeElement === document.body) {
      document.querySelector(`#${CSS.escape(focused)}`)?.focus({ preventScroll: true });
   }
   showLocalTimes();
}

/** Tells screen reader users when the audit changes phase or a unit needs a person. */
function announce(controls, next) {
   const main = document.querySelector('main');
   const announcement = next.querySelector('main')?.dataset.dashAnnouncement ?? '';
   if (announcement === main.dataset.dashAnnouncement) {
      return;
   }
   main.dataset.dashAnnouncement = announcement;
   controls.announcer.textContent = announcement;
}

/** Fetches the page again. Returns nothing when the server cannot be reached. */
async function fetchPage() {
   try {
      const response = await fetch(location.href, { cache: 'no-store' });
      if (!response.ok) {
         return;
      }
      return new DOMParser().parseFromString(await response.text(), 'text/html');
   } catch {
      // A stopped server rejects the request. The caller reports the lost connection.
   }
}

function start(controls) {
   const served = new Map(
      Array.from(readParts(document), ([key, part]) => [key, part.outerHTML]),
   );
   let timer = 0;
   let isPaused = false;
   let isUpdating = false;

   /** Runs one update at a time, and drops a result that arrives after a pause. */
   async function update() {
      if (isUpdating) {
         return;
      }
      isUpdating = true;
      const next = await fetchPage();
      isUpdating = false;
      if (isPaused) {
         return;
      }
      if (next) {
         showPage(next, served);
         announce(controls, next);
         document.title = next.title;
         showState(controls, 'on', `Live. Updated ${clock.format(new Date())}`);
      } else {
         showState(
            controls,
            'lost',
            'Connection lost. Showing the last update. Retrying.',
         );
      }
      timer = setTimeout(update, controls.seconds * MS_PER_SECOND);
   }

   controls.button.addEventListener('click', async () => {
      isPaused = !isPaused;
      clearTimeout(timer);
      controls.button.textContent = isPaused ? 'Resume updates' : 'Pause updates';
      if (isPaused) {
         showState(controls, 'paused', `Paused at ${clock.format(new Date())}`);
         return;
      }
      await update();
   });
   controls.button.hidden = false;
   showLocalTimes();
   showState(controls, 'on', `Live. Updated ${clock.format(new Date())}`);
   timer = setTimeout(update, controls.seconds * MS_PER_SECOND);
}

const controls = findControls();
if (controls) {
   start(controls);
}
