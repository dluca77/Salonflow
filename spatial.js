/* Native scrolling with a bounded sticky track. No wheel/touch interception. */
(() => {
  const scene = document.querySelector("[data-spatial]");
  if (!scene || !Element.prototype.animate) return;
  const wrap = scene.closest(".spatial-wrap");
  const track = document.createElement("div");
  track.className = "spatial-track";
  wrap.before(track);
  track.append(wrap);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const cards = [...scene.querySelectorAll(".space-card")];
  let animations = [],
    frame = 0,
    lastStage = -1;
  function geometry() {
    const top = parseFloat(getComputedStyle(wrap).top) || 0;
    return {
      start: track.getBoundingClientRect().top + scrollY - top,
      distance: Math.max(1, track.offsetHeight - wrap.offsetHeight),
    };
  }
  function update() {
    frame = 0;
    if (reduced.matches) return;
    const { start, distance } = geometry();
    const progress = Math.max(0, Math.min(1, (scrollY - start) / distance));
    animations.forEach(
      (animation) => (animation.currentTime = progress * 1000),
    );
    const stage = Math.round(progress * 2);
    if (stage !== lastStage) {
      lastStage = stage;
      scene.dispatchEvent(new CustomEvent("spatial-stage", { detail: stage }));
    }
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  function build() {
    animations.forEach((animation) => animation.cancel());
    animations = [];
    document.documentElement.classList.toggle("scroll-story", !reduced.matches);
    track.style.height = reduced.matches ? "auto" : "";
    if (reduced.matches) return;
    const base = matchMedia("(max-width: 540px)").matches ? 440 : 530;
    scene.style.setProperty("--scene-fit", String(scene.clientHeight / base));
    track.style.height =
      wrap.offsetHeight + Math.min(innerHeight * 1.1, 900) + "px";
    scene.classList.add("measuring-scene");
    const frames = cards.map(() => []);
    for (let stage = 0; stage < 3; stage++) {
      scene.dataset.stage = stage;
      cards.forEach((card, i) => {
        const style = getComputedStyle(card);
        frames[i].push({
          transform: style.transform,
          opacity: style.opacity,
          filter: style.filter,
          offset: stage / 2,
        });
      });
    }
    animations = cards.map((card, i) => {
      const animation = card.animate(frames[i], {
        duration: 1000,
        fill: "both",
        easing: "linear",
      });
      animation.pause();
      return animation;
    });
    scene.classList.remove("measuring-scene");
    lastStage = -1;
    update();
  }
  document.querySelectorAll("[data-scene-step]").forEach((button) => {
    button.addEventListener("click", () => {
      if (reduced.matches) return;
      const { start, distance } = geometry();
      window.scrollTo({
        top: Math.max(
          0,
          start + (Number(button.dataset.sceneStep) / 2) * distance,
        ),
        behavior: "smooth",
      });
    });
  });
  addEventListener("scroll", schedule, { passive: true });
  let resizeFrame;
  addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(build);
  });
  reduced.addEventListener("change", build);
  build();
})();
