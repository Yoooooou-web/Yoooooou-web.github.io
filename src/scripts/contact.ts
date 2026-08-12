function initContactSelect() {
  const customSelects =
    document.querySelectorAll<HTMLElement>(".custom-select");

  customSelects.forEach((customSelect) => {
    if (customSelect.dataset.initialized === "true") return;

    customSelect.dataset.initialized = "true";

    const trigger =
      customSelect.querySelector<HTMLButtonElement>(
        ".custom-select-trigger"
      );

    const valueText =
      customSelect.querySelector<HTMLElement>(
        ".custom-select-value"
      );

    const hiddenInput =
      customSelect.querySelector<HTMLInputElement>(
        'input[type="hidden"]'
      );

    const optionsPanel =
      customSelect.querySelector<HTMLElement>(
        ".custom-select-options"
      );

    const options = Array.from(
      customSelect.querySelectorAll<HTMLButtonElement>(
        ".custom-select-option"
      )
    );

    if (
      !trigger ||
      !valueText ||
      !hiddenInput ||
      !optionsPanel ||
      options.length === 0
    ) {
      return;
    }

    let activeIndex = 0;

    const isOpen = () =>
      trigger.getAttribute("aria-expanded") === "true";

    const setOpen = (
      open: boolean,
      focusOption = false
    ) => {
      trigger.setAttribute(
        "aria-expanded",
        String(open)
      );

      optionsPanel.setAttribute(
        "aria-hidden",
        String(!open)
      );

      customSelect.classList.toggle("is-open", open);

      if (open) {
        const selectedIndex = options.findIndex(
          (option) =>
            option.getAttribute("aria-selected") === "true"
        );

        if (selectedIndex >= 0) {
          activeIndex = selectedIndex;
        }

        if (focusOption) {
          requestAnimationFrame(() => {
            options[activeIndex]?.focus();
          });
        }
      }
    };

    const closeSelect = (
      returnFocus = false
    ) => {
      setOpen(false);

      if (returnFocus) {
        trigger.focus();
      }
    };

    const focusOption = (index: number) => {
      if (index < 0) {
        activeIndex = options.length - 1;
      } else if (index >= options.length) {
        activeIndex = 0;
      } else {
        activeIndex = index;
      }

      options[activeIndex]?.focus();
    };

    const selectOption = (
      option: HTMLButtonElement
    ) => {
      options.forEach((item) => {
        item.setAttribute(
          "aria-selected",
          String(item === option)
        );
      });

      const selectedText =
        option.textContent?.trim() ?? "";

      hiddenInput.value = selectedText;
      valueText.textContent = selectedText;

      customSelect.classList.add("has-value");
      trigger.removeAttribute("aria-invalid");

      customSelect
        .closest<HTMLElement>(".contact-field")
        ?.classList.remove("has-error");

      hiddenInput.dispatchEvent(
        new Event("input", { bubbles: true })
      );

      hiddenInput.dispatchEvent(
        new Event("change", { bubbles: true })
      );

      closeSelect(true);
    };

    trigger.addEventListener("click", () => {
      setOpen(!isOpen());
    });

    trigger.addEventListener("keydown", (event) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          activeIndex = Math.max(activeIndex, 0);
          setOpen(true, true);
          break;

        case "ArrowUp":
          event.preventDefault();
          activeIndex = options.length - 1;
          setOpen(true, true);
          break;

        case "Enter":
        case " ":
          event.preventDefault();
          setOpen(!isOpen());
          break;

        case "Escape":
          if (isOpen()) {
            event.preventDefault();
            closeSelect();
          }
          break;
      }
    });

    options.forEach((option, index) => {
      option.addEventListener("mouseenter", () => {
        activeIndex = index;
      });

      option.addEventListener("click", () => {
        selectOption(option);
      });

      option.addEventListener("keydown", (event) => {
        switch (event.key) {
          case "ArrowDown":
            event.preventDefault();
            focusOption(activeIndex + 1);
            break;

          case "ArrowUp":
            event.preventDefault();
            focusOption(activeIndex - 1);
            break;

          case "Home":
            event.preventDefault();
            focusOption(0);
            break;

          case "End":
            event.preventDefault();
            focusOption(options.length - 1);
            break;

          case "Enter":
          case " ":
            event.preventDefault();
            selectOption(option);
            break;

          case "Escape":
            event.preventDefault();
            closeSelect(true);
            break;

          case "Tab":
            closeSelect();
            break;
        }
      });
    });

    document.addEventListener("pointerdown", (event) => {
      const target = event.target;

      if (
        target instanceof Node &&
        !customSelect.contains(target)
      ) {
        closeSelect();
      }
    });
  });
}

