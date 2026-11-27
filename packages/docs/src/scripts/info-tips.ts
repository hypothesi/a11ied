/**
 * Adds hover and long press to the info tip buttons. A click or tap already toggles the
 * popover through `popovertarget`, which also works without this script. Passing the
 * button as `source` keeps a press on the button from closing the popover as an outside
 * click.
 */
const HIDE_DELAY_MS = 200,
   LONG_PRESS_MS = 450;

function setUpInfoTip(trigger: HTMLButtonElement): void {
   const popover = trigger.popoverTargetElement;

   let hideTimer: ReturnType<typeof setTimeout> | undefined = undefined,
      isOpenFromHover = false,
      isOpenFromLongPress = false,
      pressTimer: ReturnType<typeof setTimeout> | undefined = undefined;

   if (!(popover instanceof HTMLElement)) {
      return;
   }

   const cancelHide = (): void => {
      globalThis.clearTimeout(hideTimer);
   };

   const scheduleHide = (event: PointerEvent): void => {
      if (event.pointerType === 'mouse' && isOpenFromHover) {
         hideTimer = globalThis.setTimeout(() => {
            popover.hidePopover();
         }, HIDE_DELAY_MS);
      }
   };

   const cancelLongPress = (): void => {
      globalThis.clearTimeout(pressTimer);
   };

   trigger.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') {
         return;
      }

      cancelHide();

      if (!popover.matches(':popover-open')) {
         popover.showPopover({ source: trigger });
         isOpenFromHover = true;
      }
   });

   trigger.addEventListener('pointerdown', (event) => {
      // Some phones send no click after a long press, so the flag is cleared here as well.
      isOpenFromLongPress = false;

      if (event.pointerType === 'touch' && !popover.matches(':popover-open')) {
         pressTimer = globalThis.setTimeout(() => {
            popover.showPopover({ source: trigger });
            isOpenFromLongPress = true;
         }, LONG_PRESS_MS);
      }
   });

   // A click after a hover or a long press keeps the definition open instead of closing it.
   trigger.addEventListener('click', (event) => {
      if (isOpenFromLongPress) {
         event.preventDefault();
         isOpenFromLongPress = false;
         return;
      }

      if (isOpenFromHover) {
         event.preventDefault();
         isOpenFromHover = false;
      }
   });

   trigger.addEventListener('pointerleave', scheduleHide);
   trigger.addEventListener('pointerup', cancelLongPress);
   trigger.addEventListener('pointercancel', cancelLongPress);
   trigger.addEventListener('contextmenu', (event) => {
      event.preventDefault();
   });
   popover.addEventListener('pointerenter', cancelHide);
   popover.addEventListener('pointerleave', scheduleHide);
   popover.addEventListener('toggle', (event) => {
      if (event.newState === 'closed') {
         isOpenFromHover = false;
      }
   });
}

for (const trigger of document.querySelectorAll<HTMLButtonElement>(
   'button[data-info-tip]',
)) {
   setUpInfoTip(trigger);
}
