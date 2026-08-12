let graphicCleanup = null;

function initGraphicPage() {
  if (graphicCleanup) {
    graphicCleanup();
    graphicCleanup = null;
  }

  const archive = document.querySelector(
    ".graphic-archive"
  );

  if (!(archive instanceof HTMLElement)) return;

  /*
   * 如果已经生成过列，从列中取得全部作品；
   * 首次进入时直接从 archive 中取得。
   */
  const works = Array.from(
    archive.querySelectorAll(".work")
  )
    .filter((work) => work instanceof HTMLElement)
    .sort(
      (firstWork, secondWork) =>
        Number(firstWork.dataset.workIndex) -
        Number(secondWork.dataset.workIndex)
    );

  if (works.length === 0) return;

  let currentColumnCount = 0;
  let layoutFrameId = 0;


  /* ============================
     Masonry Layout
  ============================ */

  const getColumnCount = () => {
    const value = getComputedStyle(archive)
      .getPropertyValue(
        "--graphic-column-count"
      );

    const columnCount = Number.parseInt(
      value,
      10
    );

    return Number.isInteger(columnCount)
      ? columnCount
      : 0;
  };

  const buildColumns = () => {
    const columnCount = getColumnCount();

    /*
     * ClientRouter 可能在页面 CSS 完全应用之前
     * 执行页面脚本，因此等待 CSS 提供列数。
     */
    if (columnCount === 0) {
      layoutFrameId =
        window.requestAnimationFrame(
          buildColumns
        );

      return;
    }

    layoutFrameId = 0;

    if (columnCount === currentColumnCount) {
      return;
    }

    currentColumnCount = columnCount;

    const columns = Array.from(
      { length: columnCount },
      () => {
        const column =
          document.createElement("div");

        column.className = "graphic-column";

        return column;
      }
    );

    /*
     * 保持横向排列顺序：
     * 01 → 第1列
     * 02 → 第2列
     * ...
     * 05 → 第5列
     * 06 → 第1列
     */
    works.forEach((work, index) => {
      const columnIndex =
        index % columnCount;

      work.style.removeProperty("width");
      work.style.removeProperty("left");
      work.style.removeProperty("top");
      work.style.removeProperty("right");
      work.style.removeProperty("margin");

      columns[columnIndex].appendChild(work);
    });

    archive.replaceChildren(...columns);
  };

  buildColumns();


  /* ============================
     Work Entrance Animation
  ============================ */

  const intersectionObserver =
    new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          entry.target.classList.add(
            "visible"
          );

          intersectionObserver.unobserve(
            entry.target
          );
        });
      },
      {
        threshold: 0.05,
        rootMargin:
          "0px 0px -30px 0px",
      }
    );

  works.forEach((work, index) => {
    work.style.transitionDelay =
      `${(index % 5) * 0.08}s`;

    intersectionObserver.observe(work);
  });

  /*
   * 只在响应式列数发生变化时，
   * 重新分配作品。
   */
  const resizeObserver =
    new ResizeObserver(() => {
      buildColumns();
    });

  resizeObserver.observe(archive);


  /* ============================
     Graphic Viewer Elements
  ============================ */

  const viewer = document.querySelector(
    "[data-graphic-viewer]"
  );

  const viewerPanel = viewer?.querySelector(
    ".graphic-viewer-panel"
  );

  const viewerMedia = viewer?.querySelector(
    "[data-viewer-media]"
  );

  const viewerImage = viewer?.querySelector(
    "[data-viewer-image]"
  );

  const viewerNumber = viewer?.querySelector(
    "[data-viewer-number]"
  );

  const viewerTitle = viewer?.querySelector(
    "[data-viewer-title]"
  );

  const viewerCategory =
    viewer?.querySelector(
      "[data-viewer-category]"
    );

  const viewerDate = viewer?.querySelector(
    "[data-viewer-date]"
  );

  const viewerDuration =
    viewer?.querySelector(
      "[data-viewer-duration]"
    );

  const viewerTools = viewer?.querySelector(
    "[data-viewer-tools]"
  );

  const viewerDescription =
    viewer?.querySelector(
      "[data-viewer-description]"
    );

  const previousButton =
    viewer?.querySelector(
      "[data-viewer-previous]"
    );

  const nextButton = viewer?.querySelector(
    "[data-viewer-next]"
  );

  const closeButtons =
    viewer?.querySelectorAll(
      "[data-viewer-close]"
    ) ?? [];

  const openButtons =
    archive.querySelectorAll(
      "[data-open-work]"
    );

  let activeIndex = 0;
  let viewerIsOpen = false;
  let imageIsChanging = false;
  let previouslyFocusedElement = null;
  let closeTimerId = 0;
  let changeTimerId = 0;


  /* ============================
     Viewer Content
  ============================ */

  const getWorkData = (index) => {
    const work = works[index];

    return {
      number:
        work.dataset.workNumber ?? "",

      title:
        work.dataset.workTitle ?? "",

      category:
        work.dataset.workCategory ?? "",

      date:
        work.dataset.workDate ?? "",

      duration:
        work.dataset.workDuration ?? "",

      tools:
        work.dataset.workTools ?? "",

      description:
        work.dataset.workDescription ?? "",

      image:
        work.dataset.workImage ?? "",
    };
  };

  const updateViewerContent = (index) => {
    if (
      !(viewerImage instanceof HTMLImageElement)
    ) {
      return;
    }

    const work = getWorkData(index);

    viewerImage.src = work.image;
    viewerImage.alt = work.title;

    if (viewerNumber) {
      viewerNumber.textContent =
        work.number;
    }

    if (viewerTitle) {
      viewerTitle.textContent =
        work.title;
    }

    if (viewerCategory) {
      viewerCategory.textContent =
        work.category;
    }

    if (viewerDate) {
      viewerDate.textContent =
        work.date;
    }

    if (viewerDuration) {
      viewerDuration.textContent =
        work.duration;
    }

    if (viewerTools) {
      viewerTools.textContent =
        work.tools;
    }

    if (viewerDescription) {
      viewerDescription.textContent =
        work.description;
    }

    /*
     * 提前载入前后两张图片，
     * 减少翻页时的等待。
     */
    const previousIndex =
      (index - 1 + works.length) %
      works.length;

    const nextIndex =
      (index + 1) %
      works.length;

    [
      getWorkData(previousIndex).image,
      getWorkData(nextIndex).image,
    ].forEach((imageSource) => {
      if (!imageSource) return;

      const preloadImage = new Image();
      preloadImage.src = imageSource;
    });
  };


  /* ============================
     Open / Close Viewer
  ============================ */

  const openViewer = (
    index,
    sourceButton
  ) => {
    if (!(viewer instanceof HTMLElement)) {
      return;
    }

    window.clearTimeout(closeTimerId);

    activeIndex = index;
    viewerIsOpen = true;

    previouslyFocusedElement =
      sourceButton instanceof HTMLElement
        ? sourceButton
        : document.activeElement;

    updateViewerContent(activeIndex);

    viewer.hidden = false;

    viewer.setAttribute(
      "aria-hidden",
      "false"
    );

    document.documentElement.classList.add(
      "graphic-viewer-open"
    );

    /*
     * 等待浏览器先渲染 display 状态，
     * 再触发打开动画。
     */
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!viewerIsOpen) {
          return;
        }

        viewer.classList.add("is-open");

        if (
          previousButton instanceof HTMLElement
        ) {
          previousButton.focus({
            preventScroll: true,
          });
        }
      });
    });
  };

  const closeViewer = (
    immediate = false
  ) => {
    if (!(viewer instanceof HTMLElement)) {
      return;
    }

    if (!viewerIsOpen && !immediate) {
      return;
    }

    viewerIsOpen = false;
    imageIsChanging = false;

    window.clearTimeout(closeTimerId);
    window.clearTimeout(changeTimerId);

    pointerIsDown = false;
    activePointerId = null;

    if (
      viewerImage instanceof
      HTMLImageElement
    ) {
      viewerImage.classList.remove(
        "is-changing-left",
        "is-changing-right"
      );
    
      viewerImage.style.removeProperty(
        "transform"
      );
    }

    viewerMedia?.classList.remove(
      "is-dragging"
    );

    viewer.classList.remove("is-open");

    viewer.setAttribute(
      "aria-hidden",
      "true"
    );

    document.documentElement.classList.remove(
      "graphic-viewer-open"
    );

    const finishClosing = () => {
      viewer.hidden = true;

      if (
        previouslyFocusedElement
        instanceof HTMLElement
      ) {
        previouslyFocusedElement.focus({
          preventScroll: true,
        });
      }

      previouslyFocusedElement = null;
    };

    if (immediate) {
      finishClosing();
      return;
    }

    closeTimerId = window.setTimeout(
      finishClosing,
      380
    );
  };


  /* ============================
     Change Work
  ============================ */

  const changeWork = (direction) => {
    if (
      !viewerIsOpen ||
      imageIsChanging ||
      !(viewerImage instanceof HTMLImageElement)
    ) {
      return;
    }

    imageIsChanging = true;

    const isNext = direction > 0;

    viewerImage.classList.add(
      isNext
        ? "is-changing-left"
        : "is-changing-right"
    );

    changeTimerId = window.setTimeout(() => {
      activeIndex =
        (
          activeIndex +
          direction +
          works.length
        ) % works.length;

      updateViewerContent(activeIndex);

      /*
       * 新图片从相反方向进入。
       */
      viewerImage.classList.remove(
        "is-changing-left",
        "is-changing-right"
      );

      viewerImage.classList.add(
        isNext
          ? "is-changing-right"
          : "is-changing-left"
      );

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          viewerImage.classList.remove(
            "is-changing-left",
            "is-changing-right"
          );

          imageIsChanging = false;
        });
      });
    }, 220);
  };

  const showPreviousWork = () => {
    changeWork(-1);
  };

  const showNextWork = () => {
    changeWork(1);
  };


  /* ============================
     Card Events
  ============================ */

  const openButtonHandlers = [];

  openButtons.forEach((button) => {
    const work = button.closest(".work");
    const index = works.indexOf(work);

    if (index < 0) return;

    const handler = () => {
      openViewer(index, button);
    };

    button.addEventListener(
      "click",
      handler
    );

    openButtonHandlers.push({
      button,
      handler,
    });
  });


  /* ============================
     Viewer Button Events
  ============================ */

  previousButton?.addEventListener(
    "click",
    showPreviousWork
  );

  nextButton?.addEventListener(
    "click",
    showNextWork
  );

  const closeButtonHandlers = [];

  closeButtons.forEach((button) => {
    const handler = () => {
      closeViewer();
    };

    button.addEventListener(
      "click",
      handler
    );

    closeButtonHandlers.push({
      button,
      handler,
    });
  });


  /* ============================
     Keyboard Controls
  ============================ */

  const handleKeydown = (event) => {
    if (!viewerIsOpen) return;

    if (event.key === "Escape") {
      event.preventDefault();
      closeViewer();
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPreviousWork();
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      showNextWork();
      return;
    }

    /*
     * 将 Tab 焦点限制在查看器内部。
     */
    if (
      event.key === "Tab" &&
      viewerPanel instanceof HTMLElement
    ) {
      const focusableElements = Array.from(
        viewerPanel.querySelectorAll(
          "button:not([disabled]), a[href]"
        )
      ).filter(
        (element) =>
          element instanceof HTMLElement &&
          element.offsetParent !== null
      );

      if (focusableElements.length === 0) {
        return;
      }

      const firstElement =
        focusableElements[0];

      const lastElement =
        focusableElements[
          focusableElements.length - 1
        ];

      if (
        event.shiftKey &&
        document.activeElement === firstElement
      ) {
        event.preventDefault();
        lastElement.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === lastElement
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  };

  document.addEventListener(
    "keydown",
    handleKeydown
  );


  /* ============================
     Mouse Drag / Touch Swipe
  ============================ */

  let pointerIsDown = false;
  let pointerStartX = 0;
  let pointerCurrentX = 0;
  let activePointerId = null;

  const resetDragPosition = () => {
    if (
      !(viewerImage instanceof HTMLImageElement)
    ) {
      return;
    }

    viewerImage.style.removeProperty(
      "transform"
    );

    viewerMedia?.classList.remove(
      "is-dragging"
    );
  };

  const handlePointerDown = (event) => {
    if (
      !viewerIsOpen ||
      imageIsChanging ||
      !(viewerMedia instanceof HTMLElement) ||
      !(viewerImage instanceof HTMLImageElement)
    ) {
      return;
    }

    /*
     * 点击左右按钮时不启动拖动。
     */
    if (
      event.target instanceof Element &&
      event.target.closest("button")
    ) {
      return;
    }

    pointerIsDown = true;
    activePointerId = event.pointerId;
    pointerStartX = event.clientX;
    pointerCurrentX = event.clientX;

    viewerMedia.classList.add(
      "is-dragging"
    );

    viewerMedia.setPointerCapture(
      event.pointerId
    );
  };

  const handlePointerMove = (event) => {
    if (
      !pointerIsDown ||
      event.pointerId !== activePointerId ||
      !(viewerImage instanceof HTMLImageElement)
    ) {
      return;
    }

    pointerCurrentX = event.clientX;

    const distance =
      pointerCurrentX - pointerStartX;

    /*
     * 限制拖动距离，保持操作稳定。
     */
    const limitedDistance = Math.max(
      -140,
      Math.min(140, distance)
    );

    viewerImage.style.transform =
      `translateX(${limitedDistance}px) ` +
      "scale(0.99)";
  };

  const finishPointerGesture = (event) => {
    if (
      !pointerIsDown ||
      event.pointerId !== activePointerId
    ) {
      return;
    }

    const distance =
      pointerCurrentX - pointerStartX;

    pointerIsDown = false;
    activePointerId = null;

    resetDragPosition();

    /*
     * 拖动超过55px才切换，
     * 避免普通点击被识别成翻页。
     */
    if (Math.abs(distance) < 55) {
      return;
    }

    if (distance < 0) {
      showNextWork();
    } else {
      showPreviousWork();
    }
  };

  viewerMedia?.addEventListener(
    "pointerdown",
    handlePointerDown
  );

  viewerMedia?.addEventListener(
    "pointermove",
    handlePointerMove
  );

  viewerMedia?.addEventListener(
    "pointerup",
    finishPointerGesture
  );

  viewerMedia?.addEventListener(
    "pointercancel",
    finishPointerGesture
  );

  /*
   * 防止图片被浏览器原生拖走。
   */
  const preventImageDrag = (event) => {
    event.preventDefault();
  };

  viewerImage?.addEventListener(
    "dragstart",
    preventImageDrag
  );


  /* ============================
     Cleanup
  ============================ */

  graphicCleanup = () => {
    if (layoutFrameId) {
      window.cancelAnimationFrame(
        layoutFrameId
      );
    }

    window.clearTimeout(closeTimerId);
    window.clearTimeout(changeTimerId);

    intersectionObserver.disconnect();
    resizeObserver.disconnect();

    document.removeEventListener(
      "keydown",
      handleKeydown
    );

    previousButton?.removeEventListener(
      "click",
      showPreviousWork
    );

    nextButton?.removeEventListener(
      "click",
      showNextWork
    );

    closeButtonHandlers.forEach(
      ({ button, handler }) => {
        button.removeEventListener(
          "click",
          handler
        );
      }
    );

    openButtonHandlers.forEach(
      ({ button, handler }) => {
        button.removeEventListener(
          "click",
          handler
        );
      }
    );

    viewerMedia?.removeEventListener(
      "pointerdown",
      handlePointerDown
    );

    viewerMedia?.removeEventListener(
      "pointermove",
      handlePointerMove
    );

    viewerMedia?.removeEventListener(
      "pointerup",
      finishPointerGesture
    );

    viewerMedia?.removeEventListener(
      "pointercancel",
      finishPointerGesture
    );

    viewerImage?.removeEventListener(
      "dragstart",
      preventImageDrag
    );

    closeViewer(true);

    document.documentElement.classList.remove(
      "graphic-viewer-open"
    );
  };
}


/* ==============================
   Astro Page Lifecycle
============================== */

document.addEventListener(
  "astro:page-load",
  initGraphicPage
);

document.addEventListener(
  "astro:before-swap",
  () => {
    if (!graphicCleanup) return;

    graphicCleanup();
    graphicCleanup = null;
  }
);