function resetContactSelect(
  form: HTMLFormElement
) {
  const customSelect =
    form.querySelector<HTMLElement>(
      ".custom-select"
    );

  const hiddenInput =
    customSelect?.querySelector<HTMLInputElement>(
      'input[type="hidden"]'
    );

  const trigger =
    customSelect?.querySelector<HTMLButtonElement>(
      ".custom-select-trigger"
    );

  const valueText =
    customSelect?.querySelector<HTMLElement>(
      ".custom-select-value"
    );

  const optionsPanel =
    customSelect?.querySelector<HTMLElement>(
      ".custom-select-options"
    );

  const options =
    customSelect?.querySelectorAll<HTMLButtonElement>(
      ".custom-select-option"
    );

  if (
    !customSelect ||
    !hiddenInput ||
    !trigger ||
    !valueText ||
    !optionsPanel ||
    !options
  ) {
    return;
  }

  hiddenInput.value = "";

  valueText.textContent =
    valueText.dataset.placeholder ?? "";

  customSelect.classList.remove(
    "has-value",
    "is-open"
  );

  trigger.setAttribute(
    "aria-expanded",
    "false"
  );

  trigger.removeAttribute(
    "aria-invalid"
  );

  customSelect
    .closest<HTMLElement>(".contact-field")
    ?.classList.remove("has-error");

  optionsPanel.setAttribute(
    "aria-hidden",
    "true"
  );

  options.forEach((option) => {
    option.setAttribute(
      "aria-selected",
      "false"
    );
  });
}


