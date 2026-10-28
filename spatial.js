/* Event-driven perspective and scroll story. Never runs a permanent frame loop. */
(() => {
  const scene = document.querySelector("[data-spatial]");
  if (!scene) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  let frame = 0,
    manual = false,
    last = 0;
  const resetTilt = () => {
    scene.style.setProperty("--rx", "0deg");
    scene.style.setProperty("--ry", "0deg");
  };
  scene.addEventListener("pointermove", (event) => {
    if (reduced.matches || !fine.matches) return;
    const box = scene.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    scene.style.setProperty("--rx", `${-y * 5}deg`);
    scene.style.setProperty("--ry", `${x * 7}deg`);
  });
  scene.addEventListener("pointerleave", resetTilt);
  document
    .querySelectorAll("[data-scene-step], #scene-play")
    .forEach((button) => {
      button.addEventListener("click", () => {
        manual = true;
      });
    });
  function update() {
    frame = 0;
    if (reduced.matches || manual || document.hidden) return;
    const box = scene.getBoundingClientRect();
    if (box.bottom < 0 || box.top > innerHeight) return;
    const distance = Math.max(0, innerHeight * 0.34 - box.top);
    const next = Math.min(
      2,
      Math.floor(distance / Math.max(100, box.height * 0.25)),
    );
    if (next !== last) {
      last = next;
      scene.dispatchEvent(new CustomEvent("spatial-stage", { detail: next }));
    }
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", schedule, { passive: true });
  reduced.addEventListener("change", () => {
    resetTilt();
    schedule();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) resetTilt();
  });
  schedule();
})();
