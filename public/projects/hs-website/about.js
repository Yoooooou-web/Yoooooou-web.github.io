const filters = Array.from(
  document.querySelectorAll(
    "[data-filter]"
  )
);

const projectCards = Array.from(
  document.querySelectorAll(
    ".project-card"
  )
);

const emptyMessage =
  document.querySelector(
    "[data-project-empty]"
  );


/* ==============================
   Filter Projects
============================== */

function filterProjects() {
  const selected = {};

  filters.forEach((filter) => {
    selected[filter.dataset.filter] =
      filter.value;
  });

  let visibleCount = 0;

  projectCards.forEach((card) => {
    const locationMatches =
      selected.location === "all" ||
      card.dataset.location ===
        selected.location;

    const categoryMatches =
      selected.category === "all" ||
      card.dataset.category ===
        selected.category;

    const yearMatches =
      selected.year === "all" ||
      card.dataset.year ===
        selected.year;

    const isVisible =
      locationMatches &&
      categoryMatches &&
      yearMatches;

    card.hidden = !isVisible;

    if (isVisible) {
      visibleCount += 1;
    }
  });

  if (emptyMessage) {
    emptyMessage.hidden =
      visibleCount !== 0;
  }
}


/* ==============================
   Events
============================== */

filters.forEach((filter) => {
  filter.addEventListener(
    "change",
    filterProjects
  );
});