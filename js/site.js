// Steele Software: page behaviour. No dependencies.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- Mobile menu ---------- */
const menuBtn = document.querySelector(".menu-btn");
const nav = document.getElementById("nav");
if (menuBtn && nav) {
  const setOpen = (open) => {
    nav.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
  };
  menuBtn.addEventListener("click", () => setOpen(!nav.classList.contains("open")));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setOpen(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("open")) { setOpen(false); menuBtn.focus(); }
  });
}

/* ---------- Hero demo: facts become a draft, once ---------- */
const demo = document.querySelector(".demo");
if (demo) {
  const steps = [...demo.querySelectorAll("[data-step]")];
  const facts = [...demo.querySelectorAll("[data-fact]")];
  let timers = [];

  const showAll = () => {
    steps.forEach((s) => s.classList.add("on"));
    facts.forEach((f) => f.classList.add("fact-used"));
  };

  const play = () => {
    timers.forEach(clearTimeout);
    timers = [];
    steps.forEach((s) => s.classList.remove("on"));
    facts.forEach((f) => f.classList.remove("fact-used"));
    if (reduceMotion.matches) { showAll(); return; }

    let t = 200;
    steps.forEach((s) => {
      const isFact = s.closest(".facts");
      timers.push(setTimeout(() => s.classList.add("on"), t));
      t += isFact ? 160 : 650;
      // after the brief is filled in, highlight the facts the draft uses
      if (isFact && s === demo.querySelector(".facts li:last-child")) {
        t += 300;
        timers.push(setTimeout(() => facts.forEach((f) => f.classList.add("fact-used")), t));
        t += 450;
      }
    });
  };

  demo.querySelector("[data-replay]")?.addEventListener("click", play);
  play();
}

/* ---------- Sample brief: today's date ---------- */
document.querySelectorAll("[data-today]").forEach((el) => {
  el.textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
});
document.querySelectorAll("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });

/* ---------- Time-back calculator ---------- */
const listings = document.getElementById("c-listings");
const minutes = document.getElementById("c-minutes");
if (listings && minutes) {
  const AFTER = 30; // minutes per package with the Listing Launch Kit
  const update = () => {
    const n = Number(listings.value);
    const m = Number(minutes.value);
    const hours = Math.max(0, (n * (m - AFTER)) / 60);
    document.getElementById("o-listings").textContent = n;
    document.getElementById("o-minutes").textContent = m;
    document.getElementById("o-hours").textContent = hours % 1 ? hours.toFixed(1) : hours;
    document.getElementById("o-year").textContent = Math.round(hours * 12).toLocaleString("en-US");
  };
  listings.addEventListener("input", update);
  minutes.addEventListener("input", update);
  update();
}

/* ---------- Forms ----------
   No backend yet: the form validates and shows a confirmation.
   Set FORM_ENDPOINT to a form service URL to collect submissions. */
const FORM_ENDPOINT = "";

document.querySelectorAll("form[data-form]").forEach((form) => {
  const showError = (field, text) => {
    field.setAttribute("aria-invalid", "true");
    const msg = document.createElement("span");
    msg.className = "field-error";
    msg.id = `${field.id}-error`;
    msg.textContent = text;
    field.setAttribute("aria-describedby", [field.getAttribute("aria-describedby"), msg.id].filter(Boolean).join(" "));
    field.closest(".field").append(msg);
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    form.querySelectorAll(".field-error").forEach((el) => {
      const field = form.querySelector(`#${el.id.replace(/-error$/, "")}`);
      field?.removeAttribute("aria-invalid");
      const rest = (field?.getAttribute("aria-describedby") || "").split(" ").filter((id) => id !== el.id).join(" ");
      rest ? field.setAttribute("aria-describedby", rest) : field?.removeAttribute("aria-describedby");
      el.remove();
    });

    const invalid = [];
    const name = form.querySelector("[name=name]");
    const email = form.querySelector("[name=email]");
    if (name && !name.value.trim()) { showError(name, "Enter your name."); invalid.push(name); }
    if (email && !email.value.trim()) { showError(email, "Enter your email so I can reply."); invalid.push(email); }
    else if (email && !email.checkValidity()) { showError(email, "Enter an email like name@example.com."); invalid.push(email); }
    if (invalid.length) { invalid[0].focus(); return; }

    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    const data = Object.fromEntries(new FormData(form));

    try {
      if (FORM_ENDPOINT) {
        const res = await fetch(FORM_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        console.info("Audit request (no endpoint configured):", data);
      }
      const done = document.createElement("div");
      done.className = "form-done";
      done.setAttribute("role", "status");
      done.tabIndex = -1;
      done.innerHTML = "<h3>Request sent</h3><p class=\"muted\">I’ll email you to pick a time for your audit.</p>";
      form.replaceWith(done);
      done.focus();
    } catch {
      button.disabled = false;
      const msg = document.createElement("p");
      msg.className = "field-error";
      msg.setAttribute("role", "alert");
      msg.textContent = "The request didn’t go through. Try again, or email me directly.";
      form.append(msg);
    }
  });
});
