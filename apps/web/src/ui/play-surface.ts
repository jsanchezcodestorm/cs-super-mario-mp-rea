/** The transparent gaps around the pad receive touches on the play surface itself. */
export function bindPlaySurface(play: HTMLElement, touchDevice: MediaQueryList) {
  const preventSelection = (event: Event) => {
    if (touchDevice.matches) event.preventDefault();
  };
  play.addEventListener('selectstart', preventSelection, true);
  play.addEventListener('contextmenu', preventSelection, true);
  play.addEventListener('dragstart', preventSelection, true);

  play.addEventListener('touchstart', (event) => {
    // Interface buttons (including video resume and fullscreen) need the browser's tap-to-click.
    const target = event.target;
    if (target instanceof Element && target.closest('button:not([data-control]), a, input, select, textarea'))
      return;
    if (event.cancelable) event.preventDefault();
  }, { capture: true, passive: false });
}
