document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("is-ready");

  const toggle = document.querySelector("[data-nav-toggle]");
  const panel = document.querySelector("[data-nav-panel]");
  const desktopQuery = window.matchMedia("(min-width: 64rem)");
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const revealItems = Array.from(document.querySelectorAll(".reveal"));
  const focusableSelector = "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";
  const addMediaQueryChangeListener = (query, callback) => {
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", callback);
      return;
    }

    if (typeof query.addListener === "function") {
      query.addListener(callback);
    }
  };

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

      addMediaQueryChangeListener(reducedMotionQuery, (event) => {
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
  const pricingCards = Array.from(document.querySelectorAll(".pricing-card"));
  const packagePrefillData = document.querySelector("[data-package-prefill]");
  const heroRotators = Array.from(document.querySelectorAll("[data-hero-rotator]"));
  const chatbots = Array.from(document.querySelectorAll("[data-chatbot]"));
  const introVideo = document.querySelector("[data-intro-video]");

  if (introVideo) {
    const playlistId = String(introVideo.dataset.introVideoPlaylistId || "").trim();
    const videoIds = String(introVideo.dataset.introVideoIds || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const storageKey = `cloudgenesisIntroVideoSeen:${playlistId || videoIds.join("|")}`;
    const frame = introVideo.querySelector("[data-intro-video-frame]");
    const closeButtons = Array.from(introVideo.querySelectorAll("[data-intro-video-close]"));
    const closeButton = introVideo.querySelector(".intro-video__close");
    let restoreFocusTarget = null;

    const hasSeenIntro = () => {
      try {
        return window.localStorage.getItem(storageKey) === "true";
      } catch (error) {
        return false;
      }
    };

    const markIntroSeen = () => {
      try {
        window.localStorage.setItem(storageKey, "true");
      } catch (error) {
        // If storage is unavailable, the intro simply behaves like a normal dismissible modal.
      }
    };

    const stopIntroVideo = () => {
      if (frame) {
        frame.textContent = "";
      }
    };

    const closeIntroVideo = ({ restoreFocus = false } = {}) => {
      introVideo.hidden = true;
      document.body.classList.remove("has-intro-video-open");
      stopIntroVideo();

      if (restoreFocus && restoreFocusTarget && typeof restoreFocusTarget.focus === "function") {
        restoreFocusTarget.focus();
      }
    };

    const openIntroVideo = () => {
      if ((!playlistId && videoIds.length === 0) || !frame || hasSeenIntro()) {
        return;
      }

      const searchParams = new URLSearchParams({
        autoplay: "1",
        playsinline: "1",
        rel: "0",
        modestbranding: "1",
      });
      let embedPath = "videoseries";

      if (playlistId) {
        searchParams.set("list", playlistId);
      } else {
        const [firstVideoId] = videoIds;
        embedPath = encodeURIComponent(firstVideoId);

        if (videoIds.length > 1) {
          searchParams.set("playlist", videoIds.join(","));
        }
      }

      restoreFocusTarget = document.activeElement;
      markIntroSeen();
      introVideo.hidden = false;
      document.body.classList.add("has-intro-video-open");
      frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${embedPath}?${searchParams.toString()}" title="CloudGenesis intro video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;

      window.requestAnimationFrame(() => {
        if (closeButton) {
          closeButton.focus();
        }
      });
    };

    closeButtons.forEach((button) => {
      button.addEventListener("click", () => closeIntroVideo({ restoreFocus: true }));
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !introVideo.hidden) {
        closeIntroVideo({ restoreFocus: true });
      }
    });

    window.requestAnimationFrame(openIntroVideo);
  }

  heroRotators.forEach((rotator) => {
    const images = Array.from(rotator.querySelectorAll("[data-hero-rotator-image]"));
    const controls = Array.from(rotator.querySelectorAll("[data-hero-rotator-control]"));

    if (images.length < 2) {
      return;
    }

    let activeIndex = images.findIndex((image) => image.classList.contains("is-active"));
    activeIndex = activeIndex >= 0 ? activeIndex : 0;

    const setActiveSlide = (nextIndex) => {
      if (nextIndex === activeIndex || nextIndex < 0 || nextIndex >= images.length) {
        return;
      }

      images[activeIndex].classList.remove("is-active");
      images[activeIndex].setAttribute("aria-hidden", "true");
      images[nextIndex].classList.add("is-active");
      images[nextIndex].setAttribute("aria-hidden", "false");

      controls.forEach((control, index) => {
        const isActive = index === nextIndex;
        control.classList.toggle("is-active", isActive);
        control.setAttribute("aria-pressed", String(isActive));
      });

      activeIndex = nextIndex;
    };

    let rotationTimer = null;
    const startRotation = () => {
      if (rotationTimer === null && !reducedMotionQuery.matches) {
        rotationTimer = window.setInterval(() => {
          setActiveSlide((activeIndex + 1) % images.length);
        }, 10000);
      }
    };

    const stopRotation = () => {
      if (rotationTimer !== null) {
        window.clearInterval(rotationTimer);
        rotationTimer = null;
      }
    };

    const updateRotation = () => {
      if (reducedMotionQuery.matches) {
        stopRotation();
        return;
      }

      startRotation();
    };

    images.forEach((image, index) => {
      const isActive = index === activeIndex;
      image.classList.toggle("is-active", isActive);
      image.setAttribute("aria-hidden", String(!isActive));
    });

    controls.forEach((control, index) => {
      const isActive = index === activeIndex;
      control.classList.toggle("is-active", isActive);
      control.setAttribute("aria-pressed", String(isActive));
      control.addEventListener("click", () => {
        stopRotation();
        setActiveSlide(index);
        startRotation();
      });
    });

    updateRotation();
    addMediaQueryChangeListener(reducedMotionQuery, updateRotation);
  });

  chatbots.forEach((chatbot) => {
    const endpoint = chatbot.dataset.chatbotEndpoint;
    const toggleButton = chatbot.querySelector("[data-chatbot-toggle]");
    const closeButton = chatbot.querySelector("[data-chatbot-close]");
    const panel = chatbot.querySelector("[data-chatbot-panel]");
    const form = chatbot.querySelector("[data-chatbot-form]");
    const input = chatbot.querySelector("[data-chatbot-input]");
    const messages = chatbot.querySelector("[data-chatbot-messages]");
    const status = chatbot.querySelector("[data-chatbot-status]");
    const suggestionButtons = Array.from(chatbot.querySelectorAll("[data-chatbot-suggestion]"));
    const sendButton = form ? form.querySelector("button[type='submit']") : null;

    if (!endpoint || !toggleButton || !panel || !form || !input || !messages || !sendButton) {
      return;
    }

    const pause = (delay) => new Promise((resolve) => {
      window.setTimeout(resolve, delay);
    });

    const setChatStatus = (message, state = "") => {
      if (!status) {
        return;
      }

      status.textContent = message;
      status.classList.toggle("is-error", state === "error");
    };

    const appendMessage = (message, type = "bot") => {
      const item = document.createElement("p");
      item.className = `chatbot__message chatbot__message--${type}`;
      item.textContent = message;
      messages.appendChild(item);
      messages.scrollTop = messages.scrollHeight;
      return item;
    };

    const appendTypingIndicator = () => {
      const item = document.createElement("p");
      item.className = "chatbot__message chatbot__message--bot chatbot__message--typing";
      item.setAttribute("aria-label", "CloudGenesis Assistant is typing");

      for (let index = 0; index < 3; index += 1) {
        const dot = document.createElement("span");
        dot.setAttribute("aria-hidden", "true");
        item.appendChild(dot);
      }

      messages.appendChild(item);
      messages.scrollTop = messages.scrollHeight;
      return item;
    };

    const revealBotMessage = async (item, message) => {
      item.classList.remove("chatbot__message--typing");
      item.removeAttribute("aria-label");
      item.textContent = "";

      if (reducedMotionQuery.matches) {
        item.textContent = message;
        messages.scrollTop = messages.scrollHeight;
        return;
      }

      for (const character of message) {
        item.textContent += character;
        messages.scrollTop = messages.scrollHeight;
        await pause(character === " " ? 8 : 14);
      }
    };

    const setPanelOpen = (isOpen, { restoreFocus = false } = {}) => {
      panel.hidden = !isOpen;
      toggleButton.setAttribute("aria-expanded", String(isOpen));

      if (isOpen) {
        window.requestAnimationFrame(() => input.focus());
      } else if (restoreFocus) {
        toggleButton.focus();
      }
    };

    toggleButton.addEventListener("click", () => {
      const isOpen = toggleButton.getAttribute("aria-expanded") === "true";
      setPanelOpen(!isOpen, { restoreFocus: isOpen });
    });

    if (closeButton) {
      closeButton.addEventListener("click", () => {
        setPanelOpen(false, { restoreFocus: true });
      });
    }

    const sendChatMessage = async (message) => {
      if (!message || message.length > 500) {
        setChatStatus("Please enter a valid question up to 500 characters.", "error");
        input.focus();
        return;
      }

      appendMessage(message, "user");
      input.value = "";
      input.disabled = true;
      sendButton.disabled = true;
      suggestionButtons.forEach((button) => {
        button.disabled = true;
      });
      setChatStatus("");
      const loadingMessage = appendTypingIndicator();

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ message }),
          credentials: "omit",
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok || result.success === false || !result.answer) {
          throw new Error(result.error || "The assistant is unavailable right now.");
        }

        if (!reducedMotionQuery.matches) {
          await pause(Math.min(900, Math.max(420, message.length * 18)));
        }

        await revealBotMessage(loadingMessage, result.answer);
      } catch (error) {
        await revealBotMessage(loadingMessage, "I could not reach the assistant right now. Please use the Contact Us form for specific project requirements.");
        setChatStatus(error.message || "The assistant is unavailable right now.", "error");
      } finally {
        input.disabled = false;
        sendButton.disabled = false;
        suggestionButtons.forEach((button) => {
          button.disabled = false;
        });
        input.focus();
      }
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await sendChatMessage(input.value.trim());
    });

    suggestionButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        if (input.disabled) {
          return;
        }

        await sendChatMessage(String(button.dataset.chatbotSuggestion || "").trim());
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && toggleButton.getAttribute("aria-expanded") === "true") {
        setPanelOpen(false, { restoreFocus: true });
      }
    });
  });

  pricingCards.forEach((card) => {
    const priceDisplay = card.querySelector("[data-price-display]");
    const currencyButtons = Array.from(card.querySelectorAll("[data-pricing-currency]"));

    if (!priceDisplay || currencyButtons.length === 0) {
      return;
    }

    currencyButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const currency = button.dataset.pricingCurrency || "INR";
        const value = priceDisplay.getAttribute(`data-price-${currency.toLowerCase()}`);

        if (!value) {
          return;
        }

        priceDisplay.textContent = value;

        currencyButtons.forEach((item) => {
          const isSelected = item === button;
          item.classList.toggle("is-active", isSelected);
          item.setAttribute("aria-pressed", String(isSelected));
        });
      });
    });
  });

  contactForms.forEach((form) => {
    const endpoint = form.dataset.contactEndpoint;
    const siteKey = form.dataset.turnstileSiteKey;
    const status = form.querySelector("[data-contact-status]");
    const submitButton = form.querySelector("button[type='submit']");
    const submittedAt = form.querySelector("input[name='submittedAt']");
    const turnstileContainer = form.querySelector("[data-turnstile-container]");
    let turnstileWidgetId = null;
    let turnstileToken = "";

    if (packagePrefillData) {
      const selectedPackageSlug = new URLSearchParams(window.location.search).get("package");

      if (selectedPackageSlug) {
        try {
          const packages = JSON.parse(packagePrefillData.textContent || "[]");
          const selectedPackage = packages.find((item) => item.slug === selectedPackageSlug);
          const nameField = form.querySelector("#name");
          const subjectField = form.querySelector("#subject");
          const messageField = form.querySelector("#message");

          if (selectedPackage && subjectField && messageField) {
            const features = Array.isArray(selectedPackage.features) ? selectedPackage.features : [];
            subjectField.value = `Package inquiry: ${selectedPackage.name}`;
            messageField.value = [
              `Selected package: ${selectedPackage.name}`,
              `Best for: ${selectedPackage.bestFor}`,
              "",
              "Features:",
              ...features.map((feature) => `- ${feature}`),
            ].join("\n");

            window.requestAnimationFrame(() => {
              form.scrollIntoView({ behavior: "smooth", block: "start" });

              if (nameField) {
                nameField.focus({ preventScroll: true });
              }
            });
          }
        } catch (error) {
          // Leave the contact form unchanged if package metadata cannot be parsed.
        }
      }
    }

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
        phone: String(formData.get("phone") || ""),
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
          const error = new Error(result.message || "We could not send your inquiry right now. Please try again later.");
          error.shouldResetTurnstile = true;
          throw error;
        }

        form.reset();
        if (submittedAt) {
          submittedAt.value = String(Date.now());
        }
        resetTurnstile();
        setStatus("Thanks. Your inquiry has been sent.", "success");
        window.location.assign("/thank-you/");
      } catch (error) {
        const isNetworkError = error instanceof TypeError;
        const message = isNetworkError
          ? "We could not reach the contact service. Please try again, or email contactus@cloudgenesis.in directly."
          : error.message || "We could not send your inquiry right now. Please try again later.";

        setStatus(message, "error");

        if (!isNetworkError && error.shouldResetTurnstile !== false) {
          resetTurnstile();
        }
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

  addMediaQueryChangeListener(desktopQuery, (event) => {
    if (event.matches) {
      closeMenu();
    }
  });
});
