(function () {
  'use strict';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var DEFAULT_RECIPIENT = 'a2-invest@mail.ru';
  var DEFAULT_ENDPOINT = 'https://formsubmit.co/ajax/' + DEFAULT_RECIPIENT;

  // One polite live region for the page announces errors after focus moves.
  var announcer = document.createElement('div');
  announcer.setAttribute('aria-live', 'polite');
  announcer.className = 'visually-hidden';
  document.body.appendChild(announcer);

  var announceTimer = null;
  var announcedField = null;
  var flagged = new WeakSet();
  var announced = new WeakSet();

  function linkError(el, shown) {
    var errorId = el.dataset.error;
    if (!errorId) return;
    var ids = (el.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter(function (id) { return id && id !== errorId; });
    if (shown) ids.push(errorId);
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
    else el.removeAttribute('aria-describedby');
  }

  function spokenText(node) {
    var copy = node.cloneNode(true);
    copy.querySelectorAll('[aria-hidden="true"]').forEach(function (n) { n.remove(); });
    copy.querySelectorAll('[role="img"][aria-label]').forEach(function (n) {
      n.replaceWith(n.getAttribute('aria-label') + ': ');
    });
    return copy.textContent.replace(/\s+/g, ' ').trim();
  }

  function announceError(el) {
    var errorEl = document.getElementById(el.dataset.error);
    if (!errorEl) return;
    var labelEl = el.labels && el.labels[0];
    var label = labelEl ? spokenText(labelEl) + ': ' : '';
    clearTimeout(announceTimer);
    announcer.textContent = '';
    announcedField = el;
    announceTimer = setTimeout(function () {
      announcer.textContent = label + spokenText(errorEl);
    }, 500);
  }

  function applyFieldValidity(el) {
    if (!el.setCustomValidity) return;
    el.setCustomValidity('');

    if (el.type === 'checkbox') {
      if (el.required && !el.checked) {
        el.setCustomValidity('Подтвердите согласие с Условиями использования.');
      }
      return;
    }

    var value = (el.value || '').trim();
    if (el.required && !value) {
      el.setCustomValidity('Пожалуйста, заполните это обязательное поле.');
      return;
    }

    if (el.type === 'email' && value && !EMAIL_RE.test(value)) {
      el.setCustomValidity('Введите корректный адрес электронной почты, например name@example.ru.');
    }
  }

  function isFieldUserInvalid(el) {
    if (el.classList.contains('user-invalid-fallback')) {
      return true;
    }
    if (CSS.supports && CSS.supports('selector(:user-invalid)')) {
      return el.matches(':user-invalid');
    }
    return false;
  }

  function syncAria(el, announce) {
    if (!el || !el.matches || !el.matches('input, select, textarea')) return;
    if (el.type === 'hidden' || el.closest('.hpc-field')) return;

    var invalid = isFieldUserInvalid(el);
    if (invalid) {
      if (announce && !announced.has(el)) {
        announceError(el);
        announced.add(el);
      }
      el.setAttribute('aria-invalid', 'true');
      linkError(el, true);
      flagged.add(el);
    } else if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
      el.setAttribute('aria-invalid', 'false');
      linkError(el, false);
      flagged.delete(el);
      announced.delete(el);
      if (announcedField === el) {
        clearTimeout(announceTimer);
        announcer.textContent = '';
      }
    }
  }

  function initFallbackForForm(form) {
    if (CSS.supports && CSS.supports('selector(:user-invalid)')) return;

    var dirtyState = new WeakMap();

    function updateFallback(input) {
      applyFieldValidity(input);
      var isValid = input.validity.valid;
      input.classList.toggle('user-invalid-fallback', !isValid);
      input.classList.toggle('user-valid-fallback', isValid);
      syncAria(input, false);
    }

    form.addEventListener('invalid', function (e) {
      var input = e.target;
      if (!input.checkValidity) return;
      dirtyState.set(input, { hasInteracted: true, hasBlurred: true });
      updateFallback(input);
    }, true);

    form.addEventListener('input', function (e) {
      var input = e.target;
      if (!input.checkValidity) return;
      var state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
      state.hasInteracted = true;
      dirtyState.set(input, state);
      if (state.hasBlurred) updateFallback(input);
    });

    form.addEventListener('change', function (e) {
      var input = e.target;
      if (!input.checkValidity) return;
      var state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
      state.hasInteracted = true;
      dirtyState.set(input, state);
      if (state.hasBlurred || input.type === 'checkbox') updateFallback(input);
    });

    form.addEventListener('blur', function (e) {
      var input = e.target;
      if (!input.checkValidity) return;
      var state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
      state.hasBlurred = true;
      dirtyState.set(input, state);
      if (state.hasInteracted) updateFallback(input);
    }, true);

    form.addEventListener('reset', function () {
      Array.prototype.forEach.call(form.elements, function (control) {
        dirtyState.delete(control);
        control.classList.remove('user-invalid-fallback', 'user-valid-fallback');
        if (control.matches && control.matches('input, select, textarea')) {
          control.setAttribute('aria-invalid', 'false');
          linkError(control, false);
        }
      });
    }, true);
  }

  function buildMailtoHref(payload) {
    var subject = 'Заявка с сайта А2-ИНВЕСТ от ' + payload.name;
    var body = [
      'Имя: ' + payload.name,
      'Эл. почта: ' + payload.email,
      'Город: ' + payload.city,
      '',
      'Сообщение:',
      payload.message
    ].join('\n');
    return 'mailto:' + DEFAULT_RECIPIENT +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
  }

  function showStatus(statusEl, type, message, mailtoUrl) {
    statusEl.className = 'form-status is-visible ' + (type === 'success' ? 'is-success' : 'is-error');
    statusEl.textContent = '';

    var p = document.createElement('div');
    p.textContent = message;
    statusEl.appendChild(p);

    if (mailtoUrl) {
      var actions = document.createElement('div');
      actions.className = 'form-status-actions';
      var link = document.createElement('a');
      link.className = 'form-mailto-btn';
      link.href = mailtoUrl;
      link.textContent = 'Отправить через почтовый клиент (' + DEFAULT_RECIPIENT + ')';
      actions.appendChild(link);
      statusEl.appendChild(actions);
    }
  }

  function initForm(form) {
    var statusEl = form.parentElement.querySelector('.form-status');
    var submitBtn = form.querySelector('button[type="submit"]');
    var submitLabel = submitBtn ? submitBtn.querySelector('span') : null;
    var defaultBtnText = submitLabel ? submitLabel.textContent : 'Отправить';

    form.setAttribute('novalidate', '');
    initFallbackForForm(form);

    form.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (el.type === 'hidden' || el.closest('.hpc-field')) return;
      el.setAttribute('aria-invalid', 'false');
    });

    form.addEventListener('blur', function (e) {
      if (e.target.closest('.hpc-field')) return;
      applyFieldValidity(e.target);
      syncAria(e.target, true);
    }, true);

    form.addEventListener('input', function (e) {
      if (e.target.closest('.hpc-field')) return;
      applyFieldValidity(e.target);
      if (e.target.validity && e.target.validity.valid) {
        e.target.classList.remove('user-invalid-fallback');
      }
      if (e.target.hasAttribute('aria-invalid')) {
        syncAria(e.target, false);
      }
    });

    form.addEventListener('change', function (e) {
      if (e.target.closest('.hpc-field')) return;
      applyFieldValidity(e.target);
      if (e.target.validity && e.target.validity.valid) {
        e.target.classList.remove('user-invalid-fallback');
      }
      syncAria(e.target, true);
    }, true);

    form.addEventListener('invalid', function (e) {
      announced.add(e.target);
      syncAria(e.target, false);
    }, true);

    form.addEventListener('reset', function () {
      setTimeout(function () {
        Array.prototype.forEach.call(form.elements, function (el) {
          if (el.setCustomValidity) el.setCustomValidity('');
          el.classList.remove('user-invalid-fallback', 'user-valid-fallback');
          syncAria(el, false);
        });
      }, 0);
    }, true);

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var controls = Array.prototype.slice.call(form.elements).filter(function (el) {
        return el.matches && el.matches('input, select, textarea') && el.type !== 'hidden' && !el.closest('.hpc-field');
      });

      var firstInvalid = null;
      controls.forEach(function (el) {
        applyFieldValidity(el);
        if (!el.checkValidity()) {
          if (!firstInvalid) firstInvalid = el;
          el.classList.add('user-invalid-fallback');
          syncAria(el, false);
        } else {
          el.classList.remove('user-invalid-fallback');
          syncAria(el, false);
        }
      });

      if (firstInvalid) {
        firstInvalid.focus();
        var errEl = firstInvalid.dataset.error ? document.getElementById(firstInvalid.dataset.error) : null;
        if (errEl) {
          var labelEl = firstInvalid.labels && firstInvalid.labels[0];
          var label = labelEl ? spokenText(labelEl) + ': ' : '';
          announcer.textContent = label + spokenText(errEl);
        }
        return;
      }

      var honeypot = form.querySelector('input[name="_honey"], textarea[name="_honey"]');
      if (honeypot && honeypot.value.trim() !== '') {
        // Silently ignore automated bot submissions.
        form.reset();
        if (statusEl) {
          showStatus(statusEl, 'success', 'Спасибо! Ваше сообщение отправлено.');
        }
        return;
      }

      var payload = {
        name: (form.elements.name.value || '').trim(),
        email: (form.elements.email.value || '').trim(),
        city: (form.elements.city.value || '').trim(),
        message: (form.elements.message.value || '').trim(),
        _subject: 'Новая заявка с сайта А2-ИНВЕСТ',
        _template: 'table',
        _captcha: 'false',
        _honey: ''
      };

      var endpoint = form.dataset.endpoint || DEFAULT_ENDPOINT;

      if (submitBtn) {
        submitBtn.disabled = true;
        if (submitLabel) submitLabel.textContent = 'Отправка...';
      }
      if (statusEl) {
        statusEl.className = 'form-status';
        statusEl.textContent = '';
      }

      if (window.location.protocol === 'file:') {
        if (submitBtn) {
          submitBtn.disabled = false;
          if (submitLabel) submitLabel.textContent = defaultBtnText;
        }
        if (statusEl) {
          showStatus(
            statusEl,
            'error',
            'Локальный просмотр (file://): форма готова к отправке на сайте (HTTPS). Вы также можете отправить заявку напрямую через почтовый клиент:',
            buildMailtoHref(payload)
          );
        }
        return;
      }

      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            if (!res.ok || data.success === false || data.success === 'false') {
              throw new Error(data.message || 'Ошибка отправки формы');
            }
            return data;
          });
        })
        .then(function () {
          form.reset();
          if (statusEl) {
            showStatus(
              statusEl,
              'success',
              'Спасибо! Ваша заявка успешно отправлена. Мы свяжемся с вами в ближайшее время.'
            );
          }
        })
        .catch(function () {
          if (statusEl) {
            showStatus(
              statusEl,
              'error',
              'Не удалось отправить сообщение автоматически. Пожалуйста, отправьте заявку через почтовый клиент или напишите на ' + DEFAULT_RECIPIENT + '.',
              buildMailtoHref(payload)
            );
          }
        })
        .finally(function () {
          if (submitBtn) {
            submitBtn.disabled = false;
            if (submitLabel) submitLabel.textContent = defaultBtnText;
          }
        });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('form.js-contact-form').forEach(initForm);
  });
})();