function initContactForm() {
  const forms =
    document.querySelectorAll<HTMLFormElement>(
      "[data-contact-form]"
    );

  forms.forEach((form) => {
    if (
      form.dataset.initialized === "true"
    ) {
      return;
    }

    const submitButton =
      form.querySelector<HTMLButtonElement>(
        ".contact-submit"
      );

    const submitLabel =
      form.querySelector<HTMLElement>(
        "[data-contact-submit-label]"
      );

    const status =
      form.querySelector<HTMLElement>(
        "[data-contact-form-status]"
      );

    const nameInput =
      form.querySelector<HTMLInputElement>(
        "#contact-name"
      );

    const emailInput =
      form.querySelector<HTMLInputElement>(
        "#contact-email"
      );

    const messageInput =
      form.querySelector<HTMLTextAreaElement>(
        "#contact-message"
      );

    const subjectInput =
      form.querySelector<HTMLInputElement>(
        'input[name="subject"]'
      );

    const subjectTrigger =
      form.querySelector<HTMLButtonElement>(
        ".custom-select-trigger"
      );

    if (
      !submitButton ||
      !submitLabel ||
      !status ||
      !nameInput ||
      !emailInput ||
      !messageInput ||
      !subjectInput ||
      !subjectTrigger
    ) {
      return;
    }

    form.dataset.initialized = "true";

    /*
     * JS正常运行时关闭浏览器原生气泡。
     * 如果JS加载失败，HTML中的required仍然
     * 可以提供原生验证作为后备。
     */
    form.noValidate = true;

    const nativeFields = [
      nameInput,
      emailInput,
      messageInput,
    ];

    const subjectField =
      subjectTrigger.closest<HTMLElement>(
        ".contact-field"
      );

    const originalSubmitText =
      submitLabel.textContent?.trim() ?? "";

    const messages = {
      sending:
        form.dataset.messageSending ??
        "Sending...",

      success:
        form.dataset.messageSuccess ??
        "Sent.",

      error:
        form.dataset.messageError ??
        "Unable to send. Please try again.",

      subjectRequired:
        form.dataset
          .messageSubjectRequired ??
        "Please select a subject.",
    };

    let isSubmitting = false;

    const setStatus = (
      message = "",
      state = ""
    ) => {
      status.textContent = message;

      if (state) {
        status.dataset.state = state;
      } else {
        delete status.dataset.state;
      }
    };

    const setSubmitting = (
      submitting: boolean
    ) => {
      isSubmitting = submitting;
      submitButton.disabled = submitting;

      form.setAttribute(
        "aria-busy",
        String(submitting)
      );

      submitLabel.textContent =
        submitting
          ? messages.sending
          : originalSubmitText;
    };

    const clearNativeFieldError = (
      field:
        | HTMLInputElement
        | HTMLTextAreaElement
    ) => {
      field.removeAttribute("aria-invalid");

      field
        .closest<HTMLElement>(
          ".contact-field"
        )
        ?.classList.remove("has-error");
    };

    const showNativeFieldError = (
      field:
        | HTMLInputElement
        | HTMLTextAreaElement
    ) => {
      field.setAttribute(
        "aria-invalid",
        "true"
      );

      field
        .closest<HTMLElement>(
          ".contact-field"
        )
        ?.classList.add("has-error");

      /*
       * validationMessage由浏览器生成，
       * 因此文字会跟随访客的浏览器语言。
       */
      setStatus(
        field.validationMessage,
        "error"
      );

      field.focus();
    };

    const validateNativeField = (
      field:
        | HTMLInputElement
        | HTMLTextAreaElement
    ) => {
      if (field.validity.valid) {
        return true;
      }

      showNativeFieldError(field);
      return false;
    };

    const clearSubjectError = () => {
      subjectTrigger.removeAttribute(
        "aria-invalid"
      );

      subjectField?.classList.remove(
        "has-error"
      );
    };

    form.addEventListener(
      "input",
      (event) => {
        const target = event.target;

        if (
          target instanceof
            HTMLInputElement ||
          target instanceof
            HTMLTextAreaElement
        ) {
          clearNativeFieldError(target);
        }

        if (
          status.dataset.state ===
            "error" ||
          status.dataset.state ===
            "success"
        ) {
          setStatus();
        }
      }
    );

    form.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        if (isSubmitting) return;

        /*
         * 每次提交前先清除上一次的
         * 字段错误状态。
         */
        nativeFields.forEach(
          clearNativeFieldError
        );

        clearSubjectError();

        /*
         * 按页面中的字段顺序检查。
         */
        if (
          !validateNativeField(nameInput)
        ) {
          return;
        }

        if (
          !validateNativeField(emailInput)
        ) {
          return;
        }

        /*
         * 咨询类型是自定义下拉菜单，
         * 无法使用原生required验证。
         */
        if (!subjectInput.value) {
          subjectTrigger.setAttribute(
            "aria-invalid",
            "true"
          );

          subjectField?.classList.add(
            "has-error"
          );

          setStatus(
            messages.subjectRequired,
            "error"
          );

          subjectTrigger.focus();
          return;
        }

        if (
          !validateNativeField(messageInput)
        ) {
          return;
        }

        setSubmitting(true);

        setStatus(
          messages.sending,
          "sending"
        );

        try {
          const response =
            await fetch(form.action, {
              method: "POST",

              body: new FormData(form),

              headers: {
                Accept: "application/json",
              },
            });

          if (!response.ok) {
            throw new Error(
              `Formspree returned ${response.status}`
            );
          }

          form.reset();
          resetContactSelect(form);

          setStatus(
            messages.success,
            "success"
          );
        } catch (error) {
          console.error(
            "Contact form submission failed:",
            error
          );

          setStatus(
            messages.error,
            "error"
          );
        } finally {
          setSubmitting(false);
        }
      }
    );
  });
}

function initContactPage() {
  initContactSelect();
  initContactForm();
}

initContactPage();

document.addEventListener(
  "astro:page-load",
  initContactPage
);