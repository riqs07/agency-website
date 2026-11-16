// Form handling for the wireframe site.
// There's no backend yet: forms validate and show a confirmation, and the
// answers are logged to the console. To collect submissions, set FORM_ENDPOINT
// to a form service URL (Formspree, Basin, a Vercel function, etc.).
const FORM_ENDPOINT = "";

document.querySelectorAll("form[data-form]").forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    form.querySelector(".form-error")?.remove();

    const email = form.querySelector('input[type="email"]');
    if (email && !email.checkValidity()) {
      const msg = document.createElement("p");
      msg.className = "form-error";
      msg.setAttribute("role", "alert");
      msg.textContent = "Please enter a valid email address.";
      email.insertAdjacentElement("afterend", msg);
      email.focus();
      return;
    }

    const data = Object.fromEntries(new FormData(form));
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    try {
      if (FORM_ENDPOINT) {
        const res = await fetch(FORM_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ page: location.pathname, ...data }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        console.info("Form submitted (no endpoint configured):", data);
      }
      const done = document.createElement("p");
      done.className = "form-done";
      done.setAttribute("role", "status");
      done.textContent = "Thanks! We got it and will be in touch soon.";
      form.replaceChildren(done);
    } catch (err) {
      if (button) button.disabled = false;
      const msg = document.createElement("p");
      msg.className = "form-error";
      msg.setAttribute("role", "alert");
      msg.textContent = "Something went wrong. Please try again, or email us directly.";
      form.append(msg);
    }
  });
});
