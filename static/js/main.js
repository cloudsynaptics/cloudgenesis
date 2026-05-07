document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("is-ready");

  const toggle = document.querySelector("[data-nav-toggle]");
  const panel = document.querySelector("[data-nav-panel]");
  const desktopQuery = window.matchMedia("(min-width: 64rem)");
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const revealItems = Array.from(document.querySelectorAll(".reveal"));
  const focusableSelector = "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";

  const showRevealItems = () => {
    document.body.classList.remove("reveal-enabled");
    revealItems.forEach((item) => item.classList.add("is-visible"));
  };

  if (revealItems.length > 0) {
    if ("IntersectionObserver" in window && !reducedMotionQuery.matches) {
      document.body.classList.add("reveal-enabled");

      const revealObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              return;
            }

            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          });
        },
        {
          rootMargin: "0px 0px -8% 0px",
          threshold: 0.14,
        },
      );

      revealItems.forEach((item) => revealObserver.observe(item));

      reducedMotionQuery.addEventListener("change", (event) => {
        if (event.matches) {
          revealObserver.disconnect();
          showRevealItems();
        }
      });
    } else {
      showRevealItems();
    }
  }

  const contactForms = Array.from(document.querySelectorAll("[data-contact-form]"));

  contactForms.forEach((form) => {
    const endpoint = form.dataset.contactEndpoint;
    const siteKey = form.dataset.turnstileSiteKey;
    const status = form.querySelector("[data-contact-status]");
    const submitButton = form.querySelector("button[type='submit']");
    const submittedAt = form.querySelector("input[name='submittedAt']");
    const turnstileContainer = form.querySelector("[data-turnstile-container]");
    let turnstileWidgetId = null;
    let turnstileToken = "";

    if (submittedAt) {
      submittedAt.value = String(Date.now());
    }

    const setStatus = (message, state = "") => {
      if (!status) {
        return;
      }

      status.textContent = message;
      status.classList.toggle("is-success", state === "success");
      status.classList.toggle("is-error", state === "error");
    };

    const resetTurnstile = () => {
      turnstileToken = "";

      if (window.turnstile && turnstileWidgetId !== null) {
        window.turnstile.reset(turnstileWidgetId);
      }
    };

    const renderTurnstile = () => {
      if (!siteKey || !turnstileContainer || !window.turnstile || turnstileWidgetId !== null) {
        return;
      }

      turnstileWidgetId = window.turnstile.render(turnstileContainer, {
        sitekey: siteKey,
        callback: (token) => {
          turnstileToken = token;
          setStatus("");
        },
        "expired-callback": resetTurnstile,
        "error-callback": resetTurnstile,
      });
    };

    renderTurnstile();
    window.addEventListener("load", renderTurnstile, { once: true });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!endpoint) {
        setStatus("The contact backend is not configured yet. Please email contactus@cloudgenesis.in directly.", "error");
        return;
      }

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      if (siteKey && !turnstileToken) {
        setStatus("Please complete the verification before sending your inquiry.", "error");
        return;
      }

      const formData = new FormData(form);
      const payload = {
        name: String(formData.get("name") || ""),
        email: String(formData.get("email") || ""),
        subject: String(formData.get("subject") || ""),
        message: String(formData.get("message") || ""),
        company: String(formData.get("company") || ""),
        submittedAt: Number(formData.get("submittedAt") || Date.now()),
        turnstileToken,
      };

      submitButton.disabled = true;
      setStatus("Sending your inquiry...");

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
          credentials: "omit",
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.ok === false) {
          throw new Error(result.message || "We could not send your inquiry right now. Please try again later.");
        }

        form.reset();
        if (submittedAt) {
          submittedAt.value = String(Date.now());
        }
        resetTurnstile();
        setStatus("Thanks. Your inquiry has been sent.", "success");
      } catch (error) {
        setStatus(error.message || "We could not send your inquiry right now. Please try again later.", "error");
        resetTurnstile();
      } finally {
        submitButton.disabled = false;
      }
    });
  });

  if (!toggle || !panel) {
    return;
  }

  const getFocusableItems = () => Array.from(panel.querySelectorAll(focusableSelector));

  const isMenuOpen = () => toggle.getAttribute("aria-expanded") === "true";

  const closeMenu = ({ restoreFocus = false } = {}) => {
    if (!isMenuOpen()) {
      return;
    }

    panel.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");

    if (restoreFocus) {
      toggle.focus();
    }
  };

  const openMenu = () => {
    panel.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");

    const firstItem = getFocusableItems()[0];

    if (firstItem) {
      firstItem.focus();
    }
  };

  toggle.addEventListener("click", () => {
    if (isMenuOpen()) {
      closeMenu({ restoreFocus: true });
    } else {
      openMenu();
    }
  });

  panel.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => closeMenu());
  });

  document.addEventListener("keydown", (event) => {
    if (!isMenuOpen()) {
      return;
    }

    if (event.key === "Escape") {
      closeMenu({ restoreFocus: true });
      return;
    }

    if (event.key !== "Tab" || desktopQuery.matches) {
      return;
    }

    const focusableItems = getFocusableItems();

    if (focusableItems.length === 0) {
      event.preventDefault();
      return;
    }

    const firstItem = focusableItems[0];
    const lastItem = focusableItems[focusableItems.length - 1];

    if (event.shiftKey && document.activeElement === firstItem) {
      event.preventDefault();
      lastItem.focus();
    } else if (!event.shiftKey && document.activeElement === lastItem) {
      event.preventDefault();
      firstItem.focus();
    }
  });

  document.addEventListener("click", (event) => {
    if (!isMenuOpen()) {
      return;
    }

    const target = event.target;

    if (target instanceof Node && !panel.contains(target) && !toggle.contains(target)) {
      closeMenu();
    }
  });

  desktopQuery.addEventListener("change", (event) => {
    if (event.matches) {
      closeMenu();
    }
  });
});
