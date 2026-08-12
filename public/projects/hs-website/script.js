const home = document.querySelector(
  "[data-home]"
);

const slides = Array.from(
  document.querySelectorAll(
    ".home-slide"
  )
);

const brandNavigation =
  document.querySelector(
    "[data-brand-navigation]"
  );

const menuToggle =
  document.querySelector(
    "[data-menu-toggle]"
  );

const navigation =
  document.querySelector(
    "[data-navigation]"
  );

const navigationLinks = Array.from(
  navigation?.querySelectorAll("a") ?? []
);


/*
 * 每张图片停留5秒。
 */
const slideDuration = 5000;

let currentSlideIndex = 0;
let slideTimer = null;


/* ==============================
   Slideshow
============================== */

function showSlide(nextIndex) {
  if (slides.length === 0) return;

  const currentSlide =
    slides[currentSlideIndex];

  currentSlide?.classList.remove(
    "is-active"
  );

  currentSlideIndex =
    (nextIndex + slides.length) %
    slides.length;

  const nextSlide =
    slides[currentSlideIndex];

  /*
   * 强制浏览器重新计算动画，
   * 保证手动切换图片时，
   * 放大效果也会从头开始。
   */
  void nextSlide.offsetWidth;

  nextSlide.classList.add(
    "is-active"
  );
}

function startSlideTimer() {
  window.clearTimeout(slideTimer);

  slideTimer =
    window.setTimeout(() => {
      showSlide(
        currentSlideIndex + 1
      );

      startSlideTimer();
    }, slideDuration);
}

function showNextSlide() {
  showSlide(
    currentSlideIndex + 1
  );

  startSlideTimer();
}

function showPreviousSlide() {
  showSlide(
    currentSlideIndex - 1
  );

  startSlideTimer();
}


/* ==============================
   Navigation State
============================== */

function isMenuOpen() {
  return (
    brandNavigation?.classList.contains(
      "is-open"
    ) ?? false
  );
}

function openMenu() {
  if (
    !brandNavigation ||
    !menuToggle
  ) {
    return;
  }

  brandNavigation.classList.add(
    "is-open"
  );

  menuToggle.setAttribute(
    "aria-expanded",
    "true"
  );

  menuToggle.setAttribute(
    "aria-label",
    "关闭菜单"
  );
}

function closeMenu() {
  if (
    !brandNavigation ||
    !menuToggle
  ) {
    return;
  }

  brandNavigation.classList.remove(
    "is-open"
  );

  menuToggle.setAttribute(
    "aria-expanded",
    "false"
  );

  menuToggle.setAttribute(
    "aria-label",
    "打开菜单"
  );
}

function toggleMenu() {
  if (isMenuOpen()) {
    closeMenu();
    return;
  }

  openMenu();
}


/* ==============================
   Background Click
============================== */

/*
 * 点击画面时：
 *
 * 1. 菜单打开：
 *    只关闭菜单，不切换图片。
 *
 * 2. 菜单关闭：
 *    立即切换下一张图片。
 */
home?.addEventListener(
  "click",
  () => {
    if (isMenuOpen()) {
      closeMenu();
      return;
    }

    showNextSlide();
  }
);


/* ==============================
   Logo Click
============================== */

/*
 * 点击Logo只负责打开或关闭菜单，
 * 不触发背景图片切换。
 */
menuToggle?.addEventListener(
  "click",
  (event) => {
    event.stopPropagation();

    toggleMenu();
  }
);


/* ==============================
   Navigation Link Click
============================== */

/*
 * 点击菜单链接时，
 * 阻止事件继续传到背景区域。
 */
navigationLinks.forEach(
  (link) => {
    link.addEventListener(
      "click",
      (event) => {
        event.stopPropagation();
      }
    );
  }
);


/* ==============================
   Keyboard
============================== */

document.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key === "Escape" &&
      isMenuOpen()
    ) {
      closeMenu();

      menuToggle?.focus();

      return;
    }

    if (event.key === "ArrowRight") {
      if (isMenuOpen()) {
        closeMenu();
        return;
      }

      showNextSlide();
    }

    if (event.key === "ArrowLeft") {
      if (isMenuOpen()) {
        closeMenu();
        return;
      }

      showPreviousSlide();
    }
  }
);


/* ==============================
   Initialize
============================== */

showSlide(0);

startSlideTimer();