let webPageCleanup = null;


/* ==============================
   Initialize Web Page
============================== */

function initWebPage() {
  /*
   * 清除Astro上一次页面切换
   * 留下的事件和观察器。
   */
  if (webPageCleanup) {
    webPageCleanup();
    webPageCleanup = null;
  }

  const webPage =
    document.querySelector(
      ".web-page"
    );

  if (!webPage) return;

  const projects = Array.from(
    webPage.querySelectorAll(
      ".web-project"
    )
  );

  if (projects.length === 0) return;


  /* ==============================
     Reveal Animation
  ============================== */

  const observer =
    new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add(
            "is-visible"
          );

          observer.unobserve(
            entry.target
          );
        });
      },
      {
        threshold: 0.12,
        rootMargin:
          "0px 0px -100px 0px",
      }
    );

  projects.forEach((project) => {
    observer.observe(project);
  });


  /* ==============================
     Cleanup
  ============================== */

  webPageCleanup = () => {
    observer.disconnect();
  };
}


/* ==============================
   Initial Load
============================== */

initWebPage();


/* ==============================
   Astro Page Load
============================== */

document.addEventListener(
  "astro:page-load",
  initWebPage
);


/* ==============================
   Astro Page Leave
============================== */

document.addEventListener(
  "astro:before-swap",
  () => {
    if (webPageCleanup) {
      webPageCleanup();
      webPageCleanup = null;
    }
  }
);