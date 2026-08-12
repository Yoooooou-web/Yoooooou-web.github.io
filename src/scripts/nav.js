// 1. 注入 nav.html
async function loadNav() {
    const res = await fetch("./nav.html");
    const html = await res.text();
  
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    document.body.prepend(wrapper);
  
    setActiveNav();
  }
  
  // 2. 根据当前URL设置 active
  function setActiveNav() {
    const path = window.location.pathname.split("/").pop();
  
    const map = {
      "about.html": "about",
      "rendering.html": "rendering",
      "graphic.html": "graphic",
      "web.html": "web",
      "contact.html": "contact"
    };
  
    const current = map[path] || "about";
  
    document.querySelectorAll(".nav-item").forEach(item => {
      item.classList.toggle("active", item.dataset.page === current);
    });
  }
  
  loadNav();