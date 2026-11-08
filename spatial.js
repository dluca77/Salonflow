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
    lastStage = -1,
    target = 0,
    rendered = null,
    lastTime = 0,
    scrollDirty = true;
  function geometry() {
    const top = parseFloat(getComputedStyle(wrap).top) || 0;
    return {
      start: track.getBoundingClientRect().top + scrollY - top,
      distance: Math.max(1, track.offsetHeight - wrap.offsetHeight),
    };
  }
  function paint(progress) {
    animations.forEach(
      (animation) => (animation.currentTime = progress * 1000),
    );
    const stage = Math.round(progress * 2);
    if (stage !== lastStage) {
      lastStage = stage;
      scene.dispatchEvent(new CustomEvent("spatial-stage", { detail: stage }));
    }
  }
  function update(time) {
    frame = 0;
    if (reduced.matches || document.hidden) return;
    if (scrollDirty) {
      const { start, distance } = geometry();
      target = Math.max(0, Math.min(1, (scrollY - start) / distance));
      scrollDirty = false;
    }
    // Time-based damping behaves alike on 60/120 Hz screens. Only the cards
    // ease toward the finger; native page scrolling is never delayed.
    const elapsed = lastTime ? Math.min(64, Math.max(0, time - lastTime)) : 16;
    lastTime = time;
    rendered =
      rendered === null
        ? target
        : rendered + (target - rendered) * (1 - Math.exp(-elapsed / 65));
    if (Math.abs(target - rendered) < 0.0005) rendered = target;
    paint(rendered);
    if (rendered !== target) frame = requestAnimationFrame(update);
    else lastTime = 0;
  }
  function schedule() {
    scrollDirty = true;
    if (!frame && !reduced.matches && !document.hidden)
      frame = requestAnimationFrame(update);
  }
  function build() {
    cancelAnimationFrame(frame);
    frame = 0;
    rendered = null;
    lastTime = 0;
    scrollDirty = true;
    animations.forEach((animation) => animation.cancel());
    animations = [];
    document.documentElement.classList.toggle("scroll-story", !reduced.matches);
    track.style.height = reduced.matches ? "auto" : "";
    if (reduced.matches) return;
    const base = matchMedia("(max-width: 540px)").matches ? 440 : 530;
    scene.style.setProperty("--scene-fit", String(scene.clientHeight / base));
    track.style.height =
      wrap.offsetHeight +
      Math.min((scene.clientHeight + 280) * 1.1, 900) +
      "px";
    scene.classList.add("measuring-scene");
    const frames = cards.map(() => []);
    for (let stage = 0; stage < 3; stage++) {
      scene.dataset.stage = stage;
      cards.forEach((card, i) => {
        const style = getComputedStyle(card);
        frames[i].push({
          transform: style.transform,
          opacity: style.opacity,
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
    schedule();
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
  let layoutWidth = document.documentElement.clientWidth;
  let sceneHeight = scene.clientHeight;
  function onLayoutChange() {
    // Mobile browser chrome changes innerHeight while scrolling. Only rebuild
    // when the actual layout width or stable svh-based scene size changes.
    const width = document.documentElement.clientWidth;
    const height = scene.clientHeight;
    if (width === layoutWidth && height === sceneHeight) {
      schedule();
      return;
    }
    layoutWidth = width;
    sceneHeight = height;
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(build);
  }
  addEventListener("resize", onLayoutChange);
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(onLayoutChange).observe(scene);
  }
  document.addEventListener("visibilitychange", () => {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    rendered = null;
    if (!document.hidden) schedule();
  });
  reduced.addEventListener("change", build);
  build();
})();
