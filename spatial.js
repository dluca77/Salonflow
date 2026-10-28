/* Subtle desktop perspective only. Scrolling never changes the selected step. */
(() => {
  const scene = document.querySelector("[data-spatial]");
  if (!scene) return;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const fine = matchMedia("(hover: hover) and (pointer: fine)");
  const resetTilt = () => {
    scene.style.setProperty("--rx", "0deg");
    scene.style.setProperty("--ry", "0deg");
  };
  scene.addEventListener("pointermove", (event) => {
    if (reduced.matches || !fine.matches) return;
    const box = scene.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;
    scene.style.setProperty("--rx", `${-y * 3}deg`);
    scene.style.setProperty("--ry", `${x * 4}deg`);
  });
  scene.addEventListener("pointerleave", resetTilt);
  reduced.addEventListener("change", resetTilt);
  fine.addEventListener("change", resetTilt);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) resetTilt();
  });
})();